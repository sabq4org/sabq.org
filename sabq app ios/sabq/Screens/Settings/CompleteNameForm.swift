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
        VStack(spacing: SabqLayout.space16) {
            Image(systemName: "person.crop.circle.badge.plus")
                .font(SabqFonts.app(size: 36, weight: .light))
                .foregroundStyle(SabqTheme.primary)
                .padding(.top, SabqLayout.space8)
                .accessibilityHidden(true)

            Text("أكمل اسمك")
                .sabqText(SabqType.leadTitle)
                .foregroundStyle(SabqTheme.textPrimary)

            Text("سجّلت بجوالك بنجاح. أضف اسمك ليظهر في عضويتك وتعليقاتك.")
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            if let phone = authStore.currentUser?.phoneNumber, !phone.isEmpty {
                Text(phone)
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .environment(\.layoutDirection, .leftToRight)
            }

            VStack(spacing: SabqLayout.space12) {
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
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textTertiary)
                .multilineTextAlignment(.center)

            if let err = localError ?? authStore.errorMessage {
                Text(err)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.danger)
                    .multilineTextAlignment(.center)
            }

            Button {
                Task { await save() }
            } label: {
                HStack(spacing: SabqLayout.space8) {
                    if authStore.isLoading {
                        ProgressView().tint(SabqTheme.onAction)
                    }
                    Text("متابعة")
                        .sabqText(SabqType.button)
                }
                .foregroundStyle(canSave ? SabqTheme.onAction : SabqTheme.disabledInk)
                .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                .background(
                    canSave ? SabqTheme.actionFill : SabqTheme.disabledFill,
                    in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                )
            }
            .buttonStyle(.plain)
            .disabled(!canSave || authStore.isLoading)
        }
        .onAppear { focused = true }
    }

    private func nameField(label: String, placeholder: String, text: Binding<String>, required: Bool) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space4) {
                Text(label)
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(SabqTheme.textSecondary)
                if required {
                    Text("*")
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.danger)
                }
            }
            TextField("", text: text, prompt: Text(placeholder).foregroundStyle(SabqTheme.textTertiary))
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textPrimary)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .modifier(SabqInputSurface())
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
