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
// الرأس الموحّد للرئيسية مع وصف قصير «زوايا كتّاب سبق» لأن «مُقترب» اسم علامة،
// ثم أربعة صفوف: صورة الموضوع (أو صورة الكاتب)، العنوان، واسم كاتب الزاوية
// بالأزرق العميق للهوية والوقت النسبي (نموذج 2026-10-09). يختفي كليًا عند
// غياب البيانات.

struct MuqtarabHomeStrip: View {
    private let store = MuqtarabHomeStore.shared

    /// المواضيع القابلة للعرض فقط (زاوية معلومة) — حتى لا يكسر موضوع
    /// ناقص البيانات ترتيب الفواصل بين الصفوف.
    private var visibleTopics: [MuqTopic] {
        Array(store.topics.filter { $0.angle?.slug != nil }.prefix(4))
    }

    var body: some View {
        ZStack {
            HomeStripAnchor()
            if !visibleTopics.isEmpty {
                content
            }
        }
        .task { await store.loadIfNeeded() }
    }

    private var content: some View {
        HomeSectionCard(title: "مُقترب", context: "زوايا كتّاب سبق") {
            NavigationLink(value: MuqtarabRoute()) {
                HomeSectionLinkLabel(title: "كل الزوايا")
            }
            .buttonStyle(.plain)
        } content: {
            ForEach(Array(visibleTopics.enumerated()), id: \.element.id) { index, topic in
                if index > 0 { SidebarRowDivider() }
                NavigationLink(value: MuqtarabTopicRoute(
                    angleSlug: topic.angle?.slug ?? "",
                    topicSlug: topic.slug,
                    title: topic.title
                )) {
                    MuqtarabHomeRow(topic: topic)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

private struct MuqtarabHomeRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let topic: MuqTopic

    /// روابط مُقترب نسبية (`/uploads/...`) — تُكمَّل بأصل الموقع كما في شاشة مُقترب.
    private var imageURL: URL? {
        (topic.heroImageUrl.flatMap { $0.isEmpty ? nil : $0 } ?? topic.writer?.avatar)
            .map(URLConstants.absolutize)
            .flatMap(URL.init(string:))
    }

    private var byline: String { topic.writer?.name ?? topic.angle?.name ?? "مُقترب" }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Group {
                if let imageURL {
                    CachedAsyncImage(url: imageURL, contentMode: .fill) { placeholder }
                } else {
                    placeholder
                }
            }
            .frame(width: LatestTimelineStyle.thumbnailWidth, height: LatestTimelineStyle.thumbnailHeight)
            .clipShape(RoundedRectangle(cornerRadius: NewsRowStyle.thumbnailRadius, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                SabqRTLText(
                    topic.title,
                    uiFont: SabqFonts.uiSubhead(size: NewsRowStyle.compactTitleSize),
                    color: SabqTheme.ink,
                    lineLimit: dynamicTypeSize.isAccessibilitySize ? 0 : 2,
                    lineSpacing: NewsRowStyle.titleLineSpacing
                )
                HStack(spacing: 4) {
                    Text(byline)
                        .font(SabqFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.brandBlue)
                        .lineLimit(1)
                    // النقطة نص مستقل: في بداية نص عربي تنقلب لآخر السطر.
                    if let date = muqRelativeDate(topic.publishedAt) {
                        Text("·")
                            .font(SabqFonts.app(size: 12, weight: .regular))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                        Text(date)
                            .font(SabqFonts.app(size: 12, weight: .regular))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                            .lineLimit(1)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: NewsRowStyle.thumbnailRadius, style: .continuous)
            .fill(SabqTheme.primaryEnd.opacity(0.10))
            .overlay {
                Image(systemName: "square.stack.3d.up")
                    .font(SabqFonts.app(size: 20, weight: .light))
                    .foregroundStyle(SabqTheme.primaryEnd.opacity(0.45))
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
