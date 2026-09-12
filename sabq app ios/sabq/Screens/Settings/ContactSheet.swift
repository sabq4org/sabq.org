import SwiftUI
import PhotosUI
import UIKit

// كانت هذه الورقة جزءًا من SettingsView.swift (3394 سطرًا = 8 شاشات
// في ملف واحد) — فُكّكت إلى Screens/Settings/ في تدقيق 2026-07-01.

// MARK: - Contact Sheet

/// Contact form that mirrors sabq.org/contact end-to-end:
/// - Two contact-method cards at the top (WhatsApp + Email) for users who
///   prefer those channels over the form.
/// - 5-field form (name/phone/email/subject/message) submitted to
///   `POST /api/contact` (NOT under /api/v1), with messages landing in the
///   dashboard's "رسائل التواصل" inbox.
/// - `@FocusState` + `ScrollViewReader` ensures the focused field is always
///   above the keyboard, with `scrollDismissesKeyboard(.interactively)` so
///   the user can swipe to hide it.
/// - Submit errors auto-dismiss the keyboard and scroll the banner into view.
struct ContactSheet: View {
    /// Logical IDs for each scroll anchor — the focus listener uses these to
    /// scroll the active field above the keyboard.
    private enum Field: Hashable {
        case name, phone, email, subject, message, errorBanner
    }

    @Environment(\.dismiss) private var dismiss
    @Environment(AuthStore.self) private var authStore

    @State private var name = ""
    @State private var phone = "+966"
    @State private var email = ""
    @State private var subject: String = ""
    @State private var message = ""
    @State private var isSending = false
    @State private var isSent = false
    @State private var errorMessage: String?

    /// Tracks which form field has focus. We watch this and use a
    /// ScrollViewReader to bring the active field above the keyboard.
    @FocusState private var focusedField: Field?

    /// Canonical subjects — MUST match the backend Zod enum exactly, otherwise
    /// the POST returns 400 "بيانات غير صالحة". See `server/routes.ts` contact
    /// schema at the /api/contact handler.
    private static let subjectOptions = [
        "استفسار عام",
        "شراكات إعلامية",
        "شكوى",
        "اقتراح",
        "أخرى"
    ]

    /// Canonical contact methods — mirrors the two cards at the top of
    /// sabq.org/contact.
    private let whatsAppNumber = "+966 500 226 622"
    private let whatsAppURL = URL(string: "https://wa.me/966500226622")!
    private let supportEmail = "info@sabq.org"
    private var emailURL: URL { URL(string: "mailto:\(supportEmail)")! }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedEmail: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedMessage: String { message.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedPhone: String { phone.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Local mirror of the backend Zod constraints so we surface validation
    /// errors immediately instead of waiting on a round trip.
    private var isFormValid: Bool {
        guard trimmedName.count >= 2 else { return false }
        guard trimmedPhone.range(of: #"^\+966[0-9]{9}$"#, options: .regularExpression) != nil else { return false }
        guard trimmedEmail.contains("@"), trimmedEmail.contains(".") else { return false }
        guard Self.subjectOptions.contains(subject) else { return false }
        guard trimmedMessage.count >= 10 else { return false }
        return true
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    // Outer column: page header → contact-method cards →
                    // (visual gap) → form card. The form lives inside its
                    // own SurfaceCard with a separate SectionHeader so it
                    // reads as a distinct "send a message" surface, clearly
                    // separated from the quick-channel cards above.
                    VStack(alignment: .leading, spacing: 24) {
                        SectionHeader(
                            title: "تواصل معنا",
                            subtitle: "اختر طريقة التواصل الأنسب لك",
                            icon: "envelope.fill",
                            tint: SabqTheme.teal
                        )

                        // Two contact-method cards at the top — matches the
                        // web /contact page. Tapping opens WhatsApp / Mail.
                        contactMethodCards

                        // Extra breathing room above the form so the cards
                        // feel like their own row, not a header for the form.
                        Color.clear.frame(height: 8)

                        if isSent {
                            SurfaceCard(accent: SabqTheme.leaf) {
                                EmptyStateView(
                                    icon: "checkmark.circle.fill",
                                    tint: SabqTheme.leaf,
                                    title: "تم استلام رسالتك",
                                    subtitle: "شكراً لتواصلك معنا، سيتم الرد عليك قريباً"
                                )
                            }
                        } else {
                            SurfaceCard(accent: SabqTheme.primaryEnd) {
                                VStack(alignment: .leading, spacing: 16) {
                                    SectionHeader(
                                        title: "أرسل رسالة",
                                        subtitle: "املأ النموذج وسنرد عليك في أقرب وقت",
                                        icon: "square.and.pencil",
                                        tint: SabqTheme.primaryEnd
                                    )

                                    if let errorMessage {
                                        errorBanner(errorMessage)
                                            .id(Field.errorBanner)
                                    }

                                    labeledField(
                                        label: "الاسم الكامل",
                                        placeholder: "أدخل اسمك الكامل",
                                        text: $name,
                                        field: .name
                                    )
                                    .id(Field.name)

                                    labeledField(
                                        label: "رقم الهاتف",
                                        placeholder: "+966500000000",
                                        text: $phone,
                                        keyboard: .phonePad,
                                        disableAutocap: true,
                                        field: .phone
                                    )
                                    .id(Field.phone)

                                    labeledField(
                                        label: "البريد الإلكتروني",
                                        placeholder: "example@email.com",
                                        text: $email,
                                        keyboard: .emailAddress,
                                        disableAutocap: true,
                                        field: .email
                                    )
                                    .id(Field.email)

                                    subjectPicker
                                        .id(Field.subject)

                                    messageEditor
                                        .id(Field.message)

                                    sendButton
                                        .padding(.top, 4)
                                }
                            }

                            // Trailing spacer so the message editor's bottom
                            // edge can clear the keyboard when focused near
                            // the bottom of the sheet.
                            Color.clear.frame(height: 80)
                        }
                    }
                    .padding(20)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: focusedField) { _, newField in
                    guard let newField else { return }
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                        proxy.scrollTo(newField, anchor: .center)
                    }
                }
                .onChange(of: errorMessage) { _, newError in
                    guard newError != nil else { return }
                    focusedField = nil // dismiss keyboard so banner is visible
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                            proxy.scrollTo(Field.errorBanner, anchor: .top)
                        }
                    }
                }
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Label("إغلاق", systemImage: "xmark")
                            .labelStyle(.iconOnly)
                    }
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("تم") { focusedField = nil }
                        .font(SabqFonts.app(size: 15, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                }
            }
            .onAppear { prefillFromUser() }
        }
    }

    // MARK: - Contact-method cards (WhatsApp + Email — matches the web)

    private var contactMethodCards: some View {
        HStack(spacing: 12) {
            Link(destination: whatsAppURL) {
                contactMethodCard(
                    icon: "message.fill",
                    title: "واتساب",
                    value: whatsAppNumber,
                    tint: Color(red: 0.16, green: 0.74, blue: 0.42)
                )
            }
            .buttonStyle(.plain)

            Link(destination: emailURL) {
                contactMethodCard(
                    icon: "envelope.fill",
                    title: "البريد الإلكتروني",
                    value: supportEmail,
                    tint: SabqTheme.primaryEnd
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func contactMethodCard(icon: String, title: String, value: String, tint: Color) -> some View {
        VStack(spacing: 10) {
            Circle()
                .fill(tint)
                .frame(width: 44, height: 44)
                .overlay {
                    Image(systemName: icon)
                        .font(SabqFonts.app(size: 18, weight: .semibold))
                        .foregroundStyle(.white)
                }

            Text(title)
                .font(SabqFonts.app(size: 14, weight: .bold))
                .foregroundStyle(SabqTheme.ink)

            Text(value)
                .font(SabqFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(tint)
                .environment(\.layoutDirection, .leftToRight)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .padding(.horizontal, 12)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(tint.opacity(0.06))
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(tint.opacity(0.20), lineWidth: 0.5)
        )
    }

    // MARK: - Field helpers

    private func labeledField(
        label: String,
        placeholder: String,
        text: Binding<String>,
        keyboard: UIKeyboardType = .default,
        disableAutocap: Bool = false,
        field: Field
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            TextField(placeholder, text: text)
                .font(SabqFonts.app(size: 15, weight: .medium))
                .foregroundStyle(SabqTheme.ink)
                .keyboardType(keyboard)
                .textInputAutocapitalization(disableAutocap ? .never : .sentences)
                .autocorrectionDisabled(disableAutocap)
                .focused($focusedField, equals: field)
                .submitLabel(.next)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .fill(SabqTheme.paleFill)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .stroke(
                            focusedField == field ? SabqTheme.primaryEnd.opacity(0.4) : SabqTheme.outline,
                            lineWidth: focusedField == field ? 1 : 0.5
                        )
                )
        }
    }

    private var subjectPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("موضوع الرسالة")
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            Menu {
                ForEach(Self.subjectOptions, id: \.self) { option in
                    Button(option) { subject = option }
                }
            } label: {
                HStack(spacing: 10) {
                    Text(subject.isEmpty ? "اختر موضوع الرسالة" : subject)
                        .font(SabqFonts.app(size: 15, weight: .medium))
                        .foregroundStyle(subject.isEmpty ? SabqTheme.tertiaryInk : SabqTheme.ink)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.down")
                        .font(SabqFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .fill(SabqTheme.paleFill)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .stroke(SabqTheme.outline, lineWidth: 0.5)
                )
            }
            .buttonStyle(.plain)
        }
    }

    private var messageEditor: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("الرسالة")
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            TextEditor(text: $message)
                .font(SabqFonts.app(size: 15, weight: .regular))
                .foregroundStyle(SabqTheme.ink)
                .focused($focusedField, equals: .message)
                .frame(minHeight: 140)
                .scrollContentBackground(.hidden)
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .fill(SabqTheme.paleFill)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .stroke(
                            focusedField == .message ? SabqTheme.primaryEnd.opacity(0.4) : SabqTheme.outline,
                            lineWidth: focusedField == .message ? 1 : 0.5
                        )
                )
                .overlay(alignment: .topLeading) {
                    if message.isEmpty {
                        Text("اكتب رسالتك هنا...")
                            .font(SabqFonts.app(size: 15, weight: .regular))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 20)
                            .allowsHitTesting(false)
                    }
                }
        }
    }

    private var sendButton: some View {
        Button {
            Task { await send() }
        } label: {
            HStack(spacing: 8) {
                if isSending { ProgressView().tint(.white) }
                Text("إرسال الرسالة")
                    .font(SabqFonts.app(size: 16, weight: .bold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
            .opacity(isFormValid ? 1.0 : 0.55)
        }
        .buttonStyle(.plain)
        .disabled(!isFormValid || isSending)
    }

    // MARK: - Behaviour

    private func prefillFromUser() {
        guard let user = authStore.currentUser else { return }
        if name.isEmpty {
            let combined = [user.firstName, user.lastName]
                .compactMap { $0 }
                .filter { !$0.isEmpty }
                .joined(separator: " ")
            name = combined
        }
        if email.isEmpty, let userEmail = user.email, !userEmail.isEmpty {
            email = userEmail
        }
        if phone == "+966", let userPhone = user.phoneNumber, userPhone.hasPrefix("+966") {
            phone = userPhone
        }
    }

    private func send() async {
        isSending = true
        errorMessage = nil
        do {
            try await APIClient.shared.sendContactMessage(
                name: trimmedName,
                phone: trimmedPhone,
                email: trimmedEmail,
                subject: subject,
                message: trimmedMessage
            )
            isSent = true
        } catch let apiError as APIError {
            errorMessage = apiError.errorDescription ?? apiError.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isSending = false
    }

    private func errorBanner(_ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(SabqFonts.app(size: 14))
            Text(text)
                .font(SabqFonts.app(size: 13, weight: .medium))
        }
        .foregroundStyle(SabqTheme.coral)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(SabqTheme.coral.opacity(0.08))
        )
    }
}
