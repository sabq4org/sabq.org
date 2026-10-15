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
        let current = article("now", daysAgo: 0)
        let oneEarlier = [article("a", daysAgo: 3), article("later", daysAgo: -1)]
        #expect(ArticleContext.storySoFar(current: current, related: oneEarlier).isEmpty)
    }

    @Test func storySoFarIsOldestFirstWithCurrentLast() {
        let current = article("now", daysAgo: 0)
        let related = [
            article("b", daysAgo: 6), article("later", daysAgo: -2), article("e", daysAgo: 1),
            article("a", daysAgo: 13), article("c", daysAgo: 4), article("d", daysAgo: 2),
            article("now", daysAgo: 0), article("c", daysAgo: 4),
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
            id: current.id, title: "خبر", excerpt: "مقتطف.", aiSummary: "", body: "", bodyHTML: "",
            category: .saudi, author: "", publishDate: current.publishDate, isBreaking: false,
            isFeatured: false, tags: [], imageURL: nil, slug: "now", articleURL: nil
        )
        let related = [article("a", daysAgo: 5), article("b", daysAgo: 3),
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
}
