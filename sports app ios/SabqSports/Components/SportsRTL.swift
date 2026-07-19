import SwiftUI

// يضبط اتجاه ولغة التطبيق حسب اللغة النشطة (SpLanguage): عربي = RTL،
// إنجليزي = LTR. النص يُحاذى `leading` فيتبع الاتجاه تلقائيًا. الشجرة تُعاد
// بناؤها عند تبديل اللغة عبر `.id(...)` في SabqSportsApp فتلتقط القيم الجديدة.
private struct SportsRTLModifier: ViewModifier {
    let lang: SpLanguage.Lang

    func body(content: Content) -> some View {
        content
            .environment(\.layoutDirection, lang.layoutDirection)
            .environment(\.locale, lang.locale)
            .multilineTextAlignment(.leading)
    }
}

extension View {
    func sportsRTL(_ lang: SpLanguage.Lang) -> some View {
        modifier(SportsRTLModifier(lang: lang))
    }
}
