import SwiftUI
import PhotosUI
import UIKit

// كانت هذه الورقة جزءًا من SettingsView.swift (3394 سطرًا = 8 شاشات
// في ملف واحد) — فُكّكت إلى Screens/Settings/ في تدقيق 2026-07-01.

// MARK: - Change Password Sheet

struct ChangePasswordSheet: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(\.dismiss) private var dismiss
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var success = false

    private var isValid: Bool {
        !currentPassword.isEmpty && newPassword.count >= 8 && newPassword == confirmPassword
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: SabqLayout.space24) {
                    VStack(spacing: SabqLayout.space12) {
                        Image(systemName: "lock.rotation")
                            .font(SabqFonts.app(size: 40, weight: .light))
                            .foregroundStyle(SabqTheme.primary)
                            .accessibilityHidden(true)

                        Text("تغيير كلمة المرور")
                            .sabqText(SabqType.leadTitle)
                            .foregroundStyle(SabqTheme.textPrimary)
                    }
                    .frame(maxWidth: .infinity)

                    if success {
                        HStack(spacing: SabqLayout.space8) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(SabqType.excerpt.font)
                            Text("تم تغيير كلمة المرور بنجاح")
                                .sabqText(SabqType.metaEmphasis)
                        }
                        .foregroundStyle(SabqTheme.success)
                        .padding(.horizontal, SabqLayout.space16)
                        .padding(.vertical, SabqLayout.space12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                .fill(SabqTheme.surfaceMuted)
                        )
                    } else {
                        VStack(spacing: SabqLayout.space16) {
                            secureField(label: "كلمة المرور الحالية", placeholder: "أدخل كلمة المرور الحالية", text: $currentPassword)
                            secureField(label: "كلمة المرور الجديدة", placeholder: "8 أحرف على الأقل", text: $newPassword)
                            secureField(label: "تأكيد كلمة المرور", placeholder: "أعد إدخال كلمة المرور الجديدة", text: $confirmPassword)

                            if !newPassword.isEmpty && !confirmPassword.isEmpty && newPassword != confirmPassword {
                                HStack(spacing: SabqLayout.space4) {
                                    Image(systemName: "exclamationmark.triangle.fill")
                                        .font(SabqType.tag.font)
                                    Text("كلمتا المرور غير متطابقتين")
                                        .sabqText(SabqType.meta)
                                }
                                .foregroundStyle(SabqTheme.danger)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }

                        if let error = authStore.errorMessage {
                            HStack(spacing: SabqLayout.space8) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .font(SabqType.meta.font)
                                Text(error)
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

                        Button {
                            Task {
                                await authStore.changePassword(currentPassword: currentPassword, newPassword: newPassword)
                                if authStore.errorMessage == nil {
                                    withAnimation { success = true }
                                    try? await Task.sleep(for: .seconds(1.5))
                                    dismiss()
                                }
                            }
                        } label: {
                            HStack(spacing: SabqLayout.space8) {
                                if authStore.isLoading {
                                    ProgressView().tint(SabqTheme.onAction)
                                }
                                Text("تغيير كلمة المرور")
                                    .sabqText(SabqType.button)
                            }
                            .foregroundStyle(isValid ? SabqTheme.onAction : SabqTheme.disabledInk)
                            .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                            .background(isValid ? SabqTheme.actionFill : SabqTheme.disabledFill,
                                        in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(!isValid || authStore.isLoading)
                    }
                }
                .padding(.horizontal, SabqLayout.pageMargin)
                .padding(.vertical, SabqLayout.space24)
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
            }
            .onDisappear { authStore.clearMessages() }
        }
    }

    private func secureField(label: String, placeholder: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Text(label)
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(SabqTheme.textPrimary)

            SecureField(placeholder, text: text)
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textPrimary)
                .textContentType(.password)
                .modifier(SabqInputSurface())
        }
    }
}
