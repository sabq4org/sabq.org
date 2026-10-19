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
            ReaderLink(value: MuqtarabRoute()) {
                HomeSectionLinkLabel(title: "كل الزوايا")
            }
            .buttonStyle(.plain)
        } content: {
            ForEach(Array(visibleTopics.enumerated()), id: \.element.id) { index, topic in
                if index > 0 { SidebarRowDivider() }
                ReaderLink(value: MuqtarabTopicRoute(
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
    @Environment(\.homeSideColumn) private var compactType
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
        // نفس صف الخبر المضغوط: العنوان ثم سطر البيانات، والمصغّرة على طرف السطر.
        HStack(alignment: .top, spacing: NewsRowStyle.thumbnailGap) {
            VStack(alignment: .leading, spacing: NewsRowStyle.textStackSpacing) {
                SabqRTLText(
                    topic.title,
                    uiFont: SabqType.rowTitle.scaled(compactType).uiFont,
                    color: SabqTheme.textPrimary,
                    lineLimit: dynamicTypeSize.isAccessibilitySize ? 0 : NewsRowStyle.compactTitleLines,
                    lineSpacing: NewsRowStyle.titleLineSpacing,
                    textStyle: SabqType.rowTitle.scaled(compactType).uiTextStyle
                )
                if compactType {
                    // عمود الأقسام الضيق: الاسم كاملًا في سطره، والزمن تحته بخط صغير
                    // (طلب المالك 2026-10-18) بدل سطر واحد يقصّ الاسم والزمن معًا.
                    VStack(alignment: .leading, spacing: 2) {
                        Text(byline)
                            .font(SabqType.metaEmphasis.scaled(true).font)
                            .foregroundStyle(SabqTheme.primary)
                            .lineLimit(1)
                        if let date = muqRelativeDate(topic.publishedAt) {
                            Text(date)
                                .font(SabqType.timestamp.font)
                                .foregroundStyle(SabqTheme.textTertiary)
                                .lineLimit(1)
                        }
                    }
                } else {
                HStack(spacing: SabqLayout.space4) {
                    Text(byline)
                        .font(SabqType.metaEmphasis.scaled(compactType).font)
                        .foregroundStyle(SabqTheme.primary)
                        .lineLimit(1)
                    // النقطة نص مستقل: في بداية نص عربي تنقلب لآخر السطر.
                    if let date = muqRelativeDate(topic.publishedAt) {
                        Text("·")
                            .font(SabqType.meta.scaled(compactType).font)
                            .foregroundStyle(SabqTheme.textTertiary)
                        Text(date)
                            .font(SabqType.timestamp.font)
                            .foregroundStyle(SabqTheme.textTertiary)
                            .lineLimit(1)
                    }
                }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Group {
                if let imageURL {
                    CachedAsyncImage(url: imageURL, contentMode: .fill, maxPixelSize: LatestTimelineStyle.thumbnailPixels) {
                        SabqImagePlaceholder()
                    }
                } else {
                    SabqImagePlaceholder()
                        .environment(\.sabqImageLoadFailed, true)
                }
            }
            .frame(width: NewsRowStyle.thumbnailWidth, height: NewsRowStyle.thumbnailHeight)
            .clipShape(RoundedRectangle(cornerRadius: NewsRowStyle.thumbnailRadius, style: .continuous))
            .accessibilityHidden(true)
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .contentShape(Rectangle())
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
