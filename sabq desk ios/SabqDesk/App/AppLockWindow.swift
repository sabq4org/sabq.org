import SabqDeskDesign
import SabqDeskKit
import SwiftUI
import UIKit

/// What sits above the app because of the local lock.
enum AppLockCover: Equatable {
    case none
    /// Locked: the unlock screen.
    case lock
    /// Lock is on and the app is leaving the screen: hide content from the app switcher.
    case privacy
}

/// Shows the lock screen in its own window above every presented sheet or
/// dialog, so a sheet that was open when the app went to the background
/// cannot stay usable while the app is locked.
@MainActor
final class AppLockWindowPresenter {
    private var window: UIWindow?

    func update(_ cover: AppLockCover, model: AppModel, lock: AppLockController) {
        guard cover != .none else {
            dismiss()
            return
        }
        let root = Self.rootView(for: cover, model: model, lock: lock)
        if let host = window?.rootViewController as? UIHostingController<AnyView> {
            host.rootView = root
            window?.isHidden = false
            return
        }
        guard let scene = Self.windowScene else { return }
        let window = UIWindow(windowScene: scene)
        window.windowLevel = .alert + 1
        let host = UIHostingController(rootView: root)
        host.view.backgroundColor = .clear
        window.rootViewController = host
        window.makeKeyAndVisible()
        self.window = window
    }

    private func dismiss() {
        guard let window else { return }
        window.isHidden = true
        let scene = window.windowScene
        self.window = nil
        scene?.windows.first { $0.windowLevel == .normal && !$0.isHidden }?.makeKey()
    }

    private static var windowScene: UIWindowScene? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.first { $0.activationState == .foregroundActive }
            ?? scenes.first { $0.activationState == .foregroundInactive }
            ?? scenes.first
    }

    private static func rootView(for cover: AppLockCover, model: AppModel, lock: AppLockController) -> AnyView {
        let content: AnyView = cover == .lock ? AnyView(AppLockView()) : AnyView(AppPrivacyCover())
        return AnyView(
            content
                .environment(model)
                .environment(lock)
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, RiyadhTime.locale)
                .tint(DeskTheme.primary)
        )
    }
}
