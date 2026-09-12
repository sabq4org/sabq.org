import SwiftUI

// MARK: - مخزن مُقترب المشترك
//
// مخزن حيّ على مستوى التطبيق يحتفظ بآخر مواضيع مُقترب المميّزة. نفس فلسفة
// `WorldCupHomeStore`: تبقى البيانات هنا فلا تختفي البطاقة عند التنقل
// (الدخول للملف الشخصي/لوحة التحكم والرجوع)، مع تحديث انتهازي.

@Observable
@MainActor
final class MuqtarabHomeStore {
    static let shared = MuqtarabHomeStore()
    private init() {}

    private(set) var topics: [MuqTopic] = []
    private var lastFetch: Date?
    private var fetching = false

    /// يجلب المواضيع عند الحاجة فقط: لا بيانات بعد، أو مرّ أكثر من 5 دقائق.
    func loadIfNeeded() async {
        if fetching { return }
        if !topics.isEmpty, let last = lastFetch, Date().timeIntervalSince(last) < 300 { return }
        fetching = true
        defer { fetching = false }
        if let result = try? await APIClient.shared.fetchMuqtarabFeaturedTopics(limit: 6) {
            topics = result
            lastFetch = Date()
        }
    }
}

// MARK: - شريط الزوايا في الواجهة الرئيسية
//
// الحاوية الموحدة نفسها (بلوك تفاصيل الخبر) بصفوف بطاقة الخبر الجانبية:
// صورة الموضوع 104×84 (أو صورة الكاتب)، العنوان في سطرين، ثم اسم كاتب الزاوية
// والوقت النسبي — قرار المالك 2026-09-12 حتى لا يشبه بلوك الرأي. يختفي كليًا
// عند غياب البيانات.

struct MuqtarabHomeStrip: View {
    private let store = MuqtarabHomeStore.shared

    /// المواضيع القابلة للعرض فقط (زاوية معلومة) — حتى لا يكسر موضوع
    /// ناقص البيانات ترتيب الفواصل بين الصفوف.
    private var visibleTopics: [MuqTopic] {
        Array(store.topics.filter { $0.angle?.slug != nil }.prefix(4))
    }

    var body: some View {
        ZStack {
            Color.clear.frame(width: 0, height: 0)
            if !visibleTopics.isEmpty {
                content
            }
        }
        .task { await store.loadIfNeeded() }
    }

    private var content: some View {
        ArticleSidebarModule(
            title: "مُقترب",
            description: "زوايا كتّاب سبق — رأي يقترب من الحدث",
            icon: "square.stack.3d.up",
            fill: SabqTheme.surface,
            action: {
                NavigationLink(value: MuqtarabRoute()) {
                    HStack(spacing: 4) {
                        Text("كل الزوايا")
                        Image(systemName: "chevron.left")
                            .font(SabqFonts.app(size: 11, weight: .medium))
                    }
                }
                .buttonStyle(.plain)
            }
        ) {
            ForEach(Array(visibleTopics.enumerated()), id: \.element.id) { index, topic in
                if index > 0 { SidebarRowDivider() }
                NavigationLink(value: MuqtarabTopicRoute(
                    angleSlug: topic.angle?.slug ?? "",
                    topicSlug: topic.slug,
                    title: topic.title
                )) {
                    SidebarArticleRow(
                        title: topic.title,
                        // روابط مُقترب نسبية (`/uploads/...`) — تُكمَّل بأصل الموقع كما في شاشة مُقترب
                        imageURL: (topic.heroImageUrl.flatMap { $0.isEmpty ? nil : $0 } ?? topic.writer?.avatar).map(URLConstants.absolutize),
                        byline: topic.writer?.name ?? topic.angle?.name ?? "مُقترب",
                        bylineAvatarURL: topic.writer?.avatar.map(URLConstants.absolutize),
                        date: muqRelativeDate(topic.publishedAt),
                        placeholderIcon: "square.stack.3d.up"
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// تاريخ نسبي عربي («قبل ٥ ساعات»، «أمس») من نص ISO — نفس تسامح
/// `muqFormatDate` مع الكسور العشرية للثواني.
private func muqRelativeDate(_ iso: String?) -> String? {
    guard let iso, !iso.isEmpty else { return nil }
    let frac = ISO8601DateFormatter()
    frac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    guard let date = frac.date(from: iso) ?? plain.date(from: iso) else { return nil }
    return SabqFormatters.relativeArabic.localizedString(for: date, relativeTo: Date())
}
