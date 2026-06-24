import SwiftUI

// يفرض اتجاه RTL عام + لغة عربية عبر التطبيق كله. مطابق لـ sabqRTL/asianCupRTL
// (التطبيق عربي أولًا، بلا ترجمة إنجليزية).
private struct SportsRTLModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .environment(\.layoutDirection, .rightToLeft)
            .environment(\.locale, Locale(identifier: "ar"))
            .multilineTextAlignment(.leading)
    }
}

extension View {
    func sportsRTL() -> some View {
        modifier(SportsRTLModifier())
    }
}
