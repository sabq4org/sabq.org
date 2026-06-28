import SwiftUI

@main
struct AsianCupApp: App {
    init() {
        // سجّل خط IBM Plex Sans Arabic قبل أي واجهة تستعمله.
        FontRegistration.registerAll()
    }

    var body: some Scene {
        WindowGroup {
            AsianCupView()
                .asianCupRTL()
                .preferredColorScheme(.light) // هوية فاتحة باردة محايدة لكل المنتخبات
        }
    }
}
