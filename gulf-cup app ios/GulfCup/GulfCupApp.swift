import SwiftUI

@main
struct GulfCupApp: App {
    init() {
        // سجّل خط IBM Plex Sans Arabic قبل أي واجهة تستعمله.
        FontRegistration.registerAll()
    }

    var body: some Scene {
        WindowGroup {
            GulfCupView()
                .gulfCupRTL()
                .preferredColorScheme(.light) // هوية خليجي 27 — أخضر عميق + ذهبي
        }
    }
}
