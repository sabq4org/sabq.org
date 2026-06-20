import SwiftUI
import WidgetKit

// نقطة دخول امتداد الويدجت. نسجّل النشاط المباشر للمباراة فقط حاليًا؛
// أي ويدجتات شاشة رئيسية مستقبلية تُضاف هنا.
@main
struct SabqWidgetsBundle: WidgetBundle {
    var body: some Widget {
        LiveMatchLiveActivity()
    }
}
