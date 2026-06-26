import WidgetKit
import SwiftUI

// نقطة دخول إضافة الويدجت — تضم Live Activity متابعة المباراة على شاشة القفل.
@main
struct SabqSportsWidgetsBundle: WidgetBundle {
    var body: some Widget {
        SpMatchLiveActivity()
    }
}
