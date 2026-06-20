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

// MARK: - مساعد ألوان الزوايا

/// لون الزاوية من `colorHex` (#RRGGBB)؛ يسقط إلى لون الثيم عند الفشل.
func muqColor(_ hex: String?) -> Color {
    guard let hex, let ui = UIColor(muqHex: hex) else { return SabqTheme.sky }
    return Color(ui)
}

private extension UIColor {
    convenience init?(muqHex hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let value = UInt64(s, radix: 16) else { return nil }
        self.init(
            red: CGFloat((value & 0xFF0000) >> 16) / 255,
            green: CGFloat((value & 0x00FF00) >> 8) / 255,
            blue: CGFloat(value & 0x0000FF) / 255,
            alpha: 1
        )
    }
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
            VStack(alignment: .leading, spacing: 22) {
                header

                if isLoading && topics.isEmpty && angles.isEmpty {
                    VStack(spacing: 12) {
                        SkeletonBox(height: 96, radius: SabqTheme.tileRadius)
                        SkeletonBox(height: 120, radius: SabqTheme.tileRadius)
                        SkeletonBox(height: 120, radius: SabqTheme.tileRadius)
                    }
                } else if let errorMessage, topics.isEmpty {
                    EmptyStateView(
                        icon: "exclamationmark.shield",
                        tint: SabqTheme.coral,
                        title: "تعذّر التحميل",
                        subtitle: errorMessage,
                        action: { Task { await load() } },
                        actionTitle: "إعادة المحاولة"
                    )
                } else if topics.isEmpty && angles.isEmpty {
                    EmptyStateView(
                        icon: "square.stack.3d.up",
                        tint: SabqTheme.tertiaryInk,
                        title: "لا توجد مواضيع بعد",
                        subtitle: "زوايا مُقترب التحليلية قيد التحضير — قريبًا."
                    )
                } else {
                    if !angles.isEmpty { anglesRow }
                    if !topics.isEmpty { topicsList }
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 18)
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
        .refreshable { await load() }
        .task { if topics.isEmpty && angles.isEmpty { await load() } }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                Circle()
                    .fill(SabqTheme.sky.opacity(0.14))
                    .frame(width: 56, height: 56)
                Image(systemName: "scope")
                    .font(SabqFonts.app(size: 26, weight: .light))
                    .foregroundStyle(SabqTheme.sky)
                    .symbolRenderingMode(.hierarchical)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("مُقترب")
                    .font(SabqFonts.app(size: 22, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                Text("زوايا تحليلية بأقلام كتّاب سبق")
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
        }
    }

    private var anglesRow: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("الزوايا")
                .font(SabqFonts.app(size: 16, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(angles) { angle in
                        NavigationLink(value: MuqtarabAngleRoute(
                            slug: angle.slug,
                            name: angle.nameAr,
                            colorHex: angle.colorHex
                        )) {
                            MuqAngleChip(angle: angle)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private var topicsList: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("أحدث المواضيع")
                .font(SabqFonts.app(size: 16, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
            ForEach(topics) { topic in
                if let angleSlug = topic.angle?.slug {
                    NavigationLink(value: MuqtarabTopicRoute(
                        angleSlug: angleSlug,
                        topicSlug: topic.slug,
                        title: topic.title
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
        let loadedAngles = await anglesTask ?? []
        let loadedTopics = await topicsTask ?? []
        angles = loadedAngles
        topics = loadedTopics
        if loadedAngles.isEmpty && loadedTopics.isEmpty {
            errorMessage = "تحقّق من الاتصال ثم أعد المحاولة."
        }
        isLoading = false
    }
}

// MARK: - بطاقة زاوية (شريط أفقي)

struct MuqAngleChip: View {
    let angle: MuqAngle
    private var tint: Color { muqColor(angle.colorHex) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(tint.opacity(0.16))
                    .frame(width: 38, height: 38)
                Image(systemName: "circle.hexagongrid.fill")
                    .font(SabqFonts.app(size: 18, weight: .semibold))
                    .foregroundStyle(tint)
            }
            Text(angle.nameAr)
                .font(SabqFonts.app(size: 14, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
                .lineLimit(1)
            if let count = angle.topicCount, count > 0 {
                Text("\(count) موضوعًا")
                    .font(SabqFonts.app(size: 10, weight: .semibold))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .monospacedDigit()
            } else if let w = angle.writerName, !w.isEmpty {
                Text(w)
                    .font(SabqFonts.app(size: 10, weight: .semibold))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .lineLimit(1)
            }
        }
        .padding(14)
        .frame(width: 150, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(tint.opacity(0.18), lineWidth: 0.5)
        )
    }
}

// MARK: - بطاقة موضوع

struct MuqTopicCard: View {
    let topic: MuqTopic
    var showAnglePill: Bool = false
    private var tint: Color { muqColor(topic.angle?.colorHex) }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                if showAnglePill, let name = topic.angle?.name, !name.isEmpty {
                    Text(name)
                        .font(SabqFonts.app(size: 10, weight: .heavy))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .foregroundStyle(tint)
                        .background(Capsule().fill(tint.opacity(0.12)))
                }
                Text(topic.title)
                    .font(SabqFonts.app(size: 16, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                    .multilineTextAlignment(.leading)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
                if let excerpt = topic.excerpt, !excerpt.isEmpty {
                    Text(excerpt)
                        .font(SabqFonts.app(size: 12))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .lineLimit(2)
                }
                if let views = topic.viewCount, views > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "eye.fill").font(SabqFonts.app(size: 10))
                        Text("\(views)")
                            .font(SabqFonts.app(size: 11, weight: .semibold))
                            .monospacedDigit()
                    }
                    .foregroundStyle(SabqTheme.tertiaryInk)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if let raw = topic.heroImageUrl, let url = URL(string: URLConstants.absolutize(raw)) {
                CachedAsyncImage(url: url, contentMode: .fill, maxPixelSize: 600) {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(SabqTheme.outline.opacity(0.4))
                }
                .frame(width: 84, height: 84)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(tint.opacity(0.14), lineWidth: 0.5)
        )
    }
}

// MARK: - صفحة الزاوية

struct MuqtarabAngleView: View {
    let slug: String
    let initialName: String?
    let initialColorHex: String?

    @Environment(\.dismiss) private var dismiss
    @State private var angle: MuqAngle?
    @State private var topics: [MuqTopic] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    private var tint: Color { muqColor(angle?.colorHex ?? initialColorHex) }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                header

                if isLoading && topics.isEmpty {
                    VStack(spacing: 12) {
                        SkeletonBox(height: 120, radius: SabqTheme.tileRadius)
                        SkeletonBox(height: 120, radius: SabqTheme.tileRadius)
                    }
                } else if let errorMessage, topics.isEmpty {
                    EmptyStateView(
                        icon: "exclamationmark.shield",
                        tint: SabqTheme.coral,
                        title: "تعذّر التحميل",
                        subtitle: errorMessage,
                        action: { Task { await load() } },
                        actionTitle: "إعادة المحاولة"
                    )
                } else if topics.isEmpty {
                    EmptyStateView(
                        icon: "doc.text",
                        tint: tint,
                        title: "لا توجد مواضيع منشورة",
                        subtitle: "لم ينشر كاتب هذه الزاوية مواضيع بعد."
                    )
                } else {
                    ForEach(topics) { topic in
                        NavigationLink(value: MuqtarabTopicRoute(
                            angleSlug: slug,
                            topicSlug: topic.slug,
                            title: topic.title
                        )) {
                            MuqTopicCard(topic: topic)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 18)
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

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let raw = angle?.coverImageUrl, let url = URL(string: URLConstants.absolutize(raw)) {
                CachedAsyncImage(url: url, contentMode: .fill) {
                    RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                        .fill(tint.opacity(0.12))
                }
                .frame(height: 150)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous))
            }

            HStack(spacing: 6) {
                Image(systemName: "scope")
                    .font(SabqFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(tint)
                Text("مُقترب")
                    .font(SabqFonts.app(size: 11, weight: .heavy))
                    .foregroundStyle(tint)
            }

            Text(angle?.nameAr ?? initialName ?? "زاوية")
                .font(SabqFonts.app(size: 24, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
                .fixedSize(horizontal: false, vertical: true)

            if let desc = angle?.shortDesc, !desc.isEmpty {
                Text(desc)
                    .font(SabqFonts.app(size: 14))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let writer = angle?.writerName, !writer.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "person.fill")
                        .font(SabqFonts.app(size: 11))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                    Text(writer)
                        .font(SabqFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
            }
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        async let angleTask = try? await APIClient.shared.fetchMuqtarabAngle(slug: slug)
        async let topicsTask = try? await APIClient.shared.fetchMuqtarabAngleTopics(slug: slug)
        angle = await angleTask
        let loaded = await topicsTask ?? []
        topics = loaded
        if loaded.isEmpty && angle == nil {
            errorMessage = "تحقّق من الاتصال ثم أعد المحاولة."
        }
        isLoading = false
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
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var didReportView = false

    private var tint: Color { muqColor(angle?.colorHex) }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                if isLoading && topic == nil {
                    VStack(spacing: 12) {
                        SkeletonBox(height: 30, radius: 6)
                        SkeletonBox(height: 16, radius: 6)
                        SkeletonBox(height: 200, radius: SabqTheme.tileRadius)
                    }
                } else if let errorMessage, topic == nil {
                    EmptyStateView(
                        icon: "exclamationmark.shield",
                        tint: SabqTheme.coral,
                        title: "تعذّر التحميل",
                        subtitle: errorMessage,
                        action: { Task { await load() } },
                        actionTitle: "إعادة المحاولة"
                    )
                } else if let t = topic {
                    detailContent(t)
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 18)
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
        VStack(alignment: .leading, spacing: 10) {
            NavigationLink(value: MuqtarabAngleRoute(
                slug: angleSlug,
                name: angle?.nameAr,
                colorHex: angle?.colorHex
            )) {
                HStack(spacing: 6) {
                    Image(systemName: "scope")
                        .font(SabqFonts.app(size: 12, weight: .semibold))
                    Text(angle?.nameAr ?? "مُقترب")
                        .font(SabqFonts.app(size: 11, weight: .heavy))
                }
                .foregroundStyle(tint)
            }
            .buttonStyle(.plain)

            Text(t.title)
                .font(SabqFonts.app(size: 24, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)

            if let w = writer?.name, !w.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "person.fill")
                        .font(SabqFonts.app(size: 11))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                    Text(w)
                        .font(SabqFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
            }
        }

        if let raw = t.heroImageUrl, let url = URL(string: URLConstants.absolutize(raw)) {
            CachedAsyncImage(url: url, contentMode: .fill) {
                RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                    .fill(SabqTheme.outline.opacity(0.4))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 210)
            .clipShape(RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous))
        }

        topicBody(t)

        if let keywords = t.seoMeta?.keywords, !keywords.isEmpty {
            keywordsRow(keywords)
        }
    }

    @ViewBuilder
    private func topicBody(_ t: MuqTopic) -> some View {
        let html = t.html
        if !html.isEmpty {
            ArticleContentView(
                blocks: ArticleHtmlParser.parse(html),
                fontSize: 16,
                lineSpacing: 6,
                useReaderFont: false
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
            Text("كلمات مفتاحية")
                .font(SabqFonts.app(size: 12, weight: .heavy))
                .foregroundStyle(SabqTheme.tertiaryInk)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(keywords, id: \.self) { tag in
                        Text("#\(tag)")
                            .font(SabqFonts.app(size: 11, weight: .semibold))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .foregroundStyle(tint)
                            .background(Capsule().fill(tint.opacity(0.10)))
                    }
                }
                .padding(.vertical, 2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
        } catch {
            errorMessage = "تحقّق من الاتصال ثم أعد المحاولة."
        }
        isLoading = false
    }

    private func share() {
        SabqHaptics.light()
        let link = "\(URLConstants.webOrigin)/muqtarab/\(angleSlug)/topic/\(topicSlug)"
        guard let url = URL(string: link) else { return }
        SabqShareHelper.presentShareSheet(with: url)
    }
}
