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
                VStack(alignment: .leading, spacing: 24) {
                    VStack(spacing: 12) {
                        Image(systemName: "lock.rotation")
                            .font(SabqFonts.app(size: 48, weight: .light))
                            .foregroundStyle(SabqTheme.primaryEnd)

                        Text("تغيير كلمة المرور")
                            .font(SabqFonts.app(size: 22, weight: .bold))
                            .foregroundStyle(SabqTheme.ink)
                    }
                    .frame(maxWidth: .infinity)

                    if success {
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(SabqFonts.app(size: 16))
                            Text("تم تغيير كلمة المرور بنجاح")
                                .font(SabqFonts.app(size: 14, weight: .semibold))
                        }
                        .foregroundStyle(SabqTheme.leaf)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(SabqTheme.leaf.opacity(0.08))
                        )
                    } else {
                        VStack(spacing: 16) {
                            secureField(label: "كلمة المرور الحالية", placeholder: "أدخل كلمة المرور الحالية", text: $currentPassword)
                            secureField(label: "كلمة المرور الجديدة", placeholder: "8 أحرف على الأقل", text: $newPassword)
                            secureField(label: "تأكيد كلمة المرور", placeholder: "أعد إدخال كلمة المرور الجديدة", text: $confirmPassword)

                            if !newPassword.isEmpty && !confirmPassword.isEmpty && newPassword != confirmPassword {
                                HStack(spacing: 6) {
                                    Image(systemName: "exclamationmark.triangle.fill")
                                        .font(SabqFonts.app(size: 12))
                                    Text("كلمتا المرور غير متطابقتين")
                                        .font(SabqFonts.app(size: 13, weight: .medium))
                                }
                                .foregroundStyle(SabqTheme.coral)
                            }
                        }

                        if let error = authStore.errorMessage {
                            HStack(spacing: 8) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .font(SabqFonts.app(size: 14))
                                Text(error)
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
                            HStack(spacing: 10) {
                                if authStore.isLoading {
                                    ProgressView().tint(.white)
                                }
                                Text("تغيير كلمة المرور")
                                    .font(SabqFonts.app(size: 16, weight: .bold))
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(!isValid || authStore.isLoading)
                        .opacity(isValid ? 1 : 0.5)
                    }
                }
                .padding(20)
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(SabqFonts.app(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
            .onDisappear { authStore.clearMessages() }
        }
    }

    private func secureField(label: String, placeholder: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            SecureField(placeholder, text: text)
                .font(SabqFonts.app(size: 15, weight: .medium))
                .foregroundStyle(SabqTheme.ink)
                .textContentType(.password)
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
    }
}
