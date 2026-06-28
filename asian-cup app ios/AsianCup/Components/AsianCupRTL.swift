import SwiftUI

// يطبّق اتجاه الكتابة (RTL/LTR) واللوكال وفق اللغة المختارة في AcLocalization.
// عند تبديل اللغة يتغيّر .id فتُعاد بناء الشجرة بالكامل لإعادة قراءة كل النصوص المترجمة.
private struct AsianCupRTLModifier: ViewModifier {
    @ObservedObject private var loc = AcLocalization.shared

    func body(content: Content) -> some View {
        content
            .environment(\.layoutDirection, loc.direction)
            .environment(\.locale, loc.locale)
            .multilineTextAlignment(.leading)
            .id(loc.language.code)
    }
}

extension View {
    func asianCupRTL() -> some View {
        modifier(AsianCupRTLModifier())
    }
}
