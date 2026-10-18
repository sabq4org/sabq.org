import SwiftUI

extension EnvironmentValues {
    /// عمود الأخبار على العرض العريض (Duo مفتوحًا، iPad): النقر على خبر يبدّل
    /// خبر القارئ المجاور بدل دفع صفحة جديدة. `HomeSidebarView` يفعّله لرئيسية
    /// الآيفون حين تُعرض عمودًا؛ على الهاتف يبقى `false` فلا يتغير شيء.
    @Entry var opensArticlesInReader = false
    /// محتوى يُدرج في رئيسية الآيفون تحت الرأس مباشرة — يستخدمه عمود Duo لمفتاح
    /// «الأخبار | سياق الخبر». `nil` على الهاتف.
    @Entry var homeFeedTopAccessory: AnyView? = nil
    /// يحل محل كتل الرئيسية تحت الرأس والنشرة — «سياق الخبر» في عمود Duo، فيبقى
    /// الرأس والمفتاح والنشرة ثابتة بين الوضعين ولا يُعاد بناء العمود. `nil` على الهاتف.
    @Entry var homeFeedReplacement: AnyView? = nil
}

/// رابط خبر في رئيسية الآيفون: `NavigationLink` على الهاتف، وعلى عمود الأخبار
/// العريض يفتح الخبر في القارئ (`SabqNavigationState.openInReader`) كما كانت
/// صفوف العمود تفعل، فيبقى العمود في مكانه ويُنشر «سياق الخبر».
struct ArticleLink<Label: View>: View {
    let article: Article
    @ViewBuilder var label: () -> Label
    @Environment(\.opensArticlesInReader) private var opensInReader
    @Environment(SabqNavigationState.self) private var navigation

    var body: some View {
        if opensInReader {
            Button {
                SabqHaptics.light()
                navigation.openInReader(article)
            } label: {
                label()
            }
        } else {
            NavigationLink(value: article) { label() }
        }
    }
}

/// رابط بقيمة لأي وجهة في رئيسية الآيفون: `NavigationLink` على الهاتف، وعلى عمود
/// الأخبار العريض يُدفع في مكدّس القارئ (`paths[.home]`) فيظهر بزر رجوع ويُفرّغه
/// زر الرئيسية. `NavigationLink(value:)` داخل عمود NavigationSplitView كان يستبدل
/// جذر القارئ بلا رجوع ولا يصل إلى `paths` (طلب المالك 2026-10-18). الخبر
/// (`Article`) يُفتح في القارئ نفسه كما يفعل `ArticleLink`.
struct ReaderLink<Value: Hashable, Label: View>: View {
    let value: Value
    @ViewBuilder var label: () -> Label
    @Environment(\.opensArticlesInReader) private var opensInReader
    @Environment(SabqNavigationState.self) private var navigation

    var body: some View {
        if opensInReader {
            Button {
                SabqHaptics.light()
                if let article = value as? Article {
                    navigation.openInReader(article)
                } else {
                    navigation.openFromReaderContext(value, in: .home)
                }
            } label: {
                label()
            }
        } else {
            NavigationLink(value: value) { label() }
        }
    }
}
