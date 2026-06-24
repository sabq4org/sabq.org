import SwiftUI

@main
struct SabqSportsApp: App {
    init() {
        // سجّل خط IBM Plex Sans Arabic قبل أي واجهة تستعمله.
        FontRegistration.registerAll()
    }

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .sportsRTL()
                .preferredColorScheme(.dark) // المنصّة الرياضية داكنة فاخرة
        }
    }
}
