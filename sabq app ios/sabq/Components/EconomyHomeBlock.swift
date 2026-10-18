import SwiftUI

// MARK: - أدوات مشتركة لسطوح الاقتصاد

/// ألوان الاتجاه: أدوار الحالة في نظام التصميم (نجاح للصعود، خطر للهبوط).
nonisolated enum EconomyTone {
    static let up = SabqTheme.success
    static let down = SabqTheme.danger

    static func color(_ tone: String) -> Color? {
        switch tone {
        case "up": return up
        case "down": return down
        default: return nil
        }
    }
}

/// شارة «جديد» بنقطة نابضة (48 ساعة من إدخال التقرير).
struct EconomyNewBadge: View {
    @Environment(\.homeSideColumn) private var compactType
    var label: String = "جديد"
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    var body: some View {
        HStack(spacing: SabqLayout.space4) {
            Circle()
                .fill(SabqTheme.onAction)
                .frame(width: 6, height: 6)
                .opacity(pulse ? 0.35 : 1)
                .animation(reduceMotion ? nil : .easeInOut(duration: 1).repeatForever(autoreverses: true), value: pulse)
            Text(label)
                .font(SabqType.tag.scaled(compactType).font)
        }
        .foregroundStyle(SabqTheme.onAction)
        .padding(.horizontal, SabqLayout.space8)
        .padding(.vertical, 2)
        .background(Capsule(style: .continuous).fill(SabqTheme.actionFill))
        .onAppear { pulse = true }
    }
}

/// شريحة التغير: سهم + نسبة مطلقة (قناتان: لون واتجاه) — `ChangeChip.tsx`.
struct EconomyChangeChip: View {
    @Environment(\.homeSideColumn) private var compactType
    let value: Double?
    var digits: Int = 1
    var suffix: String = ""
    var hideEmpty: Bool = false

    private var direction: Int {
        guard let value, value.isFinite else { return 0 }
        if value > 0.0001 { return 1 }
        if value < -0.0001 { return -1 }
        return 0
    }

    var body: some View {
        if value == nil && hideEmpty {
            EmptyView()
        } else {
            let tint: Color = direction > 0 ? EconomyTone.up : (direction < 0 ? EconomyTone.down : SabqTheme.textSecondary)
            HStack(spacing: 2) {
                Text(value == nil ? "—" : (direction > 0 ? "▲" : (direction < 0 ? "▼" : "•")))
                if value != nil {
                    Text(EconomyFormat.fmtPct(value, digits) + suffix)
                        .monospacedDigit()
                }
            }
            .font(SabqType.tag.scaled(compactType).font)
            .foregroundStyle(tint)
            .environment(\.layoutDirection, .leftToRight)
        }
    }
}

/// خط شرارة صغير (88×30 في الويب) — الأقدم يمينًا تحت RTL.
struct EconomySparkline: View {
    let values: [Double]
    var tint: Color = SabqTheme.primary
    var lineWidth: CGFloat = 2

    var body: some View {
        GeometryReader { geo in
            let pts = points(in: geo.size)
            ZStack {
                Path { p in
                    guard let first = pts.first else { return }
                    p.move(to: first)
                    for pt in pts.dropFirst() { p.addLine(to: pt) }
                }
                .stroke(tint, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round))
                if let last = pts.last {
                    Circle().fill(tint).frame(width: 6, height: 6).position(last)
                }
            }
        }
    }

    private func points(in size: CGSize) -> [CGPoint] {
        let v = values.filter(\.isFinite)
        guard v.count >= 2 else { return [] }
        let minV = v.min()!, maxV = v.max()!
        let span = max(maxV - minV, 0.000001)
        let stepX = size.width / CGFloat(v.count - 1)
        // الزمن في RTL يجري من اليمين إلى اليسار: الأقدم يمينًا.
        return v.enumerated().map { i, val in
            let x = size.width - CGFloat(i) * stepX
            let y = size.height - 3 - CGFloat((val - minV) / span) * (size.height - 6)
            return CGPoint(x: x, y: y)
        }
    }
}

// MARK: - رقم اقتصادي واحد في الرئيسية
// تبقى التفاصيل في EconomyView، وتحافظ البطاقة على أولوية النشرة الشهرية
// وشارة الحداثة لمدة 48 ساعة من ingestedAt كما في الويب.

struct EconomyHomeBlock: View {
    @Environment(\.homeSideColumn) private var compactType
    private let store = EconomyStore.shared

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            switch EconomyFormat.homeMode(store.snapshot, now: context.date) {
            case .monthly:
                if let monthly = store.snapshot?.monthly, let card = monthly.cards.first {
                    teaser(
                        title: "رقم من \(monthly.monthLabelAr)",
                        figure: card.figure,
                        caption: card.key == "mobileVsCard"
                            ? "من إنفاق نقاط البيع تم بالجوال"
                            : (card.seriesLabelAr ?? card.cardTitle),
                        badge: "نشرة جديدة",
                        cta: "أرقام الشهر"
                    )
                }
            case .weekly:
                if let weekly = store.snapshot?.weekly {
                    EconomyWeeklyHomeCard(
                        weekly: weekly,
                        isFresh: EconomyFormat.isFresh(weekly.ingestedAt, now: context.date)
                    )
                }
            case .hidden:
                EmptyView()
            }
        }
        .task { await store.loadSnapshotIfNeeded(maxAge: 300) }
    }

    private func teaser(title: String, figure: String, caption: String,
                        badge: String?, cta: String) -> some View {
        ReaderLink(value: EconomyRoute()) {
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                HStack(spacing: SabqLayout.space8) {
                    Text(title)
                        .font(SabqType.rowTitle.scaled(compactType).font)
                        .foregroundStyle(SabqTheme.textPrimary)
                    Spacer(minLength: 0)
                    if let badge { EconomyNewBadge(label: badge) }
                }

                Text(figure)
                    .font(SabqFonts.headline(size: compactType ? 24 : 32))
                    .monospacedDigit()
                    .foregroundStyle(SabqTheme.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.65)
                    .accessibilityIdentifier("economy.home.figure")

                Text(caption)
                    .sabqText(SabqType.meta.scaled(compactType))
                    .foregroundStyle(SabqTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space8) {
                    Text("المصدر: البنك المركزي السعودي")
                        .font(SabqType.tag.scaled(compactType).font)
                        .foregroundStyle(SabqTheme.textTertiary)
                    Spacer(minLength: 0)
                    HStack(spacing: SabqLayout.space4) {
                        Text(cta)
                            .font(SabqType.tag.scaled(compactType).font)
                        Image(systemName: "chevron.left")
                            .font(SabqType.tag.scaled(compactType).font)
                    }
                    .foregroundStyle(SabqTheme.primary)
                    .fixedSize(horizontal: true, vertical: false)
                }
            }
            .padding(SabqLayout.space16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .sabqBlockSurface()
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("عرض تفاصيل الاقتصاد بالقطاعات والمدن")
        .accessibilityIdentifier("economy.home.teaser")
    }
}

// MARK: - بطاقة «أين أنفق السعوديون؟» في الرئيسية
//
// الجزء العلوي ظاهر دائمًا: العنوان، والرقم، والتغيّر عن الأسبوع السابق، وأعمدة
// آخر أربعة أسابيع. سهم صغير يوسّع البطاقة لتظهر «أين؟»: حصص أكبر ثلاثة
// قطاعات ثم رابط التفاصيل (قرار المالك 2026-10-09). كل الأرقام من ملخص الأسبوع
// في `/api/economy/snapshot` بلا طلب إضافي.

struct EconomyWeeklyHomeCard: View {
    @Environment(\.homeSideColumn) private var compactType
    let weekly: EconomyWeeklySummary
    let isFresh: Bool
    @State private var isExpanded = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// عمود الأقسام في رئيسية Duo (ثلث العرض): أعمدة أصغر.
    @Environment(\.homeSpreadLayout) private var narrow

    private var series: [Double] {
        weekly.kpis.first(where: { $0.key == "total" })?.series ?? []
    }

    private var topSectors: [EconomySectorSummary] {
        Array(weekly.topSectors.prefix(3))
    }

    /// ألوان بيانات للحصص (لا نص عليها): الأزرق الأساسي ثم درجتان أهدأ.
    private static let sectorColors: [Color] = [
        SabqTheme.primary,
        SabqTheme.brandSky,
        SabqTheme.brandSky.opacity(0.45),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            header
            figureRow
            if isExpanded {
                whereSection
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sabqBlockSurface()
        .contentShape(RoundedRectangle(cornerRadius: SabqTheme.blockRadius, style: .continuous))
        .onTapGesture { toggle() }
        .accessibilityIdentifier("economy.home.teaser")
    }

    private func toggle() {
        SabqHaptics.light()
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.28)) { isExpanded.toggle() }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: SabqLayout.space8) {
            Text("أين أنفق السعوديون؟")
                .font(SabqType.rowTitle.scaled(compactType).font)
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
            if isFresh { EconomyNewBadge(label: "جديد") }
            Spacer(minLength: SabqLayout.space4)
            Text(weekly.weekLabelAr)
                .font(SabqType.tag.scaled(compactType).font)
                .foregroundStyle(SabqTheme.textTertiary)
                .lineLimit(1)
            Button(action: toggle) {
                Image(systemName: "chevron.down")
                    .font(SabqType.metaEmphasis.scaled(compactType).font)
                    .foregroundStyle(SabqTheme.primary)
                    .rotationEffect(.degrees(isExpanded ? 180 : 0))
                    .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.vertical, -SabqLayout.space12)
            .padding(.trailing, -SabqLayout.space12)
            .accessibilityLabel(isExpanded ? "إخفاء توزيع الإنفاق" : "عرض أين صُرف الإنفاق")
        }
    }

    private var figureRow: some View {
        let parts = EconomyFormat.fmtSar(weekly.totalValue).split(separator: " ", maxSplits: 1).map(String.init)
        let number = parts.first ?? ""
        let unit = (parts.count > 1 ? parts[1] + " " : "") + "ريال"
        return HStack(alignment: .bottom, spacing: SabqLayout.space12) {
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space4) {
                    Text(number)
                        .font(SabqFonts.headline(size: compactType ? 24 : 32))
                        .monospacedDigit()
                        .foregroundStyle(SabqTheme.textPrimary)
                        .accessibilityIdentifier("economy.home.figure")
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .layoutPriority(1)
                    Text(unit)
                        .font(SabqType.excerpt.scaled(compactType).font)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .lineLimit(1)
                }
                changeBadge
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if series.count > 1 {
                VStack(spacing: SabqLayout.space4) {
                    weeksBars
                        .frame(width: narrow ? 64 : 92, height: narrow ? 44 : 54)
                    Text("آخر \(series.count) أسابيع")
                        .font(SabqType.tag.scaled(compactType).font)
                        .foregroundStyle(SabqTheme.textTertiary)
                }
                .accessibilityHidden(true)
            }
        }
    }

    private var changeBadge: some View {
        let pct = weekly.totalChangePct
        let up = pct >= 0
        let tint = up ? EconomyTone.up : EconomyTone.down
        return HStack(spacing: SabqLayout.space4) {
            Text("\(up ? "▲" : "▼") \(EconomyFormat.fmtPct(pct))")
                .font(SabqType.metaEmphasis.scaled(compactType).font)
                .foregroundStyle(tint)
                .monospacedDigit()
                .environment(\.layoutDirection, .leftToRight)
            Text("عن الأسبوع السابق")
                .font(SabqType.meta.scaled(compactType).font)
                .foregroundStyle(SabqTheme.textTertiary)
        }
    }

    /// الأقدم يمينًا تحت RTL (أول عنصر في HStack)، والأسبوع الحالي مُبرز.
    private var weeksBars: some View {
        let maxV = max(series.max() ?? 1, 1)
        return HStack(alignment: .bottom, spacing: SabqLayout.space4) {
            ForEach(Array(series.enumerated()), id: \.offset) { index, value in
                Rectangle()
                    .fill(index == series.count - 1 ? SabqTheme.primary : SabqTheme.primary.opacity(0.25))
                    .frame(maxWidth: .infinity)
                    .frame(height: max(10, 54 * CGFloat(value / maxV)))
            }
        }
    }

    private var whereSection: some View {
        let shown = topSectors
        let rest = max(0, 100 - shown.reduce(0) { $0 + $1.share })
        return VStack(alignment: .leading, spacing: SabqLayout.space12) {
            Rectangle().fill(SabqTheme.separator).frame(height: 1)

            Text("أين؟")
                .font(SabqType.metaEmphasis.scaled(compactType).font)
                .foregroundStyle(SabqTheme.textSecondary)

            GeometryReader { geo in
                let gaps = CGFloat(shown.count) * 2
                let usable = max(0, geo.size.width - gaps)
                HStack(spacing: 2) {
                    ForEach(Array(shown.enumerated()), id: \.element.id) { index, sector in
                        Self.sectorColors[index % Self.sectorColors.count]
                            .frame(width: usable * CGFloat(sector.share / 100))
                    }
                    SabqTheme.outline
                        .frame(width: usable * CGFloat(rest / 100))
                }
            }
            .frame(height: 8)
            .clipShape(Capsule())
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                ForEach(Array(shown.enumerated()), id: \.element.id) { index, sector in
                    HStack(spacing: SabqLayout.space8) {
                        Circle()
                            .fill(Self.sectorColors[index % Self.sectorColors.count])
                            .frame(width: 8, height: 8)
                        Text(sector.ar)
                            .font(SabqType.excerpt.scaled(compactType).font)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .lineLimit(1)
                        Spacer(minLength: SabqLayout.space8)
                        Text(EconomyFormat.fmtPct(sector.share))
                            .font(SabqType.metaEmphasis.scaled(compactType).font)
                            .monospacedDigit()
                            .foregroundStyle(SabqTheme.textSecondary)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                    .accessibilityElement(children: .combine)
                }
            }

            HStack(alignment: .firstTextBaseline) {
                Text("المصدر: البنك المركزي السعودي")
                    .font(SabqType.tag.scaled(compactType).font)
                    .foregroundStyle(SabqTheme.textTertiary)
                Spacer(minLength: SabqLayout.space8)
                ReaderLink(value: EconomyRoute()) {
                    HomeSectionLinkLabel(title: "التفاصيل")
                }
                .buttonStyle(.plain)
                .accessibilityHint("عرض تفاصيل الاقتصاد بالقطاعات والمدن")
            }
        }
    }
}

// MARK: - بطاقة النشرة الشهرية (مشتركة بين الرئيسية والصفحة)

struct EconomyMonthlyCardView: View {
    @Environment(\.homeSideColumn) private var compactType
    let card: EconomyMonthlyCard
    var compact: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Text(card.cardTitle)
                .font(SabqType.tag.scaled(compactType).font)
                .foregroundStyle(SabqTheme.textSecondary)
                .lineLimit(1)
            Text(card.headline)
                .sabqText(compact ? SabqType.metaEmphasis.scaled(compactType) : SabqType.rowTitle.scaled(compactType))
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(compact ? 3 : nil)
                .fixedSize(horizontal: false, vertical: true)
            Text(card.figure)
                .font(SabqFonts.headline(size: compact ? 20 : 24))
                .foregroundStyle(EconomyTone.color(card.tone) ?? SabqTheme.textPrimary)
                .monospacedDigit()
                .environment(\.layoutDirection, .leftToRight)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(card.detailAr)
                .sabqText(SabqType.meta.scaled(compactType))
                .foregroundStyle(SabqTheme.textSecondary)
                .lineLimit(compact ? 2 : nil)
                .fixedSize(horizontal: false, vertical: true)
            if !compact, card.series.count > 1 {
                EconomyMiniArea(values: card.series.map(\.value), labels: card.series.map { EconomyFormat.fmtMonthShort($0.period) },
                                tint: EconomyTone.color(card.tone) ?? SabqTheme.primary)
                    .frame(height: 96)
                if let label = card.seriesLabelAr {
                    Text(label)
                        .font(SabqType.tag.scaled(compactType).font)
                        .foregroundStyle(SabqTheme.textTertiary)
                }
            }
        }
        .padding(SabqLayout.space12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .economyAccentCard(tone: EconomyTone.color(card.tone) ?? SabqTheme.primary)
    }
}

/// بلوك هادئ للبطاقات الاقتصادية: تعبئة رمادية خفيفة بزوايا 12 بلا حد ولا شريط
/// ملوّن — لون الاتجاه يبقى في الرقم نفسه. `tone` محفوظ لتوافق النداءات.
struct EconomyAccentCardModifier: ViewModifier {
    let tone: Color
    var radius: CGFloat = SabqRadius.medium

    func body(content: Content) -> some View {
        content
            .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

extension View {
    func economyAccentCard(tone: Color, radius: CGFloat = SabqRadius.medium) -> some View {
        modifier(EconomyAccentCardModifier(tone: tone, radius: radius))
    }
}

/// مساحة صغيرة بخط وتعبئة مسطحة خفيفة — الأقدم يمينًا، وعلامتا البداية والنهاية فقط.
struct EconomyMiniArea: View {
    @Environment(\.homeSideColumn) private var compactType
    let values: [Double]
    var labels: [String] = []
    var tint: Color = SabqTheme.primary

    var body: some View {
        VStack(spacing: SabqLayout.space4) {
            GeometryReader { geo in
                let pts = points(in: geo.size)
                ZStack {
                    if pts.count >= 2 {
                        Path { p in
                            p.move(to: CGPoint(x: pts[0].x, y: geo.size.height))
                            for pt in pts { p.addLine(to: pt) }
                            p.addLine(to: CGPoint(x: pts[pts.count - 1].x, y: geo.size.height))
                            p.closeSubpath()
                        }
                        .fill(tint.opacity(0.12))
                        Path { p in
                            p.move(to: pts[0])
                            for pt in pts.dropFirst() { p.addLine(to: pt) }
                        }
                        .stroke(tint, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                    }
                }
            }
            if labels.count >= 2 {
                HStack {
                    Text(labels.last ?? "")
                    Spacer(minLength: 0)
                    Text(labels.first ?? "")
                }
                .font(SabqType.tag.scaled(compactType).font)
                .foregroundStyle(SabqTheme.textTertiary)
                .environment(\.layoutDirection, .leftToRight)
            }
        }
    }

    private func points(in size: CGSize) -> [CGPoint] {
        let v = values.filter(\.isFinite)
        guard v.count >= 2 else { return [] }
        let minV = v.min()!, maxV = v.max()!
        let span = max(maxV - minV, 0.000001)
        let stepX = size.width / CGFloat(v.count - 1)
        return v.enumerated().map { i, val in
            CGPoint(x: size.width - CGFloat(i) * stepX,
                    y: size.height - 2 - CGFloat((val - minV) / span) * (size.height - 8))
        }
    }
}
