import SwiftUI

/// نموذج إكمال الاسم الإلزامي بعد OTP / للجلسات القديمة بلا firstName.
/// الاسم الأول مطلوب (≥2)؛ اسم العائلة اختياري. لا يوجد تخطٍّ.
struct CompleteNameForm: View {
    @Environment(AuthStore.self) private var authStore
    var onDone: () -> Void = {}

    @State private var firstName = ""
    @State private var lastName = ""
    @State private var localError: String?
    @FocusState private var focused: Bool

    private var canSave: Bool {
        firstName.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2
    }

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "person.crop.circle.badge.plus")
                .font(SabqFonts.app(size: 36, weight: .semibold))
                .foregroundStyle(SabqTheme.primaryEnd)
                .padding(.top, 8)

            Text("أكمل اسمك")
                .font(SabqFonts.app(size: 22, weight: .bold))
                .foregroundStyle(SabqTheme.ink)

            Text("سجّلت بجوالك بنجاح. أضف اسمك ليظهر في عضويتك وتعليقاتك.")
                .font(SabqFonts.app(size: 14, weight: .regular))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            if let phone = authStore.currentUser?.phoneNumber, !phone.isEmpty {
                Text(phone)
                    .font(SabqFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                    .environment(\.layoutDirection, .leftToRight)
            }

            VStack(spacing: 12) {
                nameField(
                    label: "الاسم الأول",
                    placeholder: "مثال: أحمد",
                    text: $firstName,
                    required: true
                )
                .focused($focused)

                nameField(
                    label: "اسم العائلة (اختياري)",
                    placeholder: "مثال: العتيبي",
                    text: $lastName,
                    required: false
                )
            }

            Text("لا يمكن تعديل الاسم لاحقًا لاعتبارات مصداقية التعليقات.")
                .font(SabqFonts.app(size: 12, weight: .regular))
                .foregroundStyle(SabqTheme.tertiaryInk)
                .multilineTextAlignment(.center)

            if let err = localError ?? authStore.errorMessage {
                Text(err)
                    .font(SabqFonts.app(size: 13, weight: .regular))
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            Button {
                Task { await save() }
            } label: {
                HStack(spacing: 8) {
                    if authStore.isLoading {
                        ProgressView().tint(.white)
                    }
                    Text("متابعة")
                        .font(SabqFonts.app(size: 16, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(
                    canSave ? AnyShapeStyle(SabqTheme.brandGradient) : AnyShapeStyle(SabqTheme.primaryEnd.opacity(0.4)),
                    in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous)
                )
            }
            .buttonStyle(.plain)
            .disabled(!canSave || authStore.isLoading)
        }
        .onAppear { focused = true }
    }

    private func nameField(label: String, placeholder: String, text: Binding<String>, required: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Text(label)
                    .font(SabqFonts.app(size: 13, weight: .semibold))
                    .foregroundStyle(SabqTheme.secondaryInk)
                if required {
                    Text("*")
                        .font(SabqFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(.red)
                }
            }
            TextField("", text: text, prompt: Text(placeholder).foregroundStyle(SabqTheme.tertiaryInk))
                .font(SabqFonts.app(size: 15))
                .foregroundStyle(SabqTheme.ink)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .padding(.horizontal, 14)
                .padding(.vertical, 13)
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .fill(SabqTheme.paleFill)
                )
        }
    }

    private func save() async {
        localError = nil
        let fn = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard fn.count >= 2 else {
            localError = "الاسم الأول يجب أن يكون حرفين على الأقل"
            return
        }
        let ln = lastName.trimmingCharacters(in: .whitespacesAndNewlines)
        await authStore.updateProfile(
            firstName: fn,
            lastName: ln.count >= 2 ? ln : "",
            bio: nil,
            city: nil,
            gender: nil
        )
        if !authStore.needsDisplayName {
            onDone()
        } else if localError == nil, authStore.errorMessage == nil {
            localError = "تعذّر حفظ الاسم"
        }
    }
}
