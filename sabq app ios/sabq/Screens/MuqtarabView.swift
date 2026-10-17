import SwiftUI
import UIKit

// MARK: - مسارات التنقل لقسم «مُقترب»

struct MuqtarabRoute: Hashable {}

struct MuqtarabAngleRoute: Hashable {
    let slug: String
    let name: String?
    let colorHex: String?
}

struct MuqtarabTopicRoute: Hashable {
    let angleSlug: String
    let topicSlug: String
    let title: String?
}

struct MuqtarabWriterRoute: Hashable {
    let id: String
    let name: String?
}

// MARK: - الهوية البصرية المشتقّة من لون الزاوية (مطابِق angleTheme.ts)

struct MuqTheme {
    let ui: UIColor
    init(_ hex: String?) {
        ui = UIColor(muqHex: hex ?? "") ?? UIColor(red: 0.39, green: 0.40, blue: 0.95, alpha: 1)
    }
    var color: Color { Color(ui) }
    var soft: Color { Color(ui).opacity(0.12) }
    var softer: Color { Color(ui).opacity(0.06) }
    var border: Color { Color(ui).opacity(0.30) }
}

func muqColor(_ hex: String?) -> Color { MuqTheme(hex).color }

extension UIColor {
    fileprivate convenience init?(muqHex hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
        guard s.count == 6, let value = UInt64(s, radix: 16) else { return nil }
        self.init(
            red: CGFloat((value & 0xFF0000) >> 16) / 255,
            green: CGFloat((value & 0x00FF00) >> 8) / 255,
            blue: CGFloat(value & 0x0000FF) / 255,
            alpha: 1
        )
    }
}

// MARK: - مساعدات (أيقونة، تاريخ، زمن قراءة، تنظيف HTML)

/// خريطة أسماء Lucide → SF Symbols (تقريبية). الافتراضي رمز عام.
func muqSymbol(_ iconKey: String?) -> String {
    guard let key = iconKey?.lowercased() else { return "scope" }
    let map: [String: String] = [
        "circle": "circle.fill", "sparkles": "sparkles", "star": "star.fill",
        "pen": "pencil", "pentool": "pencil.tip", "feather": "pencil.and.outline",
        "bookopen": "book.fill", "book": "book.fill", "lightbulb": "lightbulb.fill",
        "brain": "brain.head.profile", "globe": "globe", "newspaper": "newspaper.fill",
        "trendingup": "chart.line.uptrend.xyaxis", "heart": "heart.fill",
        "camera": "camera.fill", "mic": "mic.fill", "music": "music.note",
        "film": "film.fill", "coffee": "cup.and.saucer.fill", "compass": "safari.fill",
        "flag": "flag.fill", "zap": "bolt.fill", "eye": "eye.fill",
        "messagecircle": "message.fill", "users": "person.2.fill", "user": "person.fill",
        "award": "rosette", "target": "target", "bookmark": "bookmark.fill",
        "quote": "quote.bubble.fill", "graduationcap": "graduationcap.fill",
        "briefcase": "briefcase.fill", "building": "building.2.fill",
        "leaf": "leaf.fill", "shield": "shield.fill", "rocket": "paperplane.fill"
    ]
    return map[key] ?? "scope"
}

/// تنسيق تاريخ النشر بالعربية (يدعم الثواني الكسرية).
func muqFormatDate(_ iso: String?) -> String? {
    guard let iso, !iso.isEmpty else { return nil }
    let frac = ISO8601DateFormatter(); frac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let plain = ISO8601DateFormatter(); plain.formatOptions = [.withInternetDateTime]
    guard let date = frac.date(from: iso) ?? plain.date(from: iso) else { return nil }
    let out = DateFormatter()
    out.locale = Locale(identifier: "ar")
    out.dateFormat = "d MMMM yyyy"
    return out.string(from: date)
}

private func muqStripTags(_ html: String) -> String {
    html.replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
        .replacingOccurrences(of: "&nbsp;", with: " ")
        .replacingOccurrences(of: "&amp;", with: "&")
        .replacingOccurrences(of: "&quot;", with: "\"")
}

private func muqNormalize(_ s: String) -> String {
    muqStripTags(s)
        .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

/// زمن القراءة التقديري (١٨٠ كلمة/دقيقة للعربية).
func muqReadingMinutes(_ topic: MuqTopic) -> Int {
    var parts: [String] = []
    if let e = topic.excerpt { parts.append(e) }
    if let p = topic.content?.plainText, !p.isEmpty { parts.append(p) }
    else if let h = topic.content?.rawHtml { parts.append(muqStripTags(h)) }
    let words = muqNormalize(parts.joined(separator: " ")).split(separator: " ").count
    return max(1, Int(ceil(Double(words) / 180.0)))
}

/// يزيل عنوانًا/موجزًا مكرّرًا في بداية محتوى HTML (يطابق سلوك الويب).
func muqStripDuplicateLead(html: String, title: String, excerpt: String?) -> String {
    var result = html.trimmingCharacters(in: .whitespacesAndNewlines)
    let targets = [title, excerpt].compactMap { $0 }.map(muqNormalize).filter { !$0.isEmpty }
    guard !targets.isEmpty else { return result }
    let pattern = "^\\s*<(h[1-6]|p)\\b[^>]*>([\\s\\S]*?)</\\1>\\s*"
    guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return result }
    for _ in 0..<2 {
        let range = NSRange(result.startIndex..., in: result)
        guard let m = regex.firstMatch(in: result, options: [], range: range),
              let full = Range(m.range, in: result),
              let inner = Range(m.range(at: 2), in: result) else { break }
        let innerText = muqNormalize(String(result[inner]))
        if targets.contains(innerText) {
            result.removeSubrange(full)
            result = result.trimmingCharacters(in: .whitespacesAndNewlines)
        } else {
            break
        }
    }
    return result
}

// MARK: - صفحة القسم (الزوايا + أحدث المواضيع)

struct MuqtarabLandingView: View {
    @State private var angles: [MuqAngle] = []
    @State private var topics: [MuqTopic] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                header

                if isLoading && topics.isEmpty && angles.isEmpty {
                    VStack(spacing: SabqLayout.space12) {
                        SkeletonBox(height: 120, radius: SabqRadius.medium)
                        SkeletonBox(height: 120, radius: SabqRadius.medium)
                    }
                } else if let errorMessage, topics.isEmpty {
                    EmptyStateView(
                        icon: "exclamationmark.shield", tint: SabqTheme.textSecondary,
                        title: "تعذّر التحميل", subtitle: errorMessage,
                        action: { Task { await load() } }, actionTitle: "إعادة المحاولة"
                    )
                } else if topics.isEmpty && angles.isEmpty {
                    EmptyStateView(
                        icon: "square.stack.3d.up", tint: SabqTheme.textSecondary,
                        title: "لا توجد مواضيع بعد",
                        subtitle: "زوايا مُقترب التحليلية قيد التحضير — قريبًا."
                    )
                } else {
                    if !angles.isEmpty { anglesSection }
                    if !angles.isEmpty && !topics.isEmpty { SabqSectionBand() }
                    if !topics.isEmpty { topicsSection }
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, SabqLayout.space40)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .navigationTitle("مُقترب")
        .refreshable { await load() }
        .task { if topics.isEmpty && angles.isEmpty { await load() } }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            Text("مُقترب")
                .sabqText(SabqType.articleTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Text("زوايا تحليلية بأقلام كتّاب سبق")
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textTertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var anglesSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            MuqSectionHeading(title: "الزوايا")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: SabqLayout.space12) {
                    ForEach(angles) { angle in
                        NavigationLink(value: MuqtarabAngleRoute(
                            slug: angle.slug, name: angle.nameAr, colorHex: angle.colorHex
                        )) {
                            MuqAngleCard(angle: angle)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, SabqLayout.pageMargin)
            }
            .padding(.horizontal, -SabqLayout.pageMargin)
        }
    }

    private var topicsSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            MuqSectionHeading(title: "أحدث المواضيع")
                .padding(.bottom, SabqLayout.space4)
            let rows = topics.filter { $0.angle?.slug != nil }
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, topic in
                if index > 0 { MuqRowSeparator() }
                NavigationLink(value: MuqtarabTopicRoute(
                    angleSlug: topic.angle?.slug ?? "", topicSlug: topic.slug, title: topic.title
                )) {
                    MuqTopicCard(topic: topic, showAnglePill: true)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        async let anglesTask = try? await APIClient.shared.fetchMuqtarabAngles()
        async let topicsTask = try? await APIClient.shared.fetchMuqtarabFeaturedTopics(limit: 12)
        let a = await anglesTask ?? []
        let t = await topicsTask ?? []
        angles = a
        topics = t
        if a.isEmpty && t.isEmpty { errorMessage = "تحقّق من الاتصال ثم أعد المحاولة." }
        isLoading = false
    }
}

// MARK: - عناصر مشتركة (رأس قسم، فاصل، صف موضوع)

private struct MuqSectionHeading: View {
    let title: String

    var body: some View {
        Text(title)
            .sabqText(SabqType.sectionHeading)
            .foregroundStyle(SabqTheme.textPrimary)
            .accessibilityAddTraits(.isHeader)
    }
}

private struct MuqRowSeparator: View {
    var body: some View {
        Rectangle().fill(SabqTheme.separator).frame(height: 1)
    }
}

/// صف موضوع بنموذج صف الخبر المضغوط: اسم الزاوية، العنوان، الموجز، البيانات،
/// والمصغّرة 16:9 على طرف السطر.
private struct MuqTopicRowLayout: View {
    let angleName: String?
    let title: String
    let excerpt: String?
    let publishedAt: String?
    let viewCount: Int?
    let heroImageUrl: String?

    var body: some View {
        HStack(alignment: .top, spacing: NewsRowStyle.thumbnailGap) {
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                if let angleName, !angleName.isEmpty {
                    Text(angleName)
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(SabqTheme.primary)
                        .lineLimit(1)
                }
                Text(title)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .multilineTextAlignment(.leading)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
                if let excerpt, !excerpt.isEmpty {
                    Text(excerpt)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .lineLimit(2)
                }
                HStack(spacing: SabqLayout.space12) {
                    if let date = muqFormatDate(publishedAt) {
                        Label(date, systemImage: "calendar")
                    }
                    if let views = viewCount, views > 0 {
                        Label("\(views)", systemImage: "eye")
                            .monospacedDigit()
                    }
                }
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textTertiary)
                .labelStyle(.titleAndIcon)
                .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if let raw = heroImageUrl, !raw.isEmpty, let url = URL(string: URLConstants.absolutize(raw)) {
                CachedAsyncImage(url: url, contentMode: .fill, maxPixelSize: LatestTimelineStyle.thumbnailPixels) {
                    SabqImagePlaceholder()
                }
                .frame(width: NewsRowStyle.thumbnailWidth, height: NewsRowStyle.thumbnailHeight)
                .clipShape(RoundedRectangle(cornerRadius: NewsRowStyle.thumbnailRadius, style: .continuous))
                .accessibilityHidden(true)
            }
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

// MARK: - بطاقة زاوية (غلاف 16:9 + اسم + كاتب) — أحجام موحّدة

struct MuqAngleCard: View {
    let angle: MuqAngle

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Group {
                if let raw = angle.coverImageUrl, let url = URL(string: URLConstants.absolutize(raw)) {
                    CachedAsyncImage(url: url, contentMode: .fill, maxPixelSize: 600) {
                        SabqImagePlaceholder()
                    }
                } else {
                    SabqImagePlaceholder()
                        .environment(\.sabqImageLoadFailed, true)
                }
            }
            .frame(width: 168, height: 95)
            .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(angle.nameAr)
                    .font(SabqType.rowTitle.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(1)
                if let w = angle.writerName, !w.isEmpty {
                    Text(w)
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .lineLimit(1)
                } else if let c = angle.topicCount {
                    Text("\(c) موضوعًا")
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                        .monospacedDigit()
                }
            }
        }
        .frame(width: 168, alignment: .topLeading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

// MARK: - صف موضوع (قائمة عمودية)

struct MuqTopicCard: View {
    let topic: MuqTopic
    var showAnglePill: Bool = false
    var angleColorHex: String? = nil

    var body: some View {
        MuqTopicRowLayout(
            angleName: showAnglePill ? topic.angle?.name : nil,
            title: topic.title,
            excerpt: topic.excerpt,
            publishedAt: topic.publishedAt,
            viewCount: topic.viewCount,
            heroImageUrl: topic.heroImageUrl
        )
    }
}

// MARK: - توقيع الكاتب (byline قابل للنقر)

struct MuqWriterByline: View {
    let writer: MuqWriter?
    let angleName: String?
    let theme: MuqTheme

    var body: some View {
        if let writer, let name = writer.name, !name.isEmpty {
            let content = HStack(spacing: SabqLayout.space12) {
                avatar(writer, name: name)
                VStack(alignment: .leading, spacing: 2) {
                    Text(name)
                        .font(SabqType.rowTitle.font)
                        .foregroundStyle(SabqTheme.textPrimary)
                    Text(angleName.map { "كاتب زاوية \($0)" } ?? "كاتب الزاوية")
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                }
            }
            .frame(minHeight: SabqLayout.touchTarget)
            .contentShape(Rectangle())
            if let id = writer.id, !id.isEmpty {
                NavigationLink(value: MuqtarabWriterRoute(id: id, name: name)) { content }
                    .buttonStyle(.plain)
            } else {
                content
            }
        }
    }

    private func avatar(_ writer: MuqWriter, name: String) -> some View {
        ZStack {
            Circle().fill(SabqTheme.surfaceMuted)
            if let raw = writer.avatar, let url = URL(string: URLConstants.absolutize(raw)) {
                CachedAsyncImage(url: url, contentMode: .fill, maxPixelSize: 200) {
                    SabqTheme.surfaceMuted
                }
            } else {
                Text(String(name.prefix(1)))
                    .font(SabqType.button.font)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
        }
        .frame(width: 44, height: 44)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }
}

// MARK: - صفحة الزاوية

struct MuqtarabAngleView: View {
    let slug: String
    let initialName: String?
    let initialColorHex: String?

    @State private var angle: MuqAngle?
    @State private var writer: MuqWriter?
    @State private var topics: [MuqTopic] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                hero

                if isLoading && topics.isEmpty {
                    VStack(spacing: SabqLayout.space12) {
                        SkeletonBox(height: 120, radius: SabqRadius.medium)
                        SkeletonBox(height: 120, radius: SabqRadius.medium)
                    }
                } else if let errorMessage, topics.isEmpty {
                    EmptyStateView(
                        icon: "exclamationmark.shield", tint: SabqTheme.textSecondary,
                        title: "تعذّر التحميل", subtitle: errorMessage,
                        action: { Task { await load() } }, actionTitle: "إعادة المحاولة"
                    )
                } else if topics.isEmpty {
                    EmptyStateView(
                        icon: "doc.text", tint: SabqTheme.textSecondary,
                        title: "لا توجد مواضيع منشورة",
                        subtitle: "لم ينشر كاتب هذه الزاوية مواضيع بعد."
                    )
                } else {
                    SabqSectionBand()
                    VStack(alignment: .leading, spacing: 0) {
                        MuqSectionHeading(title: "المواضيع")
                            .padding(.bottom, SabqLayout.space4)
                        ForEach(Array(topics.enumerated()), id: \.element.id) { index, topic in
                            if index > 0 { MuqRowSeparator() }
                            NavigationLink(value: MuqtarabTopicRoute(
                                angleSlug: slug, topicSlug: topic.slug, title: topic.title
                            )) {
                                MuqTopicCard(topic: topic, angleColorHex: angle?.colorHex ?? initialColorHex)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, SabqLayout.space40)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .navigationTitle(angle?.nameAr ?? initialName ?? "زاوية")
        .task { if topics.isEmpty { await load() } }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            if let raw = angle?.coverImageUrl, let url = URL(string: URLConstants.absolutize(raw)) {
                Color.clear
                    .aspectRatio(16.0 / 9.0, contentMode: .fit)
                    .frame(maxWidth: .infinity)
                    .overlay(
                        CachedAsyncImage(url: url, contentMode: .fill) { SabqImagePlaceholder() }
                    )
                    .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                    .accessibilityHidden(true)
            }

            Text(angle?.nameAr ?? initialName ?? "زاوية")
                .sabqText(SabqType.articleTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)

            if let writer, let name = writer.name, !name.isEmpty {
                HStack(spacing: SabqLayout.space12) {
                    writerAvatar(writer, name: name)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(name).font(SabqType.rowTitle.font).foregroundStyle(SabqTheme.textPrimary)
                        Text("كاتب الزاوية").font(SabqType.meta.font).foregroundStyle(SabqTheme.textTertiary)
                    }
                }
            }

            if let desc = angle?.shortDesc, !desc.isEmpty {
                Text(desc)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: SabqLayout.space16) {
                Text("\(topics.count) موضوع")
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textTertiary)
                Button { shareAngle() } label: {
                    Label("مشاركة", systemImage: "square.and.arrow.up")
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(SabqTheme.primary)
                        .frame(minHeight: SabqLayout.touchTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func writerAvatar(_ writer: MuqWriter, name: String) -> some View {
        ZStack {
            Circle().fill(SabqTheme.surfaceMuted)
            if let raw = writer.avatar, let url = URL(string: URLConstants.absolutize(raw)) {
                CachedAsyncImage(url: url, contentMode: .fill, maxPixelSize: 200) { SabqTheme.surfaceMuted }
            } else {
                Text(String(name.prefix(1))).font(SabqType.button.font).foregroundStyle(SabqTheme.textSecondary)
            }
        }
        .frame(width: 40, height: 40)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        async let detailTask = try? await APIClient.shared.fetchMuqtarabAngleDetail(slug: slug)
        async let topicsTask = try? await APIClient.shared.fetchMuqtarabAngleTopics(slug: slug)
        let detail = await detailTask
        angle = detail?.angle
        writer = detail?.writer
        let loaded = await topicsTask ?? []
        topics = loaded
        if loaded.isEmpty && angle == nil { errorMessage = "تحقّق من الاتصال ثم أعد المحاولة." }
        isLoading = false
    }

    private func shareAngle() {
        SabqHaptics.light()
        guard let url = URL(string: "\(URLConstants.webOrigin)/muqtarab/\(slug)") else { return }
        SabqShareHelper.presentShareSheet(with: url)
    }
}

// MARK: - صفحة الموضوع

struct MuqtarabTopicView: View {
    let angleSlug: String
    let topicSlug: String
    let initialTitle: String?

    @State private var topic: MuqTopic?
    @State private var angle: MuqAngle?
    @State private var writer: MuqWriter?
    @State private var related: [MuqTopic] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var didReportView = false
    /// memoization لنتيجة ArticleHtmlParser.parse — نفس نمط cachedBlocks في
    /// ArticleDetailView: بدونها كان الماسح/الـregex يعاد على كامل HTML
    /// الموضوع مع كل إعادة رسم (تمرير/تغيّر حالة) — تقطيع محسوس في الطويل.
    @State private var cachedBlocks: (html: String, items: [ArticleBlock]) = ("", [])

    private var theme: MuqTheme { MuqTheme(angle?.colorHex) }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                if isLoading && topic == nil {
                    VStack(spacing: SabqLayout.space12) {
                        SkeletonBox(height: 28, radius: SabqRadius.small)
                        SkeletonBox(height: 40, radius: SabqRadius.small)
                        SkeletonBox(height: 90, radius: SabqRadius.medium)
                        SkeletonBox(height: 200, radius: SabqRadius.medium)
                    }
                } else if let errorMessage, topic == nil {
                    EmptyStateView(
                        icon: "exclamationmark.shield", tint: SabqTheme.textSecondary,
                        title: "تعذّر التحميل", subtitle: errorMessage,
                        action: { Task { await load() } }, actionTitle: "إعادة المحاولة"
                    )
                } else if let t = topic {
                    detailContent(t)
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, SabqLayout.space40)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .navigationTitle("مُقترب")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { share() } label: {
                    Label("مشاركة", systemImage: "square.and.arrow.up")
                        .labelStyle(.iconOnly)
                }
            }
        }
        .task { if topic == nil { await load() } }
    }

    @ViewBuilder
    private func detailContent(_ t: MuqTopic) -> some View {
        // اسم الزاوية بلون الروابط (كاسم القسم في صفحة الخبر)
        NavigationLink(value: MuqtarabAngleRoute(slug: angleSlug, name: angle?.nameAr, colorHex: angle?.colorHex)) {
            Text("زاوية \(angle?.nameAr ?? "مُقترب")")
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(SabqTheme.primary)
                .frame(minHeight: SabqLayout.touchTarget, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.bottom, -SabqLayout.space12)

        // العنوان
        Text(t.title)
            .sabqText(SabqType.articleTitle)
            .foregroundStyle(SabqTheme.textPrimary)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)

        // الكاتب + بيانات القراءة
        MuqWriterByline(writer: writer, angleName: angle?.nameAr, theme: theme)
        metaRow(t)

        // الموجز الذكي (بلوك هادئ)
        if let excerpt = t.excerpt, !excerpt.isEmpty {
            smartSummary(excerpt)
        }

        // الصورة البارزة 16:9
        if let raw = t.heroImageUrl, let url = URL(string: URLConstants.absolutize(raw)) {
            Color.clear
                .aspectRatio(16.0 / 9.0, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .overlay(
                    CachedAsyncImage(url: url, contentMode: .fill) { SabqImagePlaceholder() }
                )
                .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
        }

        // المحتوى
        topicBody(t)

        // الكلمات المفتاحية
        if let keywords = t.seoMeta?.keywords, !keywords.isEmpty {
            keywordsRow(keywords)
        }

        // توقيع الكاتب
        if let sig = angle?.writerSignature, !sig.isEmpty {
            signatureCard(sig)
        }

        // المزيد من الزاوية
        if !related.isEmpty {
            SabqSectionBand()
                .padding(.vertical, SabqLayout.space8)
            relatedSection
        }
    }

    private func metaRow(_ t: MuqTopic) -> some View {
        FlowLayout(spacing: SabqLayout.space12) {
            if let date = muqFormatDate(t.publishedAt) {
                Label(date, systemImage: "calendar")
            }
            Label("\(muqReadingMinutes(t)) دقائق قراءة", systemImage: "clock")
            if let views = t.viewCount, views > 0 {
                Label("\(views) مشاهدة", systemImage: "eye").monospacedDigit()
            }
        }
        .font(SabqType.meta.font)
        .foregroundStyle(SabqTheme.textTertiary)
        .labelStyle(.titleAndIcon)
    }

    private func smartSummary(_ excerpt: String) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "sparkles").font(SabqType.tag.font).accessibilityHidden(true)
                Text("الموجز الذكي").font(SabqType.tag.font)
                Text("AI")
                    .font(SabqType.tag.font)
                    .padding(.horizontal, SabqLayout.space4)
                    .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
            }
            .foregroundStyle(SabqTheme.primary)

            Text(excerpt)
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textPrimary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    @ViewBuilder
    private func topicBody(_ t: MuqTopic) -> some View {
        let html = t.html
        if !html.isEmpty {
            let cleaned = muqStripDuplicateLead(html: html, title: t.title, excerpt: t.excerpt)
            let blocks: [ArticleBlock] = {
                if cachedBlocks.html == cleaned { return cachedBlocks.items }
                let parsed = ArticleHtmlParser.parse(cleaned)
                DispatchQueue.main.async { cachedBlocks = (cleaned, parsed) }
                return parsed
            }()
            ArticleContentView(
                blocks: blocks,
                fontSize: SabqType.articleBody.size, lineSpacing: SabqType.articleBody.lineSpacing, useReaderFont: false
            )
        } else if !t.fallbackText.isEmpty {
            Text(t.fallbackText)
                .sabqText(SabqType.articleBody)
                .foregroundStyle(SabqTheme.textPrimary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func keywordsRow(_ keywords: [String]) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Text("الكلمات المفتاحية")
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(SabqTheme.textSecondary)
            FlowLayout(spacing: SabqLayout.space8) {
                ForEach(keywords, id: \.self) { tag in
                    Text("#\(tag)")
                        .font(SabqType.tag.font)
                        .padding(.horizontal, SabqLayout.space12).padding(.vertical, SabqLayout.space8)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .background(Capsule().fill(SabqTheme.surfaceMuted))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func signatureCard(_ sig: String) -> some View {
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            Image(systemName: "person")
                .font(SabqFonts.app(size: 16, weight: .regular))
                .foregroundStyle(SabqTheme.textSecondary)
                .frame(width: 36, height: 36)
                .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text("توقيع الكاتب").font(SabqType.tag.font).foregroundStyle(SabqTheme.primary)
                Text(sig)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    private var relatedSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            MuqSectionHeading(title: "المزيد من \(angle?.nameAr ?? "الزاوية")")
                .padding(.bottom, SabqLayout.space4)
            ForEach(Array(related.enumerated()), id: \.element.id) { index, topic in
                if index > 0 { MuqRowSeparator() }
                NavigationLink(value: MuqtarabTopicRoute(angleSlug: angleSlug, topicSlug: topic.slug, title: topic.title)) {
                    MuqTopicCard(topic: topic, angleColorHex: angle?.colorHex)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            let res = try await APIClient.shared.fetchMuqtarabTopic(angleSlug: angleSlug, topicSlug: topicSlug)
            topic = res.topic
            angle = res.angle
            writer = res.writer
            if !didReportView {
                didReportView = true
                let id = res.topic.id
                Task { await APIClient.shared.reportMuqtarabTopicView(id: id) }
            }
            // مواضيع ذات صلة (نفس الزاوية، استبعاد الحالي)
            if let more = try? await APIClient.shared.fetchMuqtarabAngleTopics(slug: angleSlug, limit: 6) {
                related = more.filter { $0.id != res.topic.id }.prefix(3).map { $0 }
            }
        } catch {
            errorMessage = "تحقّق من الاتصال ثم أعد المحاولة."
        }
        isLoading = false
    }

    private func share() {
        SabqHaptics.light()
        guard let url = URL(string: "\(URLConstants.webOrigin)/muqtarab/\(angleSlug)/topic/\(topicSlug)") else { return }
        SabqShareHelper.presentShareSheet(with: url)
    }
}

// MARK: - صفحة الكاتب

struct MuqtarabWriterView: View {
    let id: String
    let initialName: String?

    @State private var profile: MuqWriterProfile?
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                if isLoading && profile == nil {
                    VStack(spacing: SabqLayout.space12) {
                        SkeletonBox(height: 220, radius: SabqRadius.medium)
                        SkeletonBox(height: 120, radius: SabqRadius.medium)
                    }
                } else if let errorMessage, profile == nil {
                    EmptyStateView(
                        icon: "person.crop.circle.badge.exclamationmark", tint: SabqTheme.textSecondary,
                        title: "الكاتب غير موجود", subtitle: errorMessage,
                        action: { Task { await load() } }, actionTitle: "إعادة المحاولة"
                    )
                } else if let p = profile {
                    content(p)
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space24)
            .padding(.bottom, SabqLayout.space40)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .navigationTitle("كاتب مُقترب")
        .task { if profile == nil { await load() } }
    }

    @ViewBuilder
    private func content(_ p: MuqWriterProfile) -> some View {
        hero(p)

        SabqSectionBand()

        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space8) {
                MuqSectionHeading(title: "مواضيع الكاتب")
                Text("\(p.topics.count)")
                    .font(SabqType.meta.font).monospacedDigit()
                    .foregroundStyle(SabqTheme.textTertiary)
            }
            .padding(.bottom, SabqLayout.space4)

            if p.topics.isEmpty {
                EmptyStateView(
                    icon: "doc.text", tint: SabqTheme.textSecondary,
                    title: "لا مواضيع بعد", subtitle: "لم ينشر هذا الكاتب مواضيع حتى الآن."
                )
            } else {
                ForEach(Array(p.topics.enumerated()), id: \.element.id) { index, topic in
                    if index > 0 { MuqRowSeparator() }
                    NavigationLink(value: MuqtarabTopicRoute(angleSlug: topic.angleSlug, topicSlug: topic.slug, title: topic.title)) {
                        writerTopicCard(topic)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func hero(_ p: MuqWriterProfile) -> some View {
        VStack(spacing: SabqLayout.space12) {
            ZStack {
                Circle().fill(SabqTheme.surfaceMuted)
                if let raw = p.writer.avatar, let url = URL(string: URLConstants.absolutize(raw)) {
                    CachedAsyncImage(url: url, contentMode: .fill, maxPixelSize: 300) { SabqTheme.surfaceMuted }
                } else {
                    Text(String(p.writer.name.prefix(1)))
                        .font(SabqFonts.headline(size: 32))
                        .foregroundStyle(SabqTheme.textSecondary)
                }
            }
            .frame(width: 88, height: 88)
            .clipShape(Circle())
            .accessibilityHidden(true)

            Text(p.writer.name)
                .sabqText(SabqType.leadTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
            Text("كاتب في مُقترب")
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textTertiary)

            if let bio = p.writer.bio, !bio.isEmpty {
                Text(bio)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, SabqLayout.space8)
            }

            if !p.angles.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: SabqLayout.space8) {
                        ForEach(p.angles) { a in
                            NavigationLink(value: MuqtarabAngleRoute(slug: a.slug, name: a.nameAr, colorHex: a.colorHex)) {
                                HStack(spacing: SabqLayout.space4) {
                                    Image(systemName: muqSymbol(a.iconKey))
                                        .font(SabqType.tag.font)
                                        .accessibilityHidden(true)
                                    Text(a.nameAr).font(SabqType.tag.font)
                                }
                                .foregroundStyle(SabqTheme.textPrimary)
                                .padding(.horizontal, SabqLayout.space12)
                                .frame(minHeight: 36)
                                .background(Capsule().fill(SabqTheme.surfaceMuted))
                                .contentShape(Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, SabqLayout.pageMargin)
                }
                .padding(.horizontal, -SabqLayout.pageMargin)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func writerTopicCard(_ topic: MuqWriterTopic) -> some View {
        MuqTopicRowLayout(
            angleName: topic.angleName,
            title: topic.title,
            excerpt: topic.excerpt,
            publishedAt: topic.publishedAt,
            viewCount: topic.viewCount,
            heroImageUrl: topic.heroImageUrl
        )
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            profile = try await APIClient.shared.fetchMuqtarabWriter(id: id)
        } catch {
            errorMessage = "تحقّق من الاتصال ثم أعد المحاولة."
        }
        isLoading = false
    }
}
