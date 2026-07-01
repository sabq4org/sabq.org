import SwiftUI
import PhotosUI
import UIKit

// كانت هذه الورقة جزءًا من SettingsView.swift (3394 سطرًا = 8 شاشات
// في ملف واحد) — فُكّكت إلى Screens/Settings/ في تدقيق 2026-07-01.

// MARK: - Delete Account Sheet

struct DeleteAccountSheet: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(BookmarksStore.self) private var bookmarksStore
    @Environment(FollowedKeywordsStore.self) private var followedKeywords
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var confirmText = ""
    @State private var showConfirmation = false

    private let confirmWord = "حذف"

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(SabqFonts.app(size: 48, weight: .light))
                            .foregroundStyle(SabqTheme.coral)

                        Text("حذف الحساب")
                            .font(SabqFonts.app(size: 22, weight: .bold))
                            .foregroundStyle(SabqTheme.coral)
                    }
                    .frame(maxWidth: .infinity)

                    VStack(alignment: .leading, spacing: 12) {
                        Text("تحذير: هذا الإجراء لا يمكن التراجع عنه")
                            .font(SabqFonts.app(size: 15, weight: .bold))
                            .foregroundStyle(SabqTheme.coral)

                        Text("سيتم حذف حسابك وجميع بياناتك بشكل نهائي. لن تتمكن من استعادة الحساب بعد الحذف.")
                            .font(SabqFonts.app(size: 14, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .lineSpacing(5)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(SabqTheme.coral.opacity(0.06))
                    )

                    if !showConfirmation {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("كلمة المرور")
                                .font(SabqFonts.app(size: 14, weight: .semibold))
                                .foregroundStyle(SabqTheme.ink)

                            SecureField("أدخل كلمة المرور للتأكيد", text: $password)
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

                        Button {
                            withAnimation { showConfirmation = true }
                        } label: {
                            Text("متابعة")
                                .font(SabqFonts.app(size: 16, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 15)
                                .background(SabqTheme.coral, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(password.isEmpty)
                        .opacity(password.isEmpty ? 0.5 : 1)
                    } else {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("اكتب \"\(confirmWord)\" للتأكيد")
                                .font(SabqFonts.app(size: 14, weight: .semibold))
                                .foregroundStyle(SabqTheme.ink)

                            TextField(confirmWord, text: $confirmText)
                                .font(SabqFonts.app(size: 15, weight: .medium))
                                .foregroundStyle(SabqTheme.ink)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 14)
                                .background(
                                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                                        .fill(SabqTheme.paleFill)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                                        .stroke(SabqTheme.coral.opacity(0.3), lineWidth: 1)
                                )
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
                                await authStore.deleteAccount(password: password)
                                if authStore.isLoggedIn == false && authStore.errorMessage == nil {
                                    // Account is gone on the server — make sure
                                    // no shred of the user's data lingers on
                                    // this device either. Bookmarks, followed
                                    // keywords, recent searches and the image
                                    // cache all get wiped so the next user on
                                    // this device sees a clean slate.
                                    bookmarksStore.clear()
                                    followedKeywords.clear()
                                    UserDefaults.standard.removeObject(forKey: "sabq_recent_searches")
                                    ImageCache.clear()
                                    URLCache.shared.removeAllCachedResponses()
                                    dismiss()
                                }
                            }
                        } label: {
                            HStack(spacing: 10) {
                                if authStore.isLoading {
                                    ProgressView().tint(.white)
                                }
                                Text("حذف الحساب نهائياً")
                                    .font(SabqFonts.app(size: 16, weight: .bold))
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .background(SabqTheme.coral, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(confirmText != confirmWord || authStore.isLoading)
                        .opacity(confirmText == confirmWord ? 1 : 0.5)
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
}
