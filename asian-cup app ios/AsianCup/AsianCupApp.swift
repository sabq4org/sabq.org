import SwiftUI

@main
struct AsianCupApp: App {
    @State private var auth = AcAuthStore.shared

    init() {
        // سجّل خط IBM Plex Sans Arabic قبل أي واجهة تستعمله.
        FontRegistration.registerAll()
    }

    var body: some Scene {
        WindowGroup {
            AsianCupView()
                .environment(auth)
                .asianCupRTL()
                .preferredColorScheme(.light) // هوية فاتحة باردة محايدة لكل المنتخبات
                .task { await auth.restore() }
        }
    }
}
