import SwiftUI

@main
struct GulfCupApp: App {
    @State private var auth = GcAuthStore.shared

    init() {
        FontRegistration.registerAll()
    }

    var body: some Scene {
        WindowGroup {
            GulfCupView()
                .environment(auth)
                .gulfCupRTL()
                .task { await auth.restore() }
        }
    }
}
