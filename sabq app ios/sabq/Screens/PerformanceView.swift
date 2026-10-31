import SwiftUI

// «أداء أخباري» / «أدائي» (2026-10-31، النموذج المعتمد):
// طلب واحد GET /api/v1/editorial/performance، والصفحة تفتح فورًا بآخر
// أرقام محفوظة ثم تتحدث. بطاقة مشاهدات واحدة كبيرة بخط 30 يومًا، والتفاعل
// في سطر واحد، ثم أكثر الأخبار قراءة، وحالة الأخبار، والنشاط، وتعليق القرّاء.

// MARK: - Model

nonisolated struct ContributorPerformance: Codable {
    struct Day: Codable, Hashable {
        let date: String
        let views: Int
    }
    struct TopArticle: Codable, Identifiable {
        let id: String
        let title: String
        let slug: String?
        let imageUrl: String?
        let views: Int
        let likes: Int
        let comments: Int
    }
    struct StatusCounts: Codable {
        let published: Int
        let pending: Int
        let needsChanges: Int
        let scheduled: Int
        let draft: Int
    }
    struct Activity: Codable {
        let thisWeekCount: Int
        let lastPublishedAt: String?
    }
    struct Rank: Codable {
        let rank: Int
        let total: Int
    }
    struct Comment: Codable {
        let content: String
        let articleTitle: String
    }

    let role: String
    let period: String
    let generatedAt: String
    let views: Int
    let viewsTrendPct: Int?
    let publishedInPeriod: Int
    let series: [Day]
    let peak: Day?
    let likes: Int
    let comments: Int
    let bookmarks: Int
    let newFollowers: Int
    let topArticles: [TopArticle]
    let statusCounts: StatusCounts
    let activity: Activity
    let rank: Rank?
    let featuredComment: Comment?
}

enum PerformancePeriod: String, CaseIterable, Identifiable {
    case week = "7"
    case month = "30"
    case all

    var id: String { rawValue }
    var title: String {
        switch self {
        case .week: return "7 أيام"
        case .month: return "30 يومًا"
        case .all: return "كل الوقت"
        }
    }
    var spanText: String {
        switch self {
        case .week: return "خلال 7 أيام"
        case .month: return "خلال 30 يومًا"
        case .all: return "منذ البداية"
        }
    }
}

// MARK: - ViewModel

@MainActor
final class PerformanceViewModel: ObservableObject {
    @Published var period: PerformancePeriod = .month
    @Published var data: ContributorPerformance?
    @Published var refreshing = false
    @Published var error: EditorialError?

    private static let cachePrefix = "perf-snapshot-v1-"

    func load() async {
        if data == nil || data?.period != period.rawValue {
            data = Self.cached(period)
        }
        refreshing = true
        error = nil
        do {
            let fresh = try await EditorialAPI.performance(period: period.rawValue)
            data = fresh
            Self.store(fresh, period: period)
        } catch let failure as EditorialError {
            error = failure
        } catch {
            self.error = .message("تعذر تحميل الأداء")
        }
        refreshing = false
    }

    private static func cached(_ period: PerformancePeriod) -> ContributorPerformance? {
        guard let raw = UserDefaults.standard.data(forKey: cachePrefix + period.rawValue) else { return nil }
        return try? JSONDecoder().decode(ContributorPerformance.self, from: raw)
    }

    private static func store(_ value: ContributorPerformance, period: PerformancePeriod) {
        if let raw = try? JSONEncoder().encode(value) {
            UserDefaults.standard.set(raw, forKey: cachePrefix + period.rawValue)
        }
    }
}

// MARK: - View

struct PerformanceView: View {
    /// داخل «لوحة الكاتب» (تبويب «أدائي») تُخفى الترويسة.
    var embedded = false

    @StateObject private var vm = PerformanceViewModel()

    private let heroStart = Color(red: 0xE2 / 255, green: 0xF2 / 255, blue: 0xFD / 255)
    private let heroEnd = Color(red: 0xEE / 255, green: 0xF1 / 255, blue: 0xFE / 255)
    private let softBlue = Color(red: 0xE6 / 255, green: 0xF4 / 255, blue: 0xFD / 255)
    private let hairline = Color(red: 0xEE / 255, green: 0xF2 / 255, blue: 0xF6 / 255)
    private let neutralBar = Color(red: 0xC4 / 255, green: 0xCF / 255, blue: 0xDB / 255)

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space16 + 2) {
                if !embedded { header }
                periodPicker
                if let data = vm.data {
                    hero(data)
                    engagementRow(data)
                    topArticlesSection(data)
                    statusSection(data)
                    activitySection(data)
                    if let comment = data.featuredComment { commentSection(comment) }
                    if !embedded && data.role != "writer" {
                        NavigationLink(value: MyNewsRoute()) {
                            Text("افتح «أخباري»")
                                .sabqText(SabqType.button)
                                .foregroundStyle(SabqTheme.primary)
                                .frame(maxWidth: .infinity, minHeight: 48)
                                .background(Capsule().fill(softBlue))
                        }
                        .buttonStyle(.plain)
                    }
                } else if let error = vm.error {
                    EditorialStatusView(error: error, loading: false) { Task { await vm.load() } }
                } else {
                    skeleton
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin + 4)
            .padding(.top, SabqLayout.space8)
            .padding(.bottom, SabqLayout.tabBarClearance)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load() }
        .refreshable { await vm.load() }
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 4) {
                Text(vm.data?.role == "writer" ? "لوحة الكاتب" : "لوحة المراسل")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textTertiary)
                Text(vm.data?.role == "writer" ? "أدائي" : "أداء أخباري")
                    .font(SabqFonts.app(size: 28, weight: .bold))
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
            }
            Spacer(minLength: 0)
            freshness
        }
    }

    @ViewBuilder
    private var freshness: some View {
        if vm.refreshing && vm.data != nil {
            Text("يحدّث الأرقام…")
                .sabqText(SabqType.tag)
                .foregroundStyle(SabqTheme.primary)
                .padding(.horizontal, SabqLayout.space12)
                .padding(.vertical, 6)
                .background(Capsule().fill(softBlue))
        } else if vm.error != nil && vm.data != nil {
            Text("آخر أرقام محفوظة")
                .sabqText(SabqType.tag)
                .foregroundStyle(SabqTheme.warning)
        }
    }

    private var periodPicker: some View {
        HStack(spacing: SabqLayout.space8) {
            ForEach(PerformancePeriod.allCases) { period in
                let selected = vm.period == period
                Button {
                    guard !selected else { return }
                    vm.period = period
                    Task { await vm.load() }
                } label: {
                    Text(period.title)
                        .sabqText(selected ? SabqType.metaEmphasis : SabqType.meta)
                        .foregroundStyle(selected ? SabqTheme.onAction : SabqTheme.textPrimary)
                        .padding(.horizontal, 18)
                        .frame(minHeight: 40)
                        .background(Capsule().fill(selected ? SabqTheme.actionFill : SabqTheme.surface))
                        .shadow(color: selected ? SabqTheme.primary.opacity(0.3) : SabqTheme.shadow, radius: selected ? 7 : 4, y: 3)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
            Spacer(minLength: 0)
            if embedded { freshness }
        }
    }

    // MARK: Hero

    private func hero(_ data: ContributorPerformance) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(data.role == "writer" ? "مشاهدات مقالاتي" : "مشاهدات أخباري")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                    Text(data.views.formatted(.number.locale(Locale(identifier: "en_US"))))
                        .font(SabqFonts.app(size: 40, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(SabqTheme.textPrimary)
                    Text(publishedLine(data))
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
                Spacer(minLength: SabqLayout.space8)
                if let trend = data.viewsTrendPct {
                    Text(trend >= 0 ? "+\(trend)% عن الفترة السابقة" : "\(trend)% عن الفترة السابقة")
                        .sabqText(SabqType.tag)
                        .foregroundStyle(trend >= 0 ? SabqTheme.success : SabqTheme.warning)
                        .padding(.horizontal, SabqLayout.space12)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(SabqTheme.surface.opacity(0.85)))
                }
            }
            PerformanceSparkline(values: data.series.map(\.views), peakIndex: peakIndex(data))
                .frame(height: 70)
                .accessibilityLabel("المشاهدات اليومية")
            HStack {
                Text(dayLabel(data.series.first?.date))
                Spacer()
                if let peak = data.peak {
                    Text("الذروة: \(peak.views) يوم \(dayLabel(peak.date))")
                        .foregroundStyle(SabqTheme.primary)
                        .fontWeight(.semibold)
                }
                Spacer()
                Text("اليوم")
            }
            .sabqText(SabqType.tag)
            .foregroundStyle(SabqTheme.textTertiary)
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(LinearGradient(colors: [heroStart, heroEnd], startPoint: .topTrailing, endPoint: .bottomLeading))
        )
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white, lineWidth: 1))
    }

    private func publishedLine(_ data: ContributorPerformance) -> String {
        let noun = data.role == "writer" ? "مقال" : "خبر"
        let count = data.publishedInPeriod
        let counted = count == 1 ? "\(noun) واحد منشور" : count == 2 ? (data.role == "writer" ? "مقالين منشورين" : "خبرين منشورين") : "\(count) \(noun) منشور"
        return "من \(counted) \(vm.period.spanText)"
    }

    private func peakIndex(_ data: ContributorPerformance) -> Int? {
        guard let peak = data.peak else { return nil }
        return data.series.firstIndex(of: peak)
    }

    // MARK: Engagement

    private func engagementRow(_ data: ContributorPerformance) -> some View {
        HStack(spacing: 0) {
            engagementCell(data.likes, "إعجاب")
            divider
            engagementCell(data.comments, "تعليق")
            divider
            engagementCell(data.bookmarks, "حفظ")
            divider
            engagementCell(data.newFollowers, vm.period == .all ? "متابع" : "متابع جديد")
        }
        .padding(.vertical, 14)
        .background(surface)
    }

    private var divider: some View {
        Rectangle().fill(hairline).frame(width: 1, height: 36)
    }

    private func engagementCell(_ value: Int, _ label: String) -> some View {
        VStack(spacing: 4) {
            Text("\(value)")
                .font(SabqFonts.app(size: 20, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(SabqTheme.textPrimary)
            Text(label)
                .sabqText(SabqType.tag)
                .foregroundStyle(SabqTheme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    // MARK: Top articles

    @ViewBuilder
    private func topArticlesSection(_ data: ContributorPerformance) -> some View {
        if !data.topArticles.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                sectionTitle(data.role == "writer" ? "أكثر مقالاتي قراءة" : "أكثر أخباري قراءة")
                VStack(spacing: 0) {
                    let top = max(data.topArticles.first?.views ?? 1, 1)
                    ForEach(Array(data.topArticles.enumerated()), id: \.element.id) { index, article in
                        topRow(article, index: index, maxViews: top, isWriter: data.role == "writer")
                        if index < data.topArticles.count - 1 {
                            Rectangle().fill(hairline).frame(height: 1)
                        }
                    }
                }
                .background(surface)
            }
        }
    }

    @ViewBuilder
    private func topRow(_ article: ContributorPerformance.TopArticle, index: Int, maxViews: Int, isWriter: Bool) -> some View {
        let content = HStack(alignment: .top, spacing: SabqLayout.space12) {
            Text("\(index + 1)")
                .font(SabqFonts.app(size: 13, weight: .bold))
                .foregroundStyle(index == 0 ? SabqTheme.onAction : SabqTheme.primary)
                .frame(width: 26, height: 26)
                .background(Circle().fill(index == 0 ? SabqTheme.actionFill : softBlue))
            VStack(alignment: .leading, spacing: 6) {
                Text(article.title)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule().fill(softBlue)
                        Capsule()
                            .fill(index == 0 ? SabqTheme.actionFill : SabqTheme.primary.opacity(0.55))
                            .frame(width: max(6, proxy.size.width * CGFloat(article.views) / CGFloat(maxViews)))
                    }
                }
                .frame(height: 6)
                .accessibilityHidden(true)
                Text("\(article.views) مشاهدة · \(article.likes) إعجاب · \(article.comments) تعليق")
                    .sabqText(SabqType.tag)
                    .foregroundStyle(SabqTheme.textTertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .contentShape(Rectangle())

        if let slug = article.slug, !slug.isEmpty {
            if isWriter {
                NavigationLink(value: OpinionSlugRoute(slug: slug)) { content }.buttonStyle(.plain)
            } else {
                NavigationLink(value: ArticleSlugRoute(slug: slug)) { content }.buttonStyle(.plain)
            }
        } else {
            content
        }
    }

    // MARK: Status

    private func statusSection(_ data: ContributorPerformance) -> some View {
        let c = data.statusCounts
        let parts: [StatusPart] = [
            StatusPart(title: EditorialStates.filterPublished, count: c.published, color: SabqTheme.success),
            StatusPart(title: EditorialStates.filterPending, count: c.pending, color: SabqTheme.primary),
            StatusPart(title: EditorialStates.filterNeedsChanges, count: c.needsChanges, color: SabqTheme.warning),
            StatusPart(title: EditorialStates.filterScheduled, count: c.scheduled, color: SabqTheme.teal),
            StatusPart(title: EditorialStates.filterDraft, count: c.draft, color: neutralBar),
        ]
        let total = max(parts.reduce(0) { $0 + $1.count }, 1)
        return VStack(alignment: .leading, spacing: 10) {
            sectionTitle(data.role == "writer" ? "مقالاتي الآن" : "أخباري الآن")
            VStack(alignment: .leading, spacing: 14) {
                GeometryReader { proxy in
                    HStack(spacing: 3) {
                        ForEach(parts.filter { $0.count > 0 }) { part in
                            Capsule()
                                .fill(part.color)
                                .frame(width: max(8, (proxy.size.width - 12) * CGFloat(part.count) / CGFloat(total)))
                        }
                    }
                }
                .frame(height: 12)
                .accessibilityHidden(true)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 16), GridItem(.flexible())], alignment: .leading, spacing: 10) {
                    ForEach(parts) { part in
                        HStack(spacing: 8) {
                            Circle().fill(part.color).frame(width: 9, height: 9)
                            Text(part.title)
                                .sabqText(SabqType.excerpt)
                                .foregroundStyle(SabqTheme.textPrimary)
                            Spacer(minLength: 4)
                            Text("\(part.count)")
                                .font(SabqFonts.app(size: 15, weight: .bold))
                                .monospacedDigit()
                                .foregroundStyle(SabqTheme.textPrimary)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            .padding(16)
            .background(surface)
        }
    }

    // MARK: Activity

    private func activitySection(_ data: ContributorPerformance) -> some View {
        let noun = data.role == "writer" ? "مقال" : "خبر"
        let week = data.activity.thisWeekCount
        return VStack(alignment: .leading, spacing: 10) {
            sectionTitle("نشاطي")
            VStack(spacing: 0) {
                activityRow(icon: "calendar", tint: SabqTheme.primary, title: "نشرت هذا الأسبوع",
                            value: week == 0 ? "لا شيء بعد" : week == 1 ? "\(noun) واحد" : "\(week)")
                Rectangle().fill(hairline).frame(height: 1)
                activityRow(icon: "clock", tint: SabqTheme.success, title: data.role == "writer" ? "آخر مقال نُشر" : "آخر خبر نُشر",
                            value: lastPublished(data.activity.lastPublishedAt))
                if let rank = data.rank {
                    Rectangle().fill(hairline).frame(height: 1)
                    activityRow(icon: "trophy", tint: SabqTheme.warning,
                                title: data.role == "writer" ? "ترتيبي بين الكتّاب" : "ترتيبي بين المراسلين",
                                subtitle: "بالمشاهدات هذا الشهر",
                                value: "#\(rank.rank) من \(rank.total)")
                }
            }
            .background(surface)
        }
    }

    private func activityRow(icon: String, tint: Color, title: String, subtitle: String? = nil, value: String) -> some View {
        HStack(spacing: SabqLayout.space12) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 16, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 36, height: 36)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(tint.opacity(0.12)))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                if let subtitle {
                    Text(subtitle)
                        .sabqText(SabqType.tag)
                        .foregroundStyle(SabqTheme.textTertiary)
                }
            }
            Spacer(minLength: 8)
            Text(value)
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(SabqTheme.textPrimary)
        }
        .padding(14)
        .accessibilityElement(children: .combine)
    }

    private func commentSection(_ comment: ContributorPerformance.Comment) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("من القرّاء")
            VStack(alignment: .leading, spacing: 8) {
                Text("«\(comment.content)»")
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                Text("على: \(comment.articleTitle)")
                    .sabqText(SabqType.tag)
                    .foregroundStyle(SabqTheme.textTertiary)
                    .lineLimit(1)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(surface)
        }
    }

    // MARK: Skeleton

    private var skeleton: some View {
        VStack(spacing: SabqLayout.space16) {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(LinearGradient(colors: [heroStart, heroEnd], startPoint: .topTrailing, endPoint: .bottomLeading))
                .frame(height: 200)
            ForEach(0..<2, id: \.self) { _ in
                VStack(alignment: .leading, spacing: 14) {
                    Capsule().fill(hairline).frame(width: 180, height: 14)
                    Capsule().fill(hairline).frame(height: 14)
                    Capsule().fill(hairline).frame(width: 120, height: 14)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(surface)
            }
        }
        .redacted(reason: .placeholder)
        .accessibilityLabel("نجلب الأرقام")
    }

    // MARK: Helpers

    private var surface: some View {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
            .fill(SabqTheme.surface)
            .shadow(color: SabqTheme.shadow, radius: 10, y: 3)
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(SabqFonts.app(size: 18, weight: .bold))
            .foregroundStyle(SabqTheme.textPrimary)
            .accessibilityAddTraits(.isHeader)
    }

    private static let dayParser: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let dayPrinter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "d MMMM"
        return f
    }()

    private func dayLabel(_ raw: String?) -> String {
        guard let raw, let date = Self.dayParser.date(from: raw) else { return "" }
        return Self.latinDigits(Self.dayPrinter.string(from: date))
    }

    private func lastPublished(_ raw: String?) -> String {
        guard let raw else { return "لا شيء بعد" }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = iso.date(from: raw) ?? ISO8601DateFormatter().date(from: raw) else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar")
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "Asia/Riyadh")
        f.dateFormat = Calendar.current.isDateInToday(date) ? "'اليوم' h:mm" : "d MMMM"
        return Self.latinDigits(f.string(from: date))
    }

    private static func latinDigits(_ text: String) -> String {
        let map: [Character: Character] = ["٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9"]
        return String(text.map { map[$0] ?? $0 })
    }
}

private struct StatusPart: Identifiable {
    let title: String
    let count: Int
    let color: Color
    var id: String { title }
}

/// خط المشاهدات اليومي مع تعبئة ناعمة ونقطة الذروة.
private struct PerformanceSparkline: View {
    let values: [Int]
    let peakIndex: Int?

    var body: some View {
        GeometryReader { proxy in
            let points = coordinates(in: proxy.size)
            ZStack {
                if points.count > 1 {
                    Path { path in
                        path.move(to: CGPoint(x: points[0].x, y: proxy.size.height))
                        points.forEach { path.addLine(to: $0) }
                        path.addLine(to: CGPoint(x: points[points.count - 1].x, y: proxy.size.height))
                        path.closeSubpath()
                    }
                    .fill(LinearGradient(colors: [SabqTheme.primary.opacity(0.22), SabqTheme.primary.opacity(0)],
                                         startPoint: .top, endPoint: .bottom))
                    Path { path in
                        path.move(to: points[0])
                        points.dropFirst().forEach { path.addLine(to: $0) }
                    }
                    .stroke(SabqTheme.primary, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                    if let peakIndex, points.indices.contains(peakIndex) {
                        Circle()
                            .fill(Color.white)
                            .overlay(Circle().stroke(SabqTheme.primary, lineWidth: 2.5))
                            .frame(width: 10, height: 10)
                            .position(points[peakIndex])
                    }
                }
            }
        }
        // الزمن يتقدم من اليسار لليمين كما في الرسوم المعتادة.
        .environment(\.layoutDirection, .leftToRight)
    }

    private func coordinates(in size: CGSize) -> [CGPoint] {
        guard values.count > 1 else { return [] }
        let top = max(values.max() ?? 1, 1)
        let stepX = size.width / CGFloat(values.count - 1)
        return values.enumerated().map { index, value in
            CGPoint(x: CGFloat(index) * stepX,
                    y: size.height - 6 - (size.height - 12) * CGFloat(value) / CGFloat(top))
        }
    }
}
