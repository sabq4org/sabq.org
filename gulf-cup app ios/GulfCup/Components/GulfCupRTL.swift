import SwiftUI

// RTL عربي ثابت — تطبيق خليجي 27 عربي بالكامل في النسخة الأولى.
private struct GulfCupRTLModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .environment(\.layoutDirection, .rightToLeft)
            .environment(\.locale, Locale(identifier: "ar-SA@calendar=gregorian;numbers=latn"))
            .multilineTextAlignment(.leading)
    }
}

extension View {
    func gulfCupRTL() -> some View {
        modifier(GulfCupRTLModifier())
    }
}
