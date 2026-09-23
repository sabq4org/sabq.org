import SwiftUI

extension View {
    /// تأثير حافة التمرير الناعم تحت شريط التنقل الزجاجي.
    ///
    /// على iOS 26+ شريط التنقل شفاف ويعتمد على تأثير حافة يُخفي المحتوى تحته؛
    /// شاشاتنا تضع `ScrollView` داخل `GeometryReader` فلا يُطبَّق التأثير
    /// تلقائيًا، وينزلق نص الخبر تحت الساعة والأزرار (مراجعة 10.3.3). نطلبه
    /// صراحةً هنا. iOS 17–18 يعطي الشريط خلفية عند التمرير من تلقاء نفسه.
    @ViewBuilder
    func sabqNavigationEdge() -> some View {
        if #available(iOS 26.0, *) {
            self.scrollEdgeEffectStyle(.soft, for: .top)
        } else {
            self
        }
    }
}
