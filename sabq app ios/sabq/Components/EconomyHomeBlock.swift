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

// MARK: - بلوك الرئيسية «أين أنفق السعوديون أموالهم هذا الأسبوع؟»
//
// نقل `EconomyNumbersBlock.tsx`: وضعان متبادلان — نشرة شهرية جديدة (< 48 ساعة)
// تحوّل البلوك إلى «السعوديون في {شهر} بالأرقام»، وإلا بلوك الإنفاق الأسبوعي.
// يختفي كليًا بلا بيانات (لا هيكل ولا أصفار).

struct EconomyHomeBlock: View {
    private let store = EconomyStore.shared

    var body: some View {
        Group {
            switch EconomyFormat.homeMode(store.snapshot) {
            case .monthly:
                if let m = store.snapshot?.monthly { monthlyBlock(m) }
            case .weekly:
                if let w = store.snapshot?.weekly { weeklyBlock(w) }
            case .hidden:
                EmptyView()
            }
        }
        .task { await store.loadSnapshotIfNeeded(maxAge: 300) }
    }

    // MARK: الأسبوعي

    private func weeklyBlock(_ w: EconomyWeeklySummary) -> some View {
        container(label: "أين أنفق السعوديون أموالهم هذا الأسبوع") {
            header(
                eyebrow: "بيانات البنك المركزي السعودي · الأسبوع \(w.weekLabelAr)",
                badge: EconomyFormat.isFresh(w.ingestedAt) ? "أرقام جديدة" : nil,
                title: "أين أنفق السعوديون أموالهم هذا الأسبوع؟",
                headline: w.headline,
                cta: "التفاصيل بالقطاعات والمدن"
            )

            NavigationLink(value: EconomyRoute()) { totalCard(w) }
                .buttonStyle(.plain)

            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(w.topSectors.prefix(5)) { s in
                    NavigationLink(value: EconomyRoute()) { sectorCard(s) }
                        .buttonStyle(.plain)
                }
            }
        }
    }

    private func totalCard(_ w: EconomyWeeklySummary) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("إجمالي الإنفاق في أسبوع")
                .font(SabqFonts.app(size: 11, weight: .medium))
                .opacity(0.9)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(EconomyFormat.fmtSar(w.totalValue))
                    .font(SabqFonts.app(size: 24, weight: .heavy))
                    .monospacedDigit()
                Text("ريال")
                    .font(SabqFonts.app(size: 12, weight: .medium))
            }
            HStack {
                Text("\(EconomyFormat.fmtCount(w.totalCount)) عملية")
                    .font(SabqFonts.app(size: 11, weight: .medium))
                    .opacity(0.9)
                Spacer(minLength: 0)
                Text("\(w.totalChangePct >= 0 ? "▲" : "▼") \(EconomyFormat.fmtPct(w.totalChangePct))")
                    .font(SabqFonts.app(size: 11, weight: .bold))
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            }
        }
        .foregroundStyle(.white)
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SabqTheme.primaryEnd))
        .accessibilityElement(children: .combine)
    }

    private func sectorCard(_ s: EconomySectorSummary) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: EconomyFormat.sectorSymbol(s.en))
                    .font(SabqFonts.app(size: 13, weight: .semibold))
                    .foregroundStyle(SabqTheme.primaryEnd)
                    .frame(width: 28, height: 28)
                    .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(SabqTheme.primaryEnd.opacity(0.10)))
                Spacer(minLength: 0)
                EconomyChangeChip(value: s.changePct)
            }
            Text(s.ar)
                .font(SabqFonts.app(size: 13, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
                .lineLimit(1)
            Text("\(EconomyFormat.fmtSar(s.value)) ريال · \(EconomyFormat.fmtPct(s.share, 0)) من الإنفاق")
                .font(SabqFonts.app(size: 11, weight: .regular))
                .foregroundStyle(SabqTheme.secondaryInk)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.85)
        }
        .padding(12)
        // ملء ارتفاع الصف كي تتساوى بطاقات الشبكة (LazyVGrid يقترح ارتفاع أطول خلية)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(SabqTheme.surface)
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(SabqTheme.outline, lineWidth: 1))
        )
    }

    // MARK: الشهري

    private func monthlyBlock(_ m: EconomyMonthlySummary) -> some View {
        container(label: "السعوديون في \(m.monthLabelAr) بالأرقام") {
            header(
                eyebrow: "النشرة الإحصائية الشهرية · البنك المركزي السعودي",
                badge: "نشرة جديدة",
                title: "السعوديون في \(m.monthLabelAr) بالأرقام",
                headline: m.headline,
                cta: "كل أرقام الشهر"
            )
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(m.cards.prefix(6)) { card in
                    NavigationLink(value: EconomyRoute()) {
                        EconomyMonthlyCardView(card: card, compact: true)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: الهيكل

    private func container<Content: View>(label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(SabqTheme.surface)
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(SabqTheme.outline, lineWidth: 1))
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }

    private func header(eyebrow: String, badge: String?, title: String, headline: String, cta: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "building.columns")
                    .font(SabqFonts.app(size: 11, weight: .semibold))
                Text(eyebrow)
                    .font(SabqFonts.app(size: 11, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                if let badge { EconomyNewBadge(label: badge) }
            }
            .foregroundStyle(SabqTheme.primaryEnd)

            Text(title)
                .font(SabqFonts.app(size: 20, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
                .fixedSize(horizontal: false, vertical: true)

            Text(headline)
                .font(SabqFonts.app(size: 13, weight: .regular))
                .foregroundStyle(SabqTheme.secondaryInk)
                .fixedSize(horizontal: false, vertical: true)

            NavigationLink(value: EconomyRoute()) {
                HStack(spacing: 6) {
                    Text(cta)
                        .font(SabqFonts.app(size: 13, weight: .bold))
                    Image(systemName: "chevron.left")
                        .font(SabqFonts.app(size: 11, weight: .bold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Capsule(style: .continuous).fill(SabqTheme.primaryEnd))
            }
            .buttonStyle(.plain)
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
