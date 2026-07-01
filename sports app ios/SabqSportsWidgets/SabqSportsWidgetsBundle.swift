import WidgetKit
import SwiftUI

// نقطة دخول إضافة الويدجت — Live Activity لشاشة القفل + ودجت «المباراة القادمة»
// للشاشة الرئيسية.
@main
struct SabqSportsWidgetsBundle: WidgetBundle {
    var body: some Widget {
        SpMatchLiveActivity()
        SpNextMatchWidget()
    }
}
