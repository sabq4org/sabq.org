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
    var glow: Color { Color(ui).opacity(0.35) }
    var gradient: LinearGradient {
        LinearGradient(colors: [Color(ui), Color(ui).opacity(0.82)],
                       startPoint: .topTrailing, endPoint: .bottomLeading)
    }
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
    @Environment(\.dismiss) private var dismiss
    @State private var angles: [MuqAngle] = []
    @State private var topics: [MuqTopic] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 24) {
                header

                if isLoading && topics.isEmpty && angles.isEmpty {
                    VStack(spacing: 12) {
                        SkeletonBox(height: 120, radius: SabqTheme.tileRadius)
                        SkeletonBox(height: 120, radius: SabqTheme.tileRadius)
                    }
                } else if let errorMessage, topics.isEmpty {
                    EmptyStateView(
                        icon: "exclamationmark.shield", tint: SabqTheme.coral,
                        title: "تعذّر التحميل", subtitle: errorMessage,
                        action: { Task { await load() } }, actionTitle: "إعادة المحاولة"
                    )
                } else if topics.isEmpty && angles.isEmpty {
                    EmptyStateView(
                        icon: "square.stack.3d.up", tint: SabqTheme.tertiaryInk,
                        title: "لا توجد مواضيع بعد",
                        subtitle: "زوايا مُقترب التحليلية قيد التحضير — قريبًا."
                    )
                } else {
                    if !angles.isEmpty { anglesSection }
                    if !topics.isEmpty { topicsSection }
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 14)
            .padding(.bottom, 60)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar { backButton }
        .refreshable { await load() }
        .task { if topics.isEmpty && angles.isEmpty { await load() } }
    }

    private var backButton: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.right")
                    .font(SabqFonts.app(size: 16, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)
            }
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                Circle().fill(SabqTheme.sky.opacity(0.14)).frame(width: 56, height: 56)
                Image(systemName: "scope")
                    .font(SabqFonts.app(size: 26, weight: .light))
                    .foregroundStyle(SabqTheme.sky)
                    .symbolRenderingMode(.hierarchical)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("مُقترب")
                    .font(SabqFonts.app(size: 24, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                Text("زوايا تحليلية بأقلام كتّاب سبق")
                    .font(SabqFonts.app(size: 13, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
            Spacer(minLength: 0)
        }
    }

    private var anglesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("الزوايا")
                .font(SabqFonts.app(size: 17, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(angles) { angle in
                        NavigationLink(value: MuqtarabAngleRoute(
                            slug: angle.slug, name: angle.nameAr, colorHex: angle.colorHex
                        )) {
                            MuqAngleCard(angle: angle)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private var topicsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("أحدث المواضيع")
                .font(SabqFonts.app(size: 17, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
            ForEach(topics) { topic in
                if let angleSlug = topic.angle?.slug {
                    NavigationLink(value: MuqtarabTopicRoute(
                        angleSlug: angleSlug, topicSlug: topic.slug, title: topic.title
                    )) {
                        MuqTopicCard(topic: topic, showAnglePill: true)
                    }
                    .buttonStyle(.plain)
                }
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

// MARK: - بطاقة زاوية (غلاف/لون + أيقونة + اسم + كاتب) — أحجام موحّدة

struct MuqAngleCard: View {
    let angle: MuqAngle
    private var theme: MuqTheme { MuqTheme(angle.colorHex) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack {
                if let raw = angle.coverImageUrl, let url = URL(string: URLConstants.absolutize(raw)) {
                    CachedAsyncImage(url: url, contentMode: .fill, maxPixelSize: 600) {
                        theme.gradient
                    }
                } else {
                    theme.gradient
                }
                LinearGradient(colors: [.black.opacity(0.05), .black.opacity(0.35)],
                               startPoint: .top, endPoint: .bottom)
                Image(systemName: muqSymbol(angle.iconKey))
                    .font(SabqFonts.app(size: 26, weight: .bold))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.25), radius: 4, y: 1)
            }
            .frame(width: 168, height: 96)
            .clipped()

            VStack(alignment: .leading, spacing: 4) {
                Text(angle.nameAr)
                    .font(SabqFonts.app(size: 15, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(1)
                HStack(spacing: 5) {
                    if let w = angle.writerName, !w.isEmpty {
                        Image(systemName: "person.fill")
                            .font(SabqFonts.app(size: 9))
                            .foregroundStyle(theme.color)
                        Text(w)
                            .font(SabqFonts.app(size: 11, weight: .semibold))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .lineLimit(1)
                    } else if let c = angle.topicCount {
                        Text("\(c) موضوعًا")
                            .font(SabqFonts.app(size: 11, weight: .semibold))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                            .monospacedDigit()
                    }
                    Spacer(minLength: 0)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(width: 168, height: 58, alignment: .topLeading)
        }
        .frame(width: 168, height: 154)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(SabqTheme.surface))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(theme.border, lineWidth: 0.5))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

// MARK: - بطاقة موضوع (قائمة عمودية)

struct MuqTopicCard: View {
    let topic: MuqTopic
    var showAnglePill: Bool = false
    var angleColorHex: String? = nil
    private var theme: MuqTheme { MuqTheme(angleColorHex ?? topic.angle?.colorHex) }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                if showAnglePill, let name = topic.angle?.name, !name.isEmpty {
                    Text(name)
                        .font(SabqFonts.app(size: 10, weight: .heavy))
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .foregroundStyle(theme.color)
                        .background(Capsule().fill(theme.soft))
                }
                Text(topic.title)
                    .font(SabqFonts.app(size: 16, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                if let excerpt = topic.excerpt, !excerpt.isEmpty {
                    Text(excerpt)
                        .font(SabqFonts.app(size: 12))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .lineLimit(2)
                }
                HStack(spacing: 10) {
                    if let date = muqFormatDate(topic.publishedAt) {
                        Label(date, systemImage: "calendar")
                            .font(SabqFonts.app(size: 10, weight: .semibold))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                    if let views = topic.viewCount, views > 0 {
                        Label("\(views)", systemImage: "eye.fill")
                            .font(SabqFonts.app(size: 10, weight: .semibold))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                            .monospacedDigit()
                    }
                }
                .labelStyle(.titleAndIcon)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if let raw = topic.heroImageUrl, let url = URL(string: URLConstants.absolutize(raw)) {
                CachedAsyncImage(url: url, contentMode: .fill, maxPixelSize: 600) {
                    RoundedRectangle(cornerRadius: 14, style: .continuous).fill(SabqTheme.outline.opacity(0.4))
                }
                .frame(width: 88, height: 88)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous).fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous).stroke(theme.border, lineWidth: 0.5)
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
            let content = HStack(spacing: 10) {
                avatar(writer, name: name)
                VStack(alignment: .leading, spacing: 2) {
                    Text(name)
                        .font(SabqFonts.app(size: 14, weight: .heavy))
                        .foregroundStyle(SabqTheme.ink)
                    Text(angleName.map { "كاتب زاوية \($0)" } ?? "كاتب الزاوية")
                        .font(SabqFonts.app(size: 11, weight: .medium))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
            }
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
            if let raw = writer.avatar, let url = URL(string: URLConstants.absolutize(raw)) {
                CachedAsyncImage(url: url, contentMode: .fill, maxPixelSize: 200) {
                    Circle().fill(theme.soft)
                }
            } else {
                Circle().fill(theme.soft)
                Text(String(name.prefix(1)))
                    .font(SabqFonts.app(size: 16, weight: .heavy))
                    .foregroundStyle(theme.color)
            }
        }
        .frame(width: 44, height: 44)
        .clipShape(Circle())
        .overlay(Circle().stroke(theme.border, lineWidth: 2))
    }
}

// MARK: - صفحة الزاوية

struct MuqtarabAngleView: View {
    let slug: String
    let initialName: String?
    let initialColorHex: String?

    @Environment(\.dismiss) private var dismiss
    @State private var angle: MuqAngle?
    @State private var writer: MuqWriter?
    @State private var topics: [MuqTopic] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    private var theme: MuqTheme { MuqTheme(angle?.colorHex ?? initialColorHex) }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                hero

                if isLoading && topics.isEmpty {
                    VStack(spacing: 12) {
                        SkeletonBox(height: 120, radius: SabqTheme.tileRadius)
                        SkeletonBox(height: 120, radius: SabqTheme.tileRadius)
                    }
                    .padding(.horizontal, 18)
                } else if let errorMessage, topics.isEmpty {
                    EmptyStateView(
                        icon: "exclamationmark.shield", tint: SabqTheme.coral,
                        title: "تعذّر التحميل", subtitle: errorMessage,
                        action: { Task { await load() } }, actionTitle: "إعادة المحاولة"
                    )
                    .padding(.horizontal, 18)
                } else if topics.isEmpty {
                    EmptyStateView(
                        icon: "doc.text", tint: theme.color,
                        title: "لا توجد مواضيع منشورة",
                        subtitle: "لم ينشر كاتب هذه الزاوية مواضيع بعد."
                    )
                    .padding(.horizontal, 18)
                } else {
                    VStack(alignment: .leading, spacing: 12) {
                        sectionTitle("المواضيع")
                        ForEach(topics) { topic in
                            NavigationLink(value: MuqtarabTopicRoute(
                                angleSlug: slug, topicSlug: topic.slug, title: topic.title
                            )) {
                                MuqTopicCard(topic: topic, angleColorHex: angle?.colorHex ?? initialColorHex)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 18)
                }
            }
            .padding(.bottom, 60)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.right")
                        .font(SabqFonts.app(size: 16, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                }
            }
        }
        .task { if topics.isEmpty { await load() } }
    }

    private func sectionTitle(_ text: String) -> some View {
        HStack(spacing: 8) {
            theme.gradient.frame(width: 4, height: 20).clipShape(Capsule())
            Text(text).font(SabqFonts.app(size: 18, weight: .heavy)).foregroundStyle(SabqTheme.ink)
        }
    }

    private var hero: some View {
        ZStack(alignment: .bottomLeading) {
            // خلفية: غلاف الزاوية أو تدرّج لونها
            Group {
                if let raw = angle?.coverImageUrl, let url = URL(string: URLConstants.absolutize(raw)) {
                    CachedAsyncImage(url: url, contentMode: .fill) { theme.gradient }
                } else {
                    theme.gradient
                }
            }
            .overlay(
                LinearGradient(colors: [theme.color.opacity(0.55), .black.opacity(0.55)],
                               startPoint: .top, endPoint: .bottom)
            )

            VStack(alignment: .leading, spacing: 12) {
                ZStack {
                    Circle().fill(.white.opacity(0.22)).frame(width: 64, height: 64)
                    Image(systemName: muqSymbol(angle?.iconKey))
                        .font(SabqFonts.app(size: 28, weight: .bold))
                        .foregroundStyle(.white)
                }

                Text(angle?.nameAr ?? initialName ?? "زاوية")
                    .font(SabqFonts.app(size: 28, weight: .heavy))
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)

                if let writer, let name = writer.name, !name.isEmpty {
                    HStack(spacing: 8) {
                        writerAvatarOnDark(writer, name: name)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(name).font(SabqFonts.app(size: 14, weight: .heavy)).foregroundStyle(.white)
                            Text("كاتب الزاوية").font(SabqFonts.app(size: 11)).foregroundStyle(.white.opacity(0.8))
                        }
                    }
                }

                if let desc = angle?.shortDesc, !desc.isEmpty {
                    Text(desc)
                        .font(SabqFonts.app(size: 14))
                        .foregroundStyle(.white.opacity(0.92))
                        .lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 10) {
                    Text("\(topics.count) موضوع")
                        .font(SabqFonts.app(size: 11, weight: .heavy))
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .foregroundStyle(.white)
                        .background(Capsule().fill(.white.opacity(0.2)))
                    Button { shareAngle() } label: {
                        Label("مشاركة", systemImage: "square.and.arrow.up")
                            .font(SabqFonts.app(size: 11, weight: .heavy))
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .foregroundStyle(.white)
                            .background(Capsule().fill(.white.opacity(0.16)))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, minHeight: 240, alignment: .bottomLeading)
        .clipShape(RoundedRectangle(cornerRadius: 0))
        .overlay(alignment: .topLeading) { Color.clear }
    }

    private func writerAvatarOnDark(_ writer: MuqWriter, name: String) -> some View {
        ZStack {
            if let raw = writer.avatar, let url = URL(string: URLConstants.absolutize(raw)) {
                CachedAsyncImage(url: url, contentMode: .fill, maxPixelSize: 200) { Circle().fill(.white.opacity(0.2)) }
            } else {
                Circle().fill(.white.opacity(0.2))
                Text(String(name.prefix(1))).font(SabqFonts.app(size: 14, weight: .heavy)).foregroundStyle(.white)
            }
        }
        .frame(width: 38, height: 38)
        .clipShape(Circle())
        .overlay(Circle().stroke(.white.opacity(0.4), lineWidth: 2))
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

    @Environment(\.dismiss) private var dismiss
    @State private var topic: MuqTopic?
    @State private var angle: MuqAngle?
    @State private var writer: MuqWriter?
    @State private var related: [MuqTopic] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var didReportView = false

    private var theme: MuqTheme { MuqTheme(angle?.colorHex) }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                if isLoading && topic == nil {
                    VStack(spacing: 12) {
                        SkeletonBox(height: 28, radius: 8)
                        SkeletonBox(height: 40, radius: 8)
                        SkeletonBox(height: 90, radius: SabqTheme.tileRadius)
                        SkeletonBox(height: 200, radius: SabqTheme.tileRadius)
                    }
                } else if let errorMessage, topic == nil {
                    EmptyStateView(
                        icon: "exclamationmark.shield", tint: SabqTheme.coral,
                        title: "تعذّر التحميل", subtitle: errorMessage,
                        action: { Task { await load() } }, actionTitle: "إعادة المحاولة"
                    )
                } else if let t = topic {
                    detailContent(t)
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 14)
            .padding(.bottom, 60)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.right")
                        .font(SabqFonts.app(size: 16, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                }
            }
            ToolbarItem(placement: .primaryAction) {
                Button { share() } label: {
                    Image(systemName: "square.and.arrow.up")
                        .font(SabqFonts.app(size: 15, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                }
            }
        }
        .task { if topic == nil { await load() } }
    }

    @ViewBuilder
    private func detailContent(_ t: MuqTopic) -> some View {
        // شارة الزاوية
        NavigationLink(value: MuqtarabAngleRoute(slug: angleSlug, name: angle?.nameAr, colorHex: angle?.colorHex)) {
            HStack(spacing: 6) {
                Image(systemName: muqSymbol(angle?.iconKey)).font(SabqFonts.app(size: 12, weight: .semibold))
                Text("زاوية \(angle?.nameAr ?? "مُقترب")").font(SabqFonts.app(size: 12, weight: .heavy))
            }
            .foregroundStyle(theme.color)
            .padding(.horizontal, 12).padding(.vertical, 6)
            .background(Capsule().fill(theme.soft))
        }
        .buttonStyle(.plain)

        // العنوان + خط متدرّج
        Text(t.title)
            .font(SabqFonts.app(size: 26, weight: .heavy))
            .foregroundStyle(SabqTheme.ink)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
        theme.gradient.frame(width: 72, height: 4).clipShape(Capsule())

        // الكاتب + بيانات القراءة
        MuqWriterByline(writer: writer, angleName: angle?.nameAr, theme: theme)
        metaRow(t)

        // الموجز الذكي (مميّز بإطار متدرّج)
        if let excerpt = t.excerpt, !excerpt.isEmpty {
            smartSummary(excerpt)
        }

        // الصورة البارزة
        if let raw = t.heroImageUrl, let url = URL(string: URLConstants.absolutize(raw)) {
            CachedAsyncImage(url: url, contentMode: .fill) {
                RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous).fill(SabqTheme.outline.opacity(0.4))
            }
            .frame(maxWidth: .infinity).frame(height: 210)
            .clipShape(RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous))
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
            relatedSection
        }
    }

    private func metaRow(_ t: MuqTopic) -> some View {
        HStack(spacing: 12) {
            if let date = muqFormatDate(t.publishedAt) {
                Label(date, systemImage: "calendar")
            }
            Label("\(muqReadingMinutes(t)) دقائق قراءة", systemImage: "clock")
            if let views = t.viewCount, views > 0 {
                Label("\(views) مشاهدة", systemImage: "eye.fill").monospacedDigit()
            }
        }
        .font(SabqFonts.app(size: 11, weight: .semibold))
        .foregroundStyle(SabqTheme.tertiaryInk)
        .labelStyle(.titleAndIcon)
    }

    private func smartSummary(_ excerpt: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles").font(SabqFonts.app(size: 12, weight: .bold))
                Text("الموجز الذكي").font(SabqFonts.app(size: 12, weight: .heavy))
                Text("AI")
                    .font(SabqFonts.app(size: 9, weight: .heavy))
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Capsule().fill(theme.soft))
            }
            .foregroundStyle(theme.color)

            Text(excerpt)
                .font(SabqFonts.app(size: 16))
                .foregroundStyle(SabqTheme.ink.opacity(0.92))
                .lineSpacing(6)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(SabqTheme.surface))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(theme.gradient, lineWidth: 1.5))
    }

    @ViewBuilder
    private func topicBody(_ t: MuqTopic) -> some View {
        let html = t.html
        if !html.isEmpty {
            let cleaned = muqStripDuplicateLead(html: html, title: t.title, excerpt: t.excerpt)
            ArticleContentView(
                blocks: ArticleHtmlParser.parse(cleaned),
                fontSize: 16, lineSpacing: 6, useReaderFont: false
            )
        } else if !t.fallbackText.isEmpty {
            Text(t.fallbackText)
                .font(SabqFonts.app(size: 16))
                .foregroundStyle(SabqTheme.ink.opacity(0.9))
                .lineSpacing(6)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func keywordsRow(_ keywords: [String]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("الكلمات المفتاحية")
                .font(SabqFonts.app(size: 12, weight: .heavy))
                .foregroundStyle(SabqTheme.tertiaryInk)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(keywords, id: \.self) { tag in
                        Text("#\(tag)")
                            .font(SabqFonts.app(size: 11, weight: .semibold))
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .foregroundStyle(theme.color)
                            .background(Capsule().fill(theme.soft))
                    }
                }
                .padding(.vertical, 2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func signatureCard(_ sig: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle().fill(theme.soft).frame(width: 44, height: 44)
                Image(systemName: "person.fill").font(SabqFonts.app(size: 18, weight: .semibold)).foregroundStyle(theme.color)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("توقيع الكاتب").font(SabqFonts.app(size: 11, weight: .heavy)).foregroundStyle(theme.color)
                Text(sig)
                    .font(SabqFonts.app(size: 14, weight: .medium))
                    .foregroundStyle(SabqTheme.ink)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(theme.softer))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(theme.border, lineWidth: 0.5))
    }

    private var relatedSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: muqSymbol(angle?.iconKey)).font(SabqFonts.app(size: 15, weight: .bold))
                Text("المزيد من \(angle?.nameAr ?? "الزاوية")").font(SabqFonts.app(size: 17, weight: .heavy))
            }
            .foregroundStyle(theme.color)
            ForEach(related) { topic in
                NavigationLink(value: MuqtarabTopicRoute(angleSlug: angleSlug, topicSlug: topic.slug, title: topic.title)) {
                    MuqTopicCard(topic: topic, angleColorHex: angle?.colorHex)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 4)
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

    @Environment(\.dismiss) private var dismiss
    @State private var profile: MuqWriterProfile?
    @State private var isLoading = true
    @State private var errorMessage: String?

    private var theme: MuqTheme { MuqTheme(profile?.angles.first?.colorHex) }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                if isLoading && profile == nil {
                    VStack(spacing: 14) {
                        SkeletonBox(height: 220, radius: SabqTheme.tileRadius)
                        SkeletonBox(height: 120, radius: SabqTheme.tileRadius)
                    }
                } else if let errorMessage, profile == nil {
                    EmptyStateView(
                        icon: "person.crop.circle.badge.exclamationmark", tint: SabqTheme.coral,
                        title: "الكاتب غير موجود", subtitle: errorMessage,
                        action: { Task { await load() } }, actionTitle: "إعادة المحاولة"
                    )
                } else if let p = profile {
                    content(p)
                }
            }
            .padding(.bottom, 60)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.right")
                        .font(SabqFonts.app(size: 16, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                }
            }
        }
        .task { if profile == nil { await load() } }
    }

    @ViewBuilder
    private func content(_ p: MuqWriterProfile) -> some View {
        hero(p)

        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text("مواضيع الكاتب").font(SabqFonts.app(size: 18, weight: .heavy)).foregroundStyle(SabqTheme.ink)
                Text("\(p.topics.count)")
                    .font(SabqFonts.app(size: 12, weight: .heavy)).monospacedDigit()
                    .padding(.horizontal, 8).padding(.vertical, 2)
                    .foregroundStyle(theme.color).background(Capsule().fill(theme.soft))
            }

            if p.topics.isEmpty {
                EmptyStateView(
                    icon: "doc.text", tint: theme.color,
                    title: "لا مواضيع بعد", subtitle: "لم ينشر هذا الكاتب مواضيع حتى الآن."
                )
            } else {
                ForEach(p.topics) { topic in
                    NavigationLink(value: MuqtarabTopicRoute(angleSlug: topic.angleSlug, topicSlug: topic.slug, title: topic.title)) {
                        writerTopicCard(topic)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 18)
    }

    private func hero(_ p: MuqWriterProfile) -> some View {
        VStack(spacing: 12) {
            ZStack {
                if let raw = p.writer.avatar, let url = URL(string: URLConstants.absolutize(raw)) {
                    CachedAsyncImage(url: url, contentMode: .fill, maxPixelSize: 300) { Circle().fill(.white.opacity(0.2)) }
                } else {
                    Circle().fill(.white.opacity(0.2))
                    Text(String(p.writer.name.prefix(1))).font(SabqFonts.app(size: 36, weight: .heavy)).foregroundStyle(.white)
                }
            }
            .frame(width: 96, height: 96)
            .clipShape(Circle())
            .overlay(Circle().stroke(.white.opacity(0.45), lineWidth: 3))

            Text(p.writer.name).font(SabqFonts.app(size: 24, weight: .heavy)).foregroundStyle(.white)
            Text("كاتب في مُقترب").font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(.white.opacity(0.8))

            if let bio = p.writer.bio, !bio.isEmpty {
                Text(bio)
                    .font(SabqFonts.app(size: 14))
                    .foregroundStyle(.white.opacity(0.92))
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .padding(.horizontal, 8)
            }

            if !p.angles.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(p.angles) { a in
                            NavigationLink(value: MuqtarabAngleRoute(slug: a.slug, name: a.nameAr, colorHex: a.colorHex)) {
                                HStack(spacing: 5) {
                                    Image(systemName: muqSymbol(a.iconKey)).font(SabqFonts.app(size: 11, weight: .semibold))
                                    Text(a.nameAr).font(SabqFonts.app(size: 12, weight: .semibold))
                                }
                                .foregroundStyle(.white)
                                .padding(.horizontal, 12).padding(.vertical, 7)
                                .background(Capsule().fill(.white.opacity(0.18)))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 18)
                }
            }
        }
        .padding(.vertical, 28)
        .padding(.horizontal, 18)
        .frame(maxWidth: .infinity)
        .background(theme.gradient)
    }

    private func writerTopicCard(_ topic: MuqWriterTopic) -> some View {
        let t = MuqTheme(topic.colorHex)
        return HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Text(topic.angleName)
                    .font(SabqFonts.app(size: 10, weight: .heavy))
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .foregroundStyle(t.color).background(Capsule().fill(t.soft))
                Text(topic.title)
                    .font(SabqFonts.app(size: 16, weight: .heavy)).foregroundStyle(SabqTheme.ink)
                    .lineLimit(2).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                if let e = topic.excerpt, !e.isEmpty {
                    Text(e).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.secondaryInk).lineLimit(2)
                }
                HStack(spacing: 10) {
                    if let date = muqFormatDate(topic.publishedAt) {
                        Label(date, systemImage: "calendar")
                    }
                    if let v = topic.viewCount, v > 0 {
                        Label("\(v)", systemImage: "eye.fill").monospacedDigit()
                    }
                }
                .font(SabqFonts.app(size: 10, weight: .semibold))
                .foregroundStyle(SabqTheme.tertiaryInk)
                .labelStyle(.titleAndIcon)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if let raw = topic.heroImageUrl, let url = URL(string: URLConstants.absolutize(raw)) {
                CachedAsyncImage(url: url, contentMode: .fill, maxPixelSize: 600) {
                    RoundedRectangle(cornerRadius: 14, style: .continuous).fill(SabqTheme.outline.opacity(0.4))
                }
                .frame(width: 88, height: 88)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous).fill(SabqTheme.surface))
        .overlay(RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous).stroke(t.border, lineWidth: 0.5))
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
