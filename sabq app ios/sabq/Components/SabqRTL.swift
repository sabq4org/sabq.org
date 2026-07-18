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
    /// يفرض عزل RTL مثل `dir="rtl"` في الويب.
    /// عناوين تبدأ بلاتيني (مثل «NHC والهلال…») تظهر البداية يميناً.
    ///
    /// ملاحظة: `NSParagraphStyle.baseWritingDirection` لا يكفي مع `Text` في
    /// SwiftUI — يُعاد ترتيب الكلمات بشكل خاطئ (NHC في الوسط). عزل Unicode
    /// (RLI…PDI) يطابق سلوك المتصفح.
    var sabqForcedRTL: String {
        // U+2067 RIGHT-TO-LEFT ISOLATE … U+2069 POP DIRECTIONAL ISOLATE
        if hasPrefix("\u{2067}") { return self }
        return "\u{2067}\(self)\u{2069}"
    }
}
