import SwiftUI

private struct SabqRTLModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .environment(\.layoutDirection, .rightToLeft)
            .environment(\.locale, Locale(identifier: "ar"))
            .multilineTextAlignment(.leading)
    }
}

extension View {
    func sabqRTL() -> some View {
        modifier(SabqRTLModifier())
    }
}
