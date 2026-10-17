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
                    // Outer column: page header → contact-method blocks →
                    // grey section band → the unboxed "send a message" form.
                    VStack(alignment: .leading, spacing: SabqLayout.space24) {
                        sheetHeading(title: "تواصل معنا", subtitle: "اختر طريقة التواصل الأنسب لك")

                        // Two contact-method blocks at the top — matches the
                        // web /contact page. Tapping opens WhatsApp / Mail.
                        contactMethodCards

                        SabqSectionBand()

                        if isSent {
                            EmptyStateView(
                                icon: "checkmark.circle.fill",
                                tint: SabqTheme.success,
                                title: "تم استلام رسالتك",
                                subtitle: "شكراً لتواصلك معنا، سيتم الرد عليك قريباً"
                            )
                        } else {
                            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                                sheetHeading(title: "أرسل رسالة", subtitle: "املأ النموذج وسنرد عليك في أقرب وقت")
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
                                    .padding(.top, SabqLayout.space4)
                            }

                            // Trailing spacer so the message editor's bottom
                            // edge can clear the keyboard when focused near
                            // the bottom of the sheet.
                            Color.clear.frame(height: 80)
                        }
                    }
                    .padding(.horizontal, SabqLayout.pageMargin)
                    .padding(.vertical, SabqLayout.space24)
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
            .sabqNavigationEdge()
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
                        .font(SabqType.button.font)
                        .foregroundStyle(SabqTheme.primary)
                }
            }
            .onAppear { prefillFromUser() }
        }
    }

    // MARK: - Contact-method blocks (WhatsApp + Email — matches the web)

    private func sheetHeading(title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            Text(title)
                .sabqText(SabqType.sectionHeading)
                .foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Text(subtitle)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var contactMethodCards: some View {
        HStack(spacing: SabqLayout.space12) {
            Link(destination: whatsAppURL) {
                contactMethodCard(
                    icon: "message",
                    title: "واتساب",
                    value: whatsAppNumber
                )
            }
            .buttonStyle(.plain)

            Link(destination: emailURL) {
                contactMethodCard(
                    icon: "envelope",
                    title: "البريد الإلكتروني",
                    value: supportEmail
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func contactMethodCard(icon: String, title: String, value: String) -> some View {
        VStack(spacing: SabqLayout.space8) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 22))
                .foregroundStyle(SabqTheme.primary)
                .frame(height: 28)
                .accessibilityHidden(true)

            Text(title)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)

            Text(value)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
                .environment(\.layoutDirection, .leftToRight)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space16)
        .padding(.horizontal, SabqLayout.space12)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.surfaceMuted)
        )
        .contentShape(Rectangle())
    }

    // MARK: - Field helpers

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .sabqText(SabqType.metaEmphasis)
            .foregroundStyle(SabqTheme.textPrimary)
    }

    private func focusRing(_ isFocused: Bool) -> some View {
        RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
            .stroke(isFocused ? SabqTheme.primary : Color.clear, lineWidth: 1)
    }

    private func labeledField(
        label: String,
        placeholder: String,
        text: Binding<String>,
        keyboard: UIKeyboardType = .default,
        disableAutocap: Bool = false,
        field: Field
    ) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            fieldLabel(label)

            TextField(placeholder, text: text)
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textPrimary)
                .keyboardType(keyboard)
                .textInputAutocapitalization(disableAutocap ? .never : .sentences)
                .autocorrectionDisabled(disableAutocap)
                .focused($focusedField, equals: field)
                .submitLabel(.next)
                .modifier(SabqInputSurface())
                .overlay(focusRing(focusedField == field))
        }
    }

    private var subjectPicker: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            fieldLabel("موضوع الرسالة")

            Menu {
                ForEach(Self.subjectOptions, id: \.self) { option in
                    Button(option) { subject = option }
                }
            } label: {
                HStack(spacing: SabqLayout.space8) {
                    Text(subject.isEmpty ? "اختر موضوع الرسالة" : subject)
                        .sabqText(SabqType.excerpt)
                        .foregroundStyle(subject.isEmpty ? SabqTheme.textTertiary : SabqTheme.textPrimary)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.down")
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                }
                .modifier(SabqInputSurface())
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private var messageEditor: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            fieldLabel("الرسالة")

            TextEditor(text: $message)
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textPrimary)
                .focused($focusedField, equals: .message)
                .frame(minHeight: 140)
                .scrollContentBackground(.hidden)
                .padding(SabqLayout.space12)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .fill(SabqTheme.surface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .stroke(focusedField == .message ? SabqTheme.primary : SabqTheme.outline, lineWidth: 1)
                )
                .overlay(alignment: .topLeading) {
                    if message.isEmpty {
                        Text("اكتب رسالتك هنا...")
                            .sabqText(SabqType.excerpt)
                            .foregroundStyle(SabqTheme.textTertiary)
                            .padding(.horizontal, SabqLayout.space16)
                            .padding(.vertical, SabqLayout.space24)
                            .allowsHitTesting(false)
                    }
                }
        }
    }

    private var sendButton: some View {
        Button {
            Task { await send() }
        } label: {
            HStack(spacing: SabqLayout.space8) {
                if isSending { ProgressView().tint(SabqTheme.onAction) }
                Text("إرسال الرسالة")
                    .sabqText(SabqType.button)
            }
            .foregroundStyle(isFormValid ? SabqTheme.onAction : SabqTheme.disabledInk)
            .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
            .background(isFormValid ? SabqTheme.actionFill : SabqTheme.disabledFill,
                        in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
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
        HStack(spacing: SabqLayout.space8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(SabqType.meta.font)
            Text(text)
                .sabqText(SabqType.meta)
        }
        .foregroundStyle(SabqTheme.danger)
        .padding(.horizontal, SabqLayout.space12)
        .padding(.vertical, SabqLayout.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.surfaceMuted)
        )
    }
}
