import WidgetKit
import SwiftUI

// MARK: - Data

struct WidgetArticle: Identifiable {
    let id: String
    let title: String
    let category: String
    let publishedAt: String
    let slug: String?
    var imageData: Data?

    var relativeTime: String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let f2 = ISO8601DateFormatter()
        f2.formatOptions = [.withInternetDateTime]
        guard let date = f.date(from: publishedAt) ?? f2.date(from: publishedAt) else { return "" }
        let diff = Date().timeIntervalSince(date)
        if diff < 60 { return "الآن" }
        if diff < 3600 { return "منذ \(Int(diff / 60)) د" }
        if diff < 86400 { return "منذ \(Int(diff / 3600)) س" }
        return "منذ \(Int(diff / 86400)) ي"
    }

    var categoryAr: String {
        let map: [String: String] = [
            "saudi": "محليات", "world": "دولية", "sports": "رياضة",
            "business": "اقتصاد", "technology": "تقنية", "culture": "ثقافة",
            "community": "مجتمع", "tourism": "سياحة", "regions": "مناطق",
        ]
        return map[category.lowercased()] ?? category
    }

    var uiImage: UIImage? {
        guard let data = imageData else { return nil }
        return UIImage(data: data)
    }
}

// MARK: - Network

enum WidgetAPI {
    static func fetchLatest() async -> [WidgetArticle] {
        guard let url = URL(string: "https://sabq.org/api/v1/homepage") else { return [] }
        var req = URLRequest(url: url)
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue("ar", forHTTPHeaderField: "Accept-Language")
        req.timeoutInterval = 10

        do {
            let (data, _) = try await URLSession.shared.data(for: req)
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
            let forYou = json["forYou"] as? [[String: Any]] ?? []
            let items = Array(forYou.prefix(8))

            var articles: [WidgetArticle] = items.compactMap { dict in
                guard let id = dict["id"] as? String,
                      let title = dict["title"] as? String else { return nil }
                let catDict = dict["category"] as? [String: Any]
                return WidgetArticle(
                    id: id, title: title,
                    category: catDict?["slug"] as? String ?? "",
                    publishedAt: dict["publishedAt"] as? String ?? "",
                    slug: dict["slug"] as? String,
                    imageData: nil
                )
            }

            await withTaskGroup(of: (Int, Data?).self) { group in
                for (i, _) in articles.enumerated() {
                    guard i < items.count,
                          let urlStr = items[i]["imageUrl"] as? String,
                          let imgURL = URL(string: urlStr) else { continue }
                    group.addTask {
                        let imgData = try? await URLSession.shared.data(from: imgURL).0
                        return (i, imgData)
                    }
                }
                for await (idx, imgData) in group {
                    if idx < articles.count { articles[idx].imageData = imgData }
                }
            }
            return articles
        } catch {
            return []
        }
    }
}

// MARK: - Timeline

struct SabqEntry: TimelineEntry {
    let date: Date
    let articles: [WidgetArticle]

    static let placeholder = SabqEntry(date: .now, articles: [
        WidgetArticle(id: "1", title: "جاري تحميل آخر الأخبار من سبق...", category: "saudi", publishedAt: "", slug: nil),
        WidgetArticle(id: "2", title: "تابع أحدث الأخبار المحلية والعالمية", category: "world", publishedAt: "", slug: nil),
        WidgetArticle(id: "3", title: "أخبار الرياضة والاقتصاد والتقنية", category: "sports", publishedAt: "", slug: nil),
        WidgetArticle(id: "4", title: "أبرز التطورات على مدار الساعة", category: "business", publishedAt: "", slug: nil),
        WidgetArticle(id: "5", title: "تغطية شاملة لأهم الأحداث", category: "technology", publishedAt: "", slug: nil),
        WidgetArticle(id: "6", title: "آخر المستجدات لحظة بلحظة", category: "culture", publishedAt: "", slug: nil),
    ])
}

struct SabqProvider: TimelineProvider {
    func placeholder(in context: Context) -> SabqEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (SabqEntry) -> Void) {
        if context.isPreview {
            completion(.placeholder)
            return
        }
        Task {
            let arts = await WidgetAPI.fetchLatest()
            completion(SabqEntry(date: .now, articles: arts.isEmpty ? SabqEntry.placeholder.articles : arts))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SabqEntry>) -> Void) {
        Task {
            let arts = await WidgetAPI.fetchLatest()
            let entry = SabqEntry(date: .now, articles: arts.isEmpty ? SabqEntry.placeholder.articles : arts)
            let next = Calendar.current.date(byAdding: .minute, value: 15, to: .now)!
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }
}

// MARK: - Theme

private enum WC {
    static let accent = Color(red: 0.13, green: 0.59, blue: 0.95)
    static let subtleText = Color.secondary
    static let divider = Color.gray.opacity(0.12)
    static let thumbRadius: CGFloat = 10
}

// MARK: - Shared Components

private struct WidgetHeader: View {
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "newspaper.fill")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(WC.accent)

            Text("آخر الأخبار")
                .font(.system(size: 12, weight: .heavy, design: .rounded))
                .foregroundStyle(.primary)

            Spacer(minLength: 0)

            Text("سبق")
                .font(.system(size: 13, weight: .heavy, design: .rounded))
                .foregroundStyle(WC.accent)
        }
    }
}

private struct ArticleRow: View {
    let article: WidgetArticle
    var thumbSize: CGFloat = 46
    var titleSize: CGFloat = 13
    var showCategory: Bool = true

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(article.title)
                    .font(.system(size: titleSize, weight: .semibold, design: .rounded))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                HStack(spacing: 4) {
                    if showCategory {
                        Text(article.categoryAr)
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(WC.accent)
                    }
                    if !article.relativeTime.isEmpty {
                        if showCategory {
                            Text("·")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(WC.subtleText)
                        }
                        HStack(spacing: 2) {
                            Image(systemName: "hourglass")
                                .font(.system(size: 8))
                            Text(article.relativeTime)
                                .font(.system(size: 9, weight: .medium))
                        }
                        .foregroundStyle(WC.subtleText)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if let img = article.uiImage {
                Image(uiImage: img)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: thumbSize, height: thumbSize)
                    .clipShape(RoundedRectangle(cornerRadius: WC.thumbRadius, style: .continuous))
            } else {
                RoundedRectangle(cornerRadius: WC.thumbRadius, style: .continuous)
                    .fill(WC.accent.opacity(0.1))
                    .frame(width: thumbSize, height: thumbSize)
                    .overlay {
                        Image(systemName: "newspaper")
                            .font(.system(size: 16, weight: .light))
                            .foregroundStyle(WC.accent.opacity(0.35))
                    }
            }
        }
    }
}

// MARK: - Widget Entry View

struct SabqWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: SabqEntry

    var body: some View {
        switch family {
        case .systemSmall:          SmallView(entry: entry)
        case .systemMedium:         MediumView(entry: entry)
        case .systemLarge:          LargeView(entry: entry)
        case .accessoryRectangular: AccessoryRectangularView(entry: entry)
        case .accessoryInline:      AccessoryInlineView(entry: entry)
        case .accessoryCircular:    AccessoryCircularView(entry: entry)
        default:                    SmallView(entry: entry)
        }
    }
}

// MARK: - Lockscreen accessories (iOS 16+)

/// Two-line headline + breaking indicator. Best paired with lock-screen
/// rectangle slot — gives a reader an at-a-glance latest headline.
private struct AccessoryRectangularView: View {
    let entry: SabqEntry
    private var first: WidgetArticle? { entry.articles.first }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 4) {
                Image(systemName: "newspaper.fill")
                    .font(.system(size: 9, weight: .bold))
                Text("سبق")
                    .font(.system(size: 10, weight: .heavy, design: .rounded))
                if let cat = first?.categoryAr, !cat.isEmpty {
                    Text("·")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.secondary)
                    Text(cat)
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
            .widgetAccentable()

            Text(first?.title ?? "آخر الأخبار من سبق")
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(2)
                .multilineTextAlignment(.leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .environment(\.layoutDirection, .rightToLeft)
    }
}

/// Single-line slim header. Shows the latest headline only.
private struct AccessoryInlineView: View {
    let entry: SabqEntry
    private var first: WidgetArticle? { entry.articles.first }

    var body: some View {
        Label {
            Text(first?.title ?? "آخر الأخبار من سبق")
        } icon: {
            Image(systemName: "newspaper.fill")
        }
        .environment(\.layoutDirection, .rightToLeft)
    }
}

/// Tiny circular accessory. Shows the count of fresh articles + logo glyph.
private struct AccessoryCircularView: View {
    let entry: SabqEntry

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 1) {
                Image(systemName: "newspaper.fill")
                    .font(.system(size: 12, weight: .bold))
                Text("\(entry.articles.count)")
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .monospacedDigit()
            }
            .widgetAccentable()
        }
    }
}

// MARK: - Small

private struct SmallView: View {
    let entry: SabqEntry
    private var items: [WidgetArticle] { Array(entry.articles.prefix(2)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader()

            Spacer(minLength: 6)

            ForEach(Array(items.enumerated()), id: \.element.id) { idx, article in
                if idx > 0 {
                    WC.divider.frame(height: 0.5).padding(.vertical, 5)
                }
                ArticleRow(article: article, thumbSize: 36, titleSize: 12, showCategory: false)
            }

            Spacer(minLength: 0)
        }
        .padding(14)
        .environment(\.layoutDirection, .rightToLeft)
    }
}

// MARK: - Medium

private struct MediumView: View {
    let entry: SabqEntry
    private var items: [WidgetArticle] { Array(entry.articles.prefix(3)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader()
                .padding(.bottom, 8)

            ForEach(Array(items.enumerated()), id: \.element.id) { idx, article in
                if idx == 0 { // First item is the main news
                    ArticleRow(article: article, thumbSize: 70, titleSize: 15, showCategory: true)
                        .padding(.bottom, 6)
                        .padding(.top, (idx == 0) ? 0 : 4) // No top padding for first item, otherwise a small one
                    WC.divider.frame(height: 0.5).padding(.vertical, 4)
                } else { // Remaining items are smaller
                    if idx > 0 {
                        WC.divider.frame(height: 0.5).padding(.vertical, 4)
                    }
                    ArticleRow(article: article, thumbSize: 40, titleSize: 13)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .environment(\.layoutDirection, .rightToLeft)
    }
}

// MARK: - Large

private struct LargeView: View {
    let entry: SabqEntry
    private var items: [WidgetArticle] { Array(entry.articles.prefix(6)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader()
                .padding(.bottom, 10)

            ForEach(Array(items.enumerated()), id: \.element.id) { idx, article in
                if idx == 0 { // First item is the main news
                    ArticleRow(article: article, thumbSize: 80, titleSize: 16, showCategory: true)
                        .padding(.bottom, 8)
                        .padding(.top, (idx == 0) ? 0 : 5) // No top padding for first item, otherwise a small one
                    WC.divider.frame(height: 0.5).padding(.vertical, 5)
                } else { // Remaining items are smaller
                    if idx > 0 {
                        WC.divider.frame(height: 0.5).padding(.vertical, 5)
                    }
                    ArticleRow(article: article, thumbSize: 46, titleSize: 13)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .environment(\.layoutDirection, .rightToLeft)
    }
}

// MARK: - Widget

struct SabqNewsWidget: Widget {
    let kind = "SabqNewsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SabqProvider()) { entry in
            SabqWidgetEntryView(entry: entry)
                .containerBackground(.background, for: .widget)
        }
        .configurationDisplayName("آخر الأخبار من سبق")
        .description("تابع آخر الأخبار مباشرة من شاشتك الرئيسية وشاشة القفل")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .systemLarge,
            .accessoryRectangular,
            .accessoryInline,
            .accessoryCircular
        ])
    }
}
