import SwiftUI

/// «سياق الخبر»: ما يحتاجه القارئ ليفهم القصة دون مغادرة الخبر.
///
/// يُبنى بالكامل مما حمّله القارئ أصلًا (الموجز الذكي، الأخبار المرتبطة،
/// الكلمات المفتاحية؛ وللرأي: مقالات الكاتب نفسه) فلا يضيف طلبًا للشبكة.
/// يعرضه عمود Duo المفتوح (`HomeSidebarView`) وورقة الشاشة الخارجية.
struct ArticleContext: Equatable {
    enum Kind: Equatable { case news, opinion }

    let id: String
    let kind: Kind
    let title: String
    /// حتى ثلاث نقاط من الموجز الذكي (أو المقتطف حين يغيب).
    let summaryPoints: [String]
    /// «القصة حتى الآن»: الأقدم أولًا والخبر الحالي آخرًا. فارغة إن قلّ
    /// السابق عن خبرين.
    let storySoFar: [ArticleContextTimelineItem]
    /// أخبار مرتبطة لم تظهر في الخط الزمني، الأحدث أولًا.
    let related: [Article]
    let keywords: [String]
    /// للرأي: مقالات الكاتب نفسه بدل الخط الزمني.
    let authorName: String?
    let authorOpinions: [OpinionArticle]

    var isEmpty: Bool {
        summaryPoints.isEmpty && storySoFar.isEmpty && related.isEmpty
            && keywords.isEmpty && authorOpinions.isEmpty
    }

    static let maxSummaryPoints = 3
    static let minimumEarlierStories = 2
    static let maxEarlierStories = 4
    static let maxRelated = 4

    static func news(article: Article, related: [Article], keywords: [String]) -> ArticleContext {
        let summarySource = article.aiSummary.isEmpty ? article.excerpt : article.aiSummary
        let timeline = storySoFar(current: article, related: related)
        let inTimeline = Set(timeline.map(\.id))
        let rest = related
            .filter { $0.id != article.id && !inTimeline.contains($0.id) }
            .sorted { $0.publishDate > $1.publishDate }
        return ArticleContext(
            id: article.id,
            kind: .news,
            title: article.title,
            summaryPoints: summaryPoints(from: summarySource),
            storySoFar: timeline,
            related: Array(rest.prefix(maxRelated)),
            keywords: keywords,
            authorName: nil,
            authorOpinions: []
        )
    }

    static func opinion(_ opinion: OpinionArticle, moreOpinions: [OpinionArticle]) -> ArticleContext {
        let author = opinion.authorName.trimmingCharacters(in: .whitespacesAndNewlines)
        let sameAuthor = author.isEmpty ? [] : moreOpinions.filter {
            $0.id != opinion.id && $0.authorName.trimmingCharacters(in: .whitespacesAndNewlines) == author
        }
        return ArticleContext(
            id: opinion.id,
            kind: .opinion,
            title: opinion.title,
            summaryPoints: summaryPoints(from: opinion.excerpt),
            storySoFar: [],
            related: [],
            keywords: opinion.tags,
            authorName: author.isEmpty ? nil : author,
            authorOpinions: Array(sameAuthor.prefix(maxRelated))
        )
    }

    /// يقسّم الموجز إلى جمل عند علامات نهاية الجملة (. ؟ ! وسطر جديد) ويأخذ
    /// أول ثلاث. الجمل القصيرة جدًا (بقايا اختصار أو رقم) تُدمج فيما قبلها.
    static func summaryPoints(from text: String, limit: Int = maxSummaryPoints) -> [String] {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }
        var sentences: [String] = []
        var current = ""
        let characters = Array(trimmed)
        for (index, character) in characters.enumerated() {
            if character == "\n" {
                append(&current, to: &sentences)
                continue
            }
            current.append(character)
            // النقطة تنهي الجملة فقط إن تلاها فراغ أو نهاية النص، حتى لا
            // تنكسر الأعداد العشرية («13.5 مليار»).
            let next = index + 1 < characters.count ? characters[index + 1] : nil
            if "!?؟".contains(character) || (character == "." && (next == nil || next!.isWhitespace)) {
                append(&current, to: &sentences)
            }
        }
        append(&current, to: &sentences)
        return Array(sentences.prefix(limit))
    }

    private static func append(_ current: inout String, to sentences: inout [String]) {
        let sentence = current.trimmingCharacters(in: .whitespacesAndNewlines)
        current = ""
        guard !sentence.isEmpty else { return }
        if sentence.count < 12, let last = sentences.popLast() {
            sentences.append(last + " " + sentence)
        } else {
            sentences.append(sentence)
        }
    }

    /// الخط الزمني: الأخبار المرتبطة المنشورة قبل الخبر الحالي مرتبة من الأقدم،
    /// آخر `maxEarlierStories` منها، ثم الخبر الحالي. يُعرض فقط إن وُجد
    /// `minimumEarlierStories` على الأقل — خبر سابق واحد لا يصنع «قصة».
    static func storySoFar(
        current: Article,
        related: [Article],
        minimumEarlier: Int = minimumEarlierStories,
        maxEarlier: Int = maxEarlierStories
    ) -> [ArticleContextTimelineItem] {
        var seen = Set<String>([current.id])
        let earlier = related
            .filter { $0.publishDate < current.publishDate && seen.insert($0.id).inserted }
            .sorted { $0.publishDate < $1.publishDate }
            .suffix(maxEarlier)
        guard earlier.count >= minimumEarlier else { return [] }
        return earlier.map { ArticleContextTimelineItem(article: $0, isCurrent: false) }
            + [ArticleContextTimelineItem(article: current, isCurrent: true)]
    }
}

struct ArticleContextTimelineItem: Identifiable, Equatable {
    let article: Article
    let isCurrent: Bool
    var id: String { article.id }
}

/// أي محتوى يعرضه عمود «الرئيسية» على الشاشة المفتوحة.
enum HomeSidebarMode: Equatable {
    case news, context
}
