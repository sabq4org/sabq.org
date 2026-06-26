import SwiftUI

// يفرض اتجاه RTL عام + لغة عربية عبر التطبيق كله. مطابق لـ sabqRTL في تطبيق سبق
// (التطبيق عربي أولًا، بلا ترجمة إنجليزية).
private struct AsianCupRTLModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .environment(\.layoutDirection, .rightToLeft)
            .environment(\.locale, Locale(identifier: "ar"))
            .multilineTextAlignment(.leading)
    }
}

extension View {
    func asianCupRTL() -> some View {
        modifier(AsianCupRTLModifier())
    }
}
