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

extension String {
    /// يفرض اتجاه فقرة RTL حتى لو بدأ النص بحروف لاتينية (مثل «NHC والهلال…»).
    /// بدون ذلك يختار Unicode اتجاه LTR من أول حرف قوي فتنحاز العناوين لليسار.
    var sabqForcedRTL: AttributedString {
        let paragraph = NSMutableParagraphStyle()
        paragraph.baseWritingDirection = .rightToLeft
        paragraph.alignment = .natural
        let ns = NSAttributedString(
            string: self,
            attributes: [.paragraphStyle: paragraph]
        )
        return AttributedString(ns)
    }
}
