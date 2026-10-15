import SwiftUI

/// جذر عمود القارئ في «الرئيسية» على العرض العريض (iPhone Duo مفتوحًا، iPad).
///
/// كان العمود يبدأ بشاشة «اختر ما تود قراءته» الفارغة، فيفتح المستخدم الجهاز
/// على نصف شاشة أبيض. الآن يُفتح الخبر الذي اختاره من العمود الجانبي
/// (`SabqNavigationState.homeReaderArticle`)، وإن لم يختر بعد فأبرز خبر في
/// القائمة نفسها بترتيبها (عاجل ← الأبرز ← آخر الأخبار). `.id` يعيد بناء
/// القارئ عند تبديل الخبر حتى لا تبقى حالة التمرير/التعليقات من الخبر السابق.
struct HomeReaderRoot: View {
    @Environment(ArticlesStore.self) private var articlesStore
    @Environment(SabqNavigationState.self) private var navigation

    private var article: Article? {
        navigation.homeReaderArticle ?? HomeSidebarView.orderedArticles(articlesStore).first
    }

    var body: some View {
        if let article {
            ArticleDetailView(article: article)
                .id(article.id)
        } else if articlesStore.isLoading {
            VStack(spacing: 12) {
                ProgressView().tint(SabqTheme.primaryEnd)
                Text("جارٍ تحميل الأخبار…")
                    .font(SabqFonts.app(size: 14, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(SabqTheme.background)
        } else {
            ReaderPlaceholderView()
        }
    }
}
