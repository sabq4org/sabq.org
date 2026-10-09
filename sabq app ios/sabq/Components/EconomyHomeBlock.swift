import SwiftUI

// MARK: - أدوات مشتركة لسطوح الاقتصاد

/// ألوان الاتجاه (نظير emerald/red في الويب؛ ورسوم النشرة الشهرية #1a7f56 / #d24a26).
nonisolated enum EconomyTone {
    static let up = Color(red: 0.10, green: 0.50, blue: 0.34)
    static let down = Color(red: 0.82, green: 0.29, blue: 0.15)

    static func color(_ tone: String) -> Color? {
        switch tone {
        case "up": return up
        case "down": return down
        default: return nil
        }
    }
}

/// شارة «جديد» الحمراء بنقطة نابضة (48 ساعة من إدخال التقرير).
struct EconomyNewBadge: View {
    var label: String = "جديد"
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(.white)
                .frame(width: 6, height: 6)
                .opacity(pulse ? 0.35 : 1)
                .animation(reduceMotion ? nil : .easeInOut(duration: 1).repeatForever(autoreverses: true), value: pulse)
            Text(label)
                .font(SabqFonts.app(size: 10, weight: .bold))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(Capsule(style: .continuous).fill(Color(red: 0.94, green: 0.27, blue: 0.27)))
        .onAppear { pulse = true }
    }
}

/// شريحة التغير: سهم + نسبة مطلقة (قناتان: لون واتجاه) — `ChangeChip.tsx`.
struct EconomyChangeChip: View {
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
            let tint: Color = direction > 0 ? EconomyTone.up : (direction < 0 ? EconomyTone.down : SabqTheme.secondaryInk)
            HStack(spacing: 3) {
                Text(value == nil ? "—" : (direction > 0 ? "▲" : (direction < 0 ? "▼" : "•")))
                if value != nil {
                    Text(EconomyFormat.fmtPct(value, digits) + suffix)
                        .monospacedDigit()
                }
            }
            .font(SabqFonts.app(size: 11, weight: .semibold))
            .foregroundStyle(tint)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Capsule(style: .continuous).fill(tint.opacity(0.10)))
            .environment(\.layoutDirection, .leftToRight)
        }
    }
}

/// خط شرارة صغير (88×30 في الويب) — الأقدم يمينًا تحت RTL.
struct EconomySparkline: View {
    let values: [Double]
    var tint: Color = SabqTheme.primaryEnd
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
        NavigationLink(value: EconomyRoute()) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Text(title)
                        .font(SabqFonts.editorial(.subheadline, size: 14, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                    Spacer(minLength: 0)
                    if let badge { EconomyNewBadge(label: badge) }
                }

                Text(figure)
                    .font(SabqFonts.editorial(.largeTitle, size: 32, weight: .heavy))
                    .monospacedDigit()
                    .foregroundStyle(SabqTheme.primaryEnd)
                    .lineLimit(1)
                    .minimumScaleFactor(0.65)
                    .accessibilityIdentifier("economy.home.figure")

                Text(caption)
                    .font(SabqFonts.editorial(.caption, size: 11, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("المصدر: البنك المركزي السعودي")
                        .font(SabqFonts.editorial(.caption2, size: 10, weight: .regular))
                        .foregroundStyle(SabqTheme.secondaryInk)
                    Spacer(minLength: 0)
                    HStack(spacing: 4) {
                        Text(cta)
                            .font(SabqFonts.editorial(.caption, size: 11, weight: .bold))
                        Image(systemName: "arrow.left")
                            .font(.system(size: 10, weight: .semibold))
                    }
                    .foregroundStyle(SabqTheme.primaryEnd)
                    .fixedSize(horizontal: true, vertical: false)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .economyAccentCard(tone: SabqTheme.primaryEnd, radius: 16)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("عرض تفاصيل الاقتصاد بالقطاعات والمدن")
        .accessibilityIdentifier("economy.home.teaser")
    }
}

/// حصص شريط القطاعات بحيث يبقى المجموع داخل عرض الشريط حتى لو تجاوزت
/// الحصص القادمة من الخادم 100 (الباقي يُكمَّل إلى 100 ثم تُطبَّع النسبة).
nonisolated enum EconomyShareLayout {
    static func fractions(shares: [Double]) -> [Double] {
        let safe = shares.map { value -> Double in
            guard value.isFinite, value > 0 else { return 0 }
            return value
        }
        let sum = safe.reduce(0, +)
        let rest = max(0, 100 - sum)
        let total = sum + rest
        guard total > 0.0001 else {
            return Array(repeating: 0, count: safe.count) + [0]
        }
        return safe.map { $0 / total } + [rest / total]
    }
}

// MARK: - بطاقة «أين أنفق السعوديون؟» في الرئيسية
//
// الجزء العلوي ظاهر دائمًا: العنوان، والرقم، والتغيّر عن الأسبوع السابق، وأعمدة
// آخر أربعة أسابيع. سهم صغير يوسّع البطاقة لتظهر «أين؟»: حصص أكبر ثلاثة
// قطاعات ثم رابط التفاصيل (قرار المالك 2026-10-09). كل الأرقام من ملخص الأسبوع
// في `/api/economy/snapshot` بلا طلب إضافي.

struct EconomyWeeklyHomeCard: View {
    let weekly: EconomyWeeklySummary
    let isFresh: Bool
    @State private var isExpanded = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var series: [Double] {
        weekly.kpis.first(where: { $0.key == "total" })?.series ?? []
    }

    private var topSectors: [EconomySectorSummary] {
        Array(weekly.topSectors.prefix(3))
    }

    private static let sectorColors: [Color] = [
        SabqTheme.brandBlue,
        SabqTheme.brandSky,
        SabqTheme.brandSky.opacity(0.45),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Button(action: toggle) {
                VStack(alignment: .leading, spacing: 14) {
                    header
                    figureRow
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(isExpanded ? "إخفاء توزيع الإنفاق" : "عرض أين صُرف الإنفاق")
            .accessibilityValue(isExpanded ? "موسع" : "مطوي")

            if isExpanded {
                whereSection
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .clipShape(RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous))
        // الظل بعد القصّ حتى لا يبتلعه `.clipShape` (كان يُرسم داخل الخلفية ثم يُقص).
        .shadow(color: SabqTheme.shadow, radius: 12, x: 0, y: 4)
        .accessibilityIdentifier("economy.home.teaser")
    }

    private func toggle() {
        SabqHaptics.light()
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.28)) { isExpanded.toggle() }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 8) {
            Text("أين أنفق السعوديون؟")
                .font(SabqFonts.app(size: 17, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
            if isFresh { EconomyNewBadge(label: "جديد") }
            Spacer(minLength: 6)
            Text(weekly.weekLabelAr)
                .font(SabqFonts.app(size: 11, weight: .regular))
                .foregroundStyle(SabqTheme.tertiaryInk)
                .lineLimit(1)
            Image(systemName: "chevron.down")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(SabqTheme.primaryEnd)
                .rotationEffect(.degrees(isExpanded ? 180 : 0))
                .frame(width: 28, height: 28)
                .background(Circle().fill(SabqTheme.primaryEnd.opacity(0.12)))
                .accessibilityHidden(true)
        }
    }

    private var figureRow: some View {
        let parts = EconomyFormat.fmtSar(weekly.totalValue).split(separator: " ", maxSplits: 1).map(String.init)
        let number = parts.first ?? ""
        let unit = (parts.count > 1 ? parts[1] + " " : "") + "ريال"
        return HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text(number)
                        .font(SabqFonts.app(size: 34, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(SabqTheme.ink)
                        .accessibilityIdentifier("economy.home.figure")
                    Text(unit)
                        .font(SabqFonts.app(size: 15, weight: .semibold))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
                changeBadge
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if series.count > 1 {
                VStack(spacing: 4) {
                    weeksBars
                        .frame(width: 92, height: 54)
                    Text("آخر \(series.count) أسابيع")
                        .font(SabqFonts.app(size: 10, weight: .regular))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
                .accessibilityHidden(true)
            }
        }
    }

    private var changeBadge: some View {
        let pct = weekly.totalChangePct
        let up = pct >= 0
        let tint = up ? EconomyTone.up : EconomyTone.down
        return HStack(spacing: 4) {
            Text("\(up ? "▲" : "▼") \(EconomyFormat.fmtPct(pct))")
                .font(SabqFonts.app(size: 12.5, weight: .semibold))
                .foregroundStyle(tint)
                .monospacedDigit()
            Text("عن الأسبوع السابق")
                .font(SabqFonts.app(size: 12, weight: .regular))
                .foregroundStyle(SabqTheme.tertiaryInk)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(tint.opacity(0.10)))
    }

    /// الأقدم يمينًا تحت RTL (أول عنصر في HStack)، والأسبوع الحالي مُبرز.
    private var weeksBars: some View {
        let maxV = max(series.max() ?? 1, 1)
        return HStack(alignment: .bottom, spacing: 6) {
            ForEach(Array(series.enumerated()), id: \.offset) { index, value in
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .fill(index == series.count - 1 ? SabqTheme.brandBlue : SabqTheme.brandSky.opacity(0.22))
                    .frame(maxWidth: .infinity)
                    .frame(height: max(10, 54 * CGFloat(value / maxV)))
            }
        }
    }

    private var whereSection: some View {
        let shown = topSectors
        let fractions = EconomyShareLayout.fractions(shares: shown.map(\.share))
        let pieces = Array(fractions.dropLast())
        let rest = fractions.last ?? 0
        return VStack(alignment: .leading, spacing: 10) {
            Rectangle().fill(SabqTheme.outline).frame(height: 1)

            Text("أين؟")
                .font(SabqFonts.app(size: 13, weight: .semibold))
                .foregroundStyle(SabqTheme.secondaryInk)

            GeometryReader { geo in
                let visiblePieces = pieces.filter { $0 > 0.001 }.count
                let segmentCount = visiblePieces + (rest > 0.001 ? 1 : 0)
                let gaps = CGFloat(max(0, segmentCount - 1)) * 2
                let usable = max(0, geo.size.width - gaps)
                HStack(spacing: 2) {
                    ForEach(Array(shown.enumerated()), id: \.element.id) { index, _ in
                        let fraction = index < pieces.count ? pieces[index] : 0
                        if fraction > 0.001 {
                            Self.sectorColors[index % Self.sectorColors.count]
                                .frame(width: usable * CGFloat(fraction))
                        }
                    }
                    if rest > 0.001 {
                        SabqTheme.outline
                            .frame(width: usable * CGFloat(rest))
                    }
                }
            }
            .frame(height: 10)
            .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(shown.enumerated()), id: \.element.id) { index, sector in
                    HStack(spacing: 8) {
                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                            .fill(Self.sectorColors[index % Self.sectorColors.count])
                            .frame(width: 9, height: 9)
                        Text(sector.ar)
                            .font(SabqFonts.app(size: 14, weight: .regular))
                            .foregroundStyle(SabqTheme.ink)
                            .lineLimit(1)
                        Spacer(minLength: 8)
                        Text(EconomyFormat.fmtPct(sector.share))
                            .font(SabqFonts.app(size: 13, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                    .accessibilityElement(children: .combine)
                }
            }

            HStack(alignment: .firstTextBaseline) {
                Text("المصدر: البنك المركزي السعودي")
                    .font(SabqFonts.app(size: 11, weight: .regular))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                Spacer(minLength: 8)
                NavigationLink(value: EconomyRoute()) {
                    HomeSectionLinkLabel(title: "التفاصيل")
                }
                .buttonStyle(.plain)
                .accessibilityHint("عرض تفاصيل الاقتصاد بالقطاعات والمدن")
            }
            .padding(.top, 2)
        }
    }
}

// MARK: - بطاقة النشرة الشهرية (مشتركة بين الرئيسية والصفحة)

struct EconomyMonthlyCardView: View {
    let card: EconomyMonthlyCard
    var compact: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(card.cardTitle)
                .font(SabqFonts.app(size: 11, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .lineLimit(1)
            Text(card.headline)
                .font(SabqFonts.app(size: compact ? 13 : 15, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
                .lineLimit(compact ? 3 : nil)
                .fixedSize(horizontal: false, vertical: true)
            Text(card.figure)
                .font(SabqFonts.app(size: compact ? 20 : 24, weight: .heavy))
                .foregroundStyle(EconomyTone.color(card.tone) ?? SabqTheme.ink)
                .monospacedDigit()
                .environment(\.layoutDirection, .leftToRight)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(card.detailAr)
                .font(SabqFonts.app(size: 12, weight: .regular))
                .foregroundStyle(SabqTheme.secondaryInk)
                .lineLimit(compact ? 2 : nil)
                .fixedSize(horizontal: false, vertical: true)
            if !compact, card.series.count > 1 {
                EconomyMiniArea(values: card.series.map(\.value), labels: card.series.map { EconomyFormat.fmtMonthShort($0.period) },
                                tint: EconomyTone.color(card.tone) ?? SabqTheme.primaryEnd)
                    .frame(height: 96)
                if let label = card.seriesLabelAr {
                    Text(label)
                        .font(SabqFonts.app(size: 10, weight: .regular))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
            }
        }
        .padding(12)
        .padding(.top, 3)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .economyAccentCard(tone: EconomyTone.color(card.tone) ?? SabqTheme.primaryEnd)
    }
}

/// بطاقة بيضاء بحد علوي ملوّن (3 نقاط) ينحني مع زوايا البطاقة — الشريط يُرسم
/// كطبقة خلفية ثم تُقصّ الحاوية كلها بالشكل المستدير (ملاحظة المالك 2026-09-12).
struct EconomyAccentCardModifier: ViewModifier {
    let tone: Color
    var radius: CGFloat = 12

    func body(content: Content) -> some View {
        content
            .background(
                ZStack(alignment: .top) {
                    SabqTheme.surface
                    tone.frame(height: 3)
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(SabqTheme.outline, lineWidth: 1))
    }
}

extension View {
    func economyAccentCard(tone: Color, radius: CGFloat = 12) -> some View {
        modifier(EconomyAccentCardModifier(tone: tone, radius: radius))
    }
}

/// مساحة صغيرة بخط وتعبئة متدرجة — الأقدم يمينًا، وعلامتا البداية والنهاية فقط.
struct EconomyMiniArea: View {
    let values: [Double]
    var labels: [String] = []
    var tint: Color = SabqTheme.primaryEnd

    var body: some View {
        VStack(spacing: 4) {
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
                        .fill(LinearGradient(colors: [tint.opacity(0.25), tint.opacity(0.02)], startPoint: .top, endPoint: .bottom))
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
                .font(SabqFonts.app(size: 9, weight: .regular))
                .foregroundStyle(SabqTheme.tertiaryInk)
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
