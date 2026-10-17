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

    /// حسابات Apple والجوال بلا كلمة مرور، والخادم يقبل حذفها بالجلسة وحدها
    /// (بند أبل 5.1.1(v)). كان الزر معطّلًا حتى تُكتب كلمة مرور لا يملكها المستخدم.
    /// المصدر `hasPassword` من الملف الشخصي؛ وإن غاب فنحكم بمزوّد الدخول، ويصحّح
    /// الخادم أي تخمين خاطئ بـ400 فنعود إلى الحقل.
    private var requiresPassword: Bool {
        if authStore.deleteRequiresPassword { return true }
        if let hasPassword = authStore.currentUser?.hasPassword { return hasPassword }
        let provider = authStore.currentUser?.authProvider?.lowercased()
        return provider == nil || provider == "local" || provider == "email"
    }

    private var passwordStep: Bool { requiresPassword && !showConfirmation }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: SabqLayout.space24) {
                    VStack(spacing: SabqLayout.space12) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(SabqFonts.app(size: 40, weight: .light))
                            .foregroundStyle(SabqTheme.danger)
                            .accessibilityHidden(true)

                        Text("حذف الحساب")
                            .sabqText(SabqType.leadTitle)
                            .foregroundStyle(SabqTheme.textPrimary)
                    }
                    .frame(maxWidth: .infinity)

                    VStack(alignment: .leading, spacing: SabqLayout.space8) {
                        Text("تحذير: هذا الإجراء لا يمكن التراجع عنه")
                            .sabqText(SabqType.rowTitle)
                            .foregroundStyle(SabqTheme.danger)

                        Text("سيتم حذف حسابك وجميع بياناتك بشكل نهائي. لن تتمكن من استعادة الحساب بعد الحذف.")
                            .sabqText(SabqType.excerpt)
                            .foregroundStyle(SabqTheme.textSecondary)
                    }
                    .padding(SabqLayout.space16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                            .fill(SabqTheme.surfaceMuted)
                    )

                    if passwordStep {
                        VStack(alignment: .leading, spacing: SabqLayout.space8) {
                            if authStore.deleteRequiresPassword, let error = authStore.errorMessage {
                                Text(error)
                                    .sabqText(SabqType.meta)
                                    .foregroundStyle(SabqTheme.danger)
                            }
                            Text("كلمة المرور")
                                .sabqText(SabqType.metaEmphasis)
                                .foregroundStyle(SabqTheme.textPrimary)

                            SecureField("أدخل كلمة المرور للتأكيد", text: $password)
                                .sabqText(SabqType.excerpt)
                                .foregroundStyle(SabqTheme.textPrimary)
                                .textContentType(.password)
                                .modifier(SabqInputSurface())
                        }

                        Button {
                            withAnimation { showConfirmation = true }
                        } label: {
                            Text("متابعة")
                                .sabqText(SabqType.button)
                                .foregroundStyle(password.isEmpty ? SabqTheme.disabledInk : SabqTheme.onAction)
                                .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                                .background(password.isEmpty ? SabqTheme.disabledFill : SabqTheme.actionFill,
                                            in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(password.isEmpty)
                    } else {
                        VStack(alignment: .leading, spacing: SabqLayout.space8) {
                            Text("اكتب \"\(confirmWord)\" للتأكيد")
                                .sabqText(SabqType.metaEmphasis)
                                .foregroundStyle(SabqTheme.textPrimary)

                            TextField(confirmWord, text: $confirmText)
                                .sabqText(SabqType.excerpt)
                                .foregroundStyle(SabqTheme.textPrimary)
                                .modifier(SabqInputSurface())
                        }

                        if let error = authStore.errorMessage, !authStore.deleteRequiresPassword {
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
                                await authStore.deleteAccount(password: requiresPassword ? password : nil)
                                if authStore.deleteRequiresPassword {
                                    // الخادم أكّد أن للحساب كلمة مرور: نعود إلى حقلها.
                                    withAnimation { showConfirmation = false }
                                    return
                                }
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
                            HStack(spacing: SabqLayout.space8) {
                                if authStore.isLoading {
                                    ProgressView().tint(SabqTheme.danger)
                                }
                                Text("حذف الحساب نهائياً")
                                    .sabqText(SabqType.button)
                            }
                            .foregroundStyle(confirmText == confirmWord ? SabqTheme.danger : SabqTheme.disabledInk)
                            .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                            .background(
                                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                    .fill(confirmText == confirmWord ? SabqTheme.surface : SabqTheme.disabledFill)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                    .stroke(confirmText == confirmWord ? SabqTheme.danger : Color.clear, lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                        .disabled(confirmText != confirmWord || authStore.isLoading)
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
}
