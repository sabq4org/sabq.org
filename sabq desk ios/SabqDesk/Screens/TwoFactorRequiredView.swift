import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// Shown when the server answers `403 two_factor_required`. The session is
/// kept so the editor can enable 2FA on the web and come straight back.
struct TwoFactorRequiredView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    let message: String?

    @State private var isChecking = false

    private static let securitySettingsURL = URL(string: "https://sabq.org/settings/security")!

    var body: some View {
        DeskMessageView(title: "فعّل المصادقة الثنائية أولاً",
                        message: message ?? "يلزم تفعيل المصادقة الثنائية (2FA) على حسابك للوصول إلى مكتب سبق. فعّلها من إعدادات الأمان في موقع سبق ثم ارجع هنا.") {
            VStack(spacing: DeskLayout.space12) {
                Button("فتح إعدادات الأمان") { openURL(Self.securitySettingsURL) }
                    .buttonStyle(DeskPrimaryButtonStyle())
                Button(action: checkNow) {
                    HStack(spacing: DeskLayout.space8) {
                        if isChecking { ProgressView() }
                        Text("فعّلتها، تحقّق الآن")
                    }
                }
                .buttonStyle(DeskSecondaryButtonStyle())
                .disabled(isChecking)
                Button("تسجيل الخروج") { Task { await model.signOut() } }
                    .deskText(DeskType.metaEmphasis)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .padding(.top, DeskLayout.space8)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { checkNow() }
        }
    }

    private func checkNow() {
        guard !isChecking else { return }
        isChecking = true
        Task {
            defer { isChecking = false }
            await model.reloadIdentity()
        }
    }
}
