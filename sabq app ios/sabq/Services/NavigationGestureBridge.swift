import SwiftUI
import UIKit

/// Re-enables the system "swipe from the leading edge to pop" gesture even on
/// screens that hide the navigation back button via
/// `.navigationBarBackButtonHidden(true)`. SwiftUI's `NavigationStack`
/// disables `interactivePopGestureRecognizer` whenever the back button is
/// suppressed because the gesture's default delegate keys off the button's
/// visibility, not its existence. Replacing the delegate with the
/// `UINavigationController` itself and gating only on stack depth restores
/// the native swipe-back across the whole app.
///
/// One file, one extension — every screen reachable through a UIKit-backed
/// navigation controller benefits automatically. Article detail, opinion
/// detail, moment-by-moment, omq list, trending, live coverage, etc., all
/// gain swipe-back without per-screen changes.
extension UINavigationController: @retroactive UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        // Only allow the swipe when there's actually somewhere to go back to;
        // otherwise the user would get a "stuck" gesture on the root view.
        viewControllers.count > 1
    }
}
