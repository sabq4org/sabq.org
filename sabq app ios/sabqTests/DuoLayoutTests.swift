import Testing
import SwiftUI
@testable import sabq

/// قرارات iPhone Duo (نموذج «الخبر وسياقه» و«مركز المباراة» 2026-10-15):
/// اختيار تخطيط المركز بحسب الوضعية، شريط التبويب، «القصة حتى الآن»، الموجز،
/// ذاكرة الجلسة، وحالة عمود «الرئيسية».
struct DuoLayoutTests {
    // MARK: - الوضعية

    @Test func matchLayoutFollowsWidthAndHinge() {
        let unknown = DuoHingeState()
        #expect(DuoPosture.matchLayout(width: 466, hinge: unknown) == .standard)
        #expect(DuoPosture.matchLayout(width: 655, hinge: unknown) == .columns)

        // وضع الكتاب: نصف مفتوح لكن الفاصل رأسي (لا مدى أفقي) — يبقى عمودين.
        let book = DuoHingeState(status: .partiallyOpen, horizontalDivision: nil)
        #expect(DuoPosture.matchLayout(width: 655, hinge: book) == .columns)

        // الطاولة: نصف مفتوح وفاصل يقطع الحاوية أفقيًا — بصرف النظر عن العرض.
        let tabletop = DuoHingeState(status: .partiallyOpen, horizontalDivision: 373.5...413.5)
        #expect(DuoPosture.matchLayout(width: 669, hinge: tabletop) == .tabletop)

        // فاصل أفقي والمفصلة مفتوحة بالكامل (مسطّح) ليس طاولة.
        let flat = DuoHingeState(status: .fullyOpen, horizontalDivision: 373.5...413.5)
        #expect(DuoPosture.matchLayout(width: 669, hinge: flat) == .columns)
    }

    @Test func horizontalDivisionIgnoresVerticalBands() {
        // القيم من المحاكي: الطاولة (669×40 أفقي)، والكتاب فاصل رأسي.
        #expect(DuoPosture.horizontalDivision(from: [CGRect(x: 0, y: 373.5, width: 669, height: 40)]) == 373.5...413.5)
        #expect(DuoPosture.horizontalDivision(from: [CGRect(x: 455, y: 0, width: 40, height: 669)]) == nil)
        #expect(DuoPosture.horizontalDivision(from: []) == nil)
    }

    @Test func bottomTabBarOnlyOnNarrowWindows() {
        #expect(DuoPosture.usesBottomTabBar(windowWidth: 466))   // الشاشة الخارجية
        #expect(!DuoPosture.usesBottomTabBar(windowWidth: 678))  // الخارجية أفقيًا
        #expect(!DuoPosture.usesBottomTabBar(windowWidth: 951))  // مفتوحًا
    }

    // MARK: - الموجز

    @Test func summaryPointsSplitSentencesButNotDecimals() {
        let text = "أنفق السعوديون 13.5 مليار ريال هذا الأسبوع. ارتفع الإنفاق 18.1% عن الأسبوع السابق! هل يستمر هذا النمو الشهر القادم؟ جملة رابعة لا تظهر."
        let points = ArticleContext.summaryPoints(from: text)
        #expect(points.count == 3)
        #expect(points[0] == "أنفق السعوديون 13.5 مليار ريال هذا الأسبوع.")
        #expect(points[1].hasPrefix("ارتفع الإنفاق 18.1%"))
        #expect(points[2] == "هل يستمر هذا النمو الشهر القادم؟")
    }

    @Test func summaryPointsMergeFragmentsAndHandleEmpty() {
        #expect(ArticleContext.summaryPoints(from: "   ").isEmpty)
        let points = ArticleContext.summaryPoints(from: "أعلن المجلس قراره النهائي اليوم. ص.ب.\nوبدأ التنفيذ فورًا في المناطق")
        #expect(points == ["أعلن المجلس قراره النهائي اليوم. ص.ب.", "وبدأ التنفيذ فورًا في المناطق"])
    }

    // MARK: - «القصة حتى الآن»

    private func article(_ id: String, daysAgo: Double, title: String? = nil) -> Article {
        Article(
            id: id, title: title ?? id, excerpt: "", aiSummary: "", body: "", bodyHTML: "",
            category: .saudi, author: "",
            publishDate: Date(timeIntervalSince1970: 1_800_000_000 - daysAgo * 86_400),
            isBreaking: false, isFeatured: false, tags: [], imageURL: nil, slug: id, articleURL: nil
        )
    }

    @Test func storySoFarNeedsTwoEarlierStories() {
        let current = article("now", daysAgo: 0, title: "مجلس الأمن يدين هجمات الحوثيين على المملكة")
        let oneEarlier = [story("a", daysAgo: 3), story("later", daysAgo: -1)]
        #expect(ArticleContext.storySoFar(current: current, related: oneEarlier).isEmpty)
    }

    /// «المرتبطة» من الخادم أخبار القسم الحديثة لا القصة نفسها: خبر غزة في مجلس
    /// الأمن جاءت معه أخبار كوسوفو وطوكيو (محاكي 2026-10-15) — لا تصنع خطًا زمنيًا.
    @Test func storySoFarIgnoresSameSectionNoise() {
        let current = article("now", daysAgo: 0, title: "مجلس الأمن يعقد اجتماعًا موسعًا حول الشرق الأوسط ومخاطر العودة إلى الحرب في غزة")
        let noise = [
            article("k", daysAgo: 0.2, title: "الناتو يُسلّم قيادة قوة كوسوفو إلى لواء إيطالي خلفًا للتركي أولوتاش"),
            article("t", daysAgo: 0.3, title: "طوكيو تدرس تزويد قواتها بغواصات نووية.. وسط تصاعد التوترات الإقليمية"),
            article("s", daysAgo: 0.4, title: "قوة إسرائيلية تتوغل في ريف درعا وتضرم النيران في مستودع ومنزل"),
        ]
        #expect(ArticleContext.storySoFar(current: current, related: noise).isEmpty)

        // كلمة مفتاحية مشتركة تكفي وحدها، والتطبيع يوحّد «غزة/غزه» و«الأمن/امن».
        let sameStory = [
            article("g1", daysAgo: 2, title: "ارتفاع حصيلة الضحايا في غزه"),
            article("g2", daysAgo: 1, title: "جلسة طارئة لمجلس الامن بشأن الشرق الاوسط"),
        ]
        let timeline = ArticleContext.storySoFar(current: current, related: noise + sameStory, keywords: ["غزة"])
        #expect(timeline.map(\.id) == ["g1", "g2", "now"])
    }

    private func story(_ id: String, daysAgo: Double) -> Article {
        article(id, daysAgo: daysAgo, title: "هجمات الحوثيين على المملكة: تطور \(id)")
    }

    @Test func storySoFarIsOldestFirstWithCurrentLast() {
        let current = article("now", daysAgo: 0, title: "مجلس الأمن يدين هجمات الحوثيين على المملكة")
        let related = [
            story("b", daysAgo: 6), story("later", daysAgo: -2), story("e", daysAgo: 1),
            story("a", daysAgo: 13), story("c", daysAgo: 4), story("d", daysAgo: 2),
            story("now", daysAgo: 0), story("c", daysAgo: 4),
        ]
        let timeline = ArticleContext.storySoFar(current: current, related: related)
        // الأحدث أربعة من السابق فقط، بلا تكرار ولا لاحق ولا الخبر نفسه.
        #expect(timeline.map(\.id) == ["b", "c", "d", "e", "now"])
        #expect(timeline.last?.isCurrent == true)
        #expect(timeline.dropLast().allSatisfy { !$0.isCurrent })
    }

    @Test func newsContextKeepsRelatedOutOfTheTimeline() {
        var current = article("now", daysAgo: 0)
        current = Article(
            id: current.id, title: "مجلس الأمن يدين الهجمات", excerpt: "مقتطف.", aiSummary: "", body: "", bodyHTML: "",
            category: .saudi, author: "", publishDate: current.publishDate, isBreaking: false,
            isFeatured: false, tags: [], imageURL: nil, slug: "now", articleURL: nil
        )
        let related = [article("a", daysAgo: 5, title: "مجلس الأمن يناقش الهجمات"), article("b", daysAgo: 3, title: "مجلس الأمن يصدر بيانًا"),
                       article("x", daysAgo: -1), article("y", daysAgo: -3)]
        let context = ArticleContext.news(article: current, related: related, keywords: ["مجلس الأمن"])
        #expect(context.storySoFar.map(\.id) == ["a", "b", "now"])
        #expect(context.related.map(\.id) == ["y", "x"])          // الأحدث أولًا
        #expect(context.summaryPoints == ["مقتطف."])                // المقتطف حين يغيب الموجز
        #expect(context.keywords == ["مجلس الأمن"])
        #expect(!context.isEmpty)
    }

    @Test func opinionContextListsSameAuthorOnly() {
        func opinion(_ id: String, author: String) -> OpinionArticle {
            OpinionArticle(id: id, title: id, excerpt: "", body: "", authorName: author,
                           authorImageURL: nil, authorGender: nil, publishDate: Date(),
                           tags: [], imageURL: nil, slug: id, articleURL: nil)
        }
        let current = opinion("o1", author: "محمد الحربي")
        let recent = [opinion("o1", author: "محمد الحربي"), opinion("o2", author: "محمد الحربي "),
                      opinion("o3", author: "فوزية الشيخي")]
        let context = ArticleContext.opinion(current, moreOpinions: recent)
        #expect(context.kind == .opinion)
        #expect(context.authorOpinions.map(\.id) == ["o2"])
        #expect(context.storySoFar.isEmpty)
    }

    // MARK: - ذاكرة الجلسة

    @Test func detailCacheServesFreshEntriesAndEvictsOldest() {
        let cache = ArticleDetailCache(capacity: 2)
        let now = Date()
        cache.store(slug: "a", article: article("a", daysAgo: 0), related: [], at: now.addingTimeInterval(-300))
        cache.store(slug: "b", article: article("b", daysAgo: 0), related: [article("r", daysAgo: 1)], at: now)
        #expect(cache.entry(for: "a")?.isFresh(now: now) == false)   // خمس دقائق: يُعرض ثم يُحدَّث
        #expect(cache.entry(for: "b")?.isFresh(now: now) == true)
        #expect(cache.entry(for: "b")?.related.map(\.id) == ["r"])

        cache.store(slug: "c", article: article("c", daysAgo: 0), related: [], at: now)
        #expect(cache.entry(for: "a") == nil)                          // الأقدم خرج
        #expect(cache.entry(for: "b") != nil)

        // إعادة تخزين الموجود تجعله الأحدث فلا يُطرد التالي.
        cache.store(slug: "b", article: article("b", daysAgo: 0), related: [], at: now)
        cache.store(slug: "d", article: article("d", daysAgo: 0), related: [], at: now)
        #expect(cache.entry(for: "c") == nil)
        #expect(cache.entry(for: "b") != nil)
    }

    // MARK: - عمود «الرئيسية»

    @MainActor
    @Test func openingAnArticleSwitchesTheColumnToContext() {
        let state = SabqNavigationState()
        #expect(state.homeSidebarMode == .news)
        state.openInReader(article("a", daysAgo: 0))
        #expect(state.homeSidebarMode == .context)

        let context = ArticleContext.news(article: article("a", daysAgo: 0), related: [], keywords: ["الرياض"])
        state.publishReaderContext(context)
        #expect(state.readerContext?.id == "a")

        state.reset()
        #expect(state.readerContext == nil)
        #expect(state.homeSidebarMode == .news)
    }

    /// كلمة مفتاحية من «سياق الخبر» تدفع صفحة لا سياق لها: لا يبقى العمود على
    /// سياق خبر لم يعد في القارئ (مراجعة PR #1874).
    @MainActor
    @Test func nonArticleDestinationFromContextLeavesTheContext() {
        let state = SabqNavigationState()
        let current = article("a", daysAgo: 0)
        state.openInReader(current)
        state.publishReaderContext(ArticleContext.news(article: current, related: [], keywords: ["الرياض"]))

        state.openFromReaderContext(KeywordRoute(keyword: "الرياض"), in: .home)
        #expect(state.paths[.home]?.count == 1)
        #expect(state.readerContext == nil)
        #expect(state.homeSidebarMode == .news)

        // خبر أو مقال رأي ينشر سياقه بنفسه عند ظهوره: يبقى العمود على السياق.
        state.openInReader(current)
        state.publishReaderContext(ArticleContext.news(article: current, related: [], keywords: []))
        state.openFromReaderContext(article("b", daysAgo: 1), in: .home)
        #expect(state.homeSidebarMode == .context)
        #expect(state.paths[.home]?.count == 1)
    }
}
