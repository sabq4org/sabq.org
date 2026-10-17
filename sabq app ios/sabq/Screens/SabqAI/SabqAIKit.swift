import SwiftUI
import UIKit

// MARK: - «عقل سبق» — الأدوات المشتركة لنقل صفحة /sabq-ai (SabqAI.tsx + sabq-ai-page.css)
//
// الصفحة سينمائية داكنة بصرف النظر عن وضع التطبيق، كما على الويب. ألوانها محصورة
// في `SAI` أدناه ولا تُستعمل خارج هذه الشاشة؛ بقية التطبيق يقرأ من `SabqTheme`.

nonisolated enum SAI {
    static func rgb(_ hex: UInt32, _ alpha: Double = 1) -> Color {
        Color(red: Double((hex >> 16) & 255) / 255,
              green: Double((hex >> 8) & 255) / 255,
              blue: Double(hex & 255) / 255,
              opacity: alpha)
    }

    static let void = rgb(0x03060C)
    static let deep = rgb(0x060C17)
    static let ai = rgb(0x5CB4FF)
    static let ai2 = rgb(0x8B7BFF)
    static let human = rgb(0x3FE0A0)
    static let warn = rgb(0xFF8A98)
    static let text = rgb(0xE8EEF6)
    static let mute = rgb(0x8496AD)
    static let soft = rgb(0xA3B2C4)
    static let faint = Color.white.opacity(0.08)

    /// IBM Plex Sans Arabic بأحجام العرض السينمائية؛ تتبع حجم الخط في الإتاحة.
    static func font(_ size: CGFloat, _ weight: Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom(weight.postScript, size: size, relativeTo: style)
    }

    enum Weight {
        case regular, medium, semibold, bold
        var postScript: String {
            switch self {
            case .regular: SabqFonts.regular
            case .medium: SabqFonts.medium
            case .semibold: SabqFonts.semibold
            case .bold: SabqFonts.bold
            }
        }
    }

    /// منحنى ظهور الأقسام في الويب: cubic-bezier(.2,.7,.2,1) لمدة ثانية.
    static let revealCurve = Animation.timingCurve(0.2, 0.7, 0.2, 1, duration: 1)
    /// easeOutQuart للعدّادات: 1 - (1 - p)^4 لمدة 1.8 ثانية.
    static let countCurve = Animation.timingCurve(0.25, 1, 0.5, 1, duration: 1.8)
}

// MARK: - Viewport

private struct SAIViewportKey: EnvironmentKey {
    static let defaultValue: CGFloat = 800
}

extension EnvironmentValues {
    /// ارتفاع منطقة التمرير؛ تقيس به الأقسام دخولها الشاشة كما يفعل IntersectionObserver.
    var saiViewport: CGFloat {
        get { self[SAIViewportKey.self] }
        set { self[SAIViewportKey.self] = newValue }
    }
}

private struct SAIFirstVisible: ViewModifier {
    let threshold: CGFloat
    let action: () -> Void
    @Environment(\.saiViewport) private var viewport
    @State private var fired = false

    func body(content: Content) -> some View {
        content.onGeometryChange(for: Bool.self) { proxy in
            // نسبة التقاطع كما في IntersectionObserver: الجزء الظاهر من العنصر مقسومًا على ارتفاعه،
            // أو حصة من الشاشة للعناصر الأطول منها.
            let frame = proxy.frame(in: .scrollView)
            let shown = min(frame.maxY, viewport) - max(frame.minY, 0)
            guard shown > 0, frame.height > 0 else { return false }
            return shown / frame.height >= threshold || shown >= viewport * threshold
        } action: { visible in
            guard visible, !fired else { return }
            fired = true
            action()
        }
    }
}

extension View {
    /// يُنفَّذ مرة واحدة حين يدخل العنصر الشاشة داخل ScrollView الصفحة.
    func saiOnFirstVisible(threshold: CGFloat = 0.15, perform action: @escaping () -> Void) -> some View {
        modifier(SAIFirstVisible(threshold: threshold, action: action))
    }

    /// `.sai-rv`: يصعد 34 نقطة من ضبابية 6 إلى مكانه، بتأخير `.sai-d1/2/3` (0.12 ثانية لكل درجة).
    func saiReveal(_ step: Int = 0) -> some View {
        modifier(SAIReveal(delay: Double(step) * 0.12))
    }
}

private struct SAIReveal: ViewModifier {
    let delay: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        let on = shown || reduceMotion
        content
            .saiOnFirstVisible {
                withAnimation(SAI.revealCurve.delay(delay)) { shown = true }
            }
            .opacity(on ? 1 : 0)
            .offset(y: on ? 0 : 34)
            .blur(radius: on ? 0 : 6)
    }
}

// MARK: - Count-up

/// `CountUp`: يبدأ من الصفر عند دخوله الشاشة، ويكمل من قيمته الحالية عند كل تحديث.
struct SAICountUp: View {
    let value: Double
    var decimals: Int = 0
    var suffix: String = ""
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown: Double = 0
    @State private var started = false

    var body: some View {
        SAICountLabel(value: shown, decimals: decimals, suffix: suffix)
            .saiOnFirstVisible(threshold: 0.3) {
                started = true
                animate()
            }
            .onChange(of: value) { _, _ in
                if started { animate() }
            }
            .accessibilityLabel(SAIFormat.number(value, decimals: decimals) + suffix)
    }

    private func animate() {
        if reduceMotion {
            shown = value
        } else {
            withAnimation(SAI.countCurve) { shown = value }
        }
    }
}

private struct SAICountLabel: View, Animatable {
    var value: Double
    let decimals: Int
    let suffix: String

    var animatableData: Double {
        get { value }
        set { value = newValue }
    }

    var body: some View {
        Text(verbatim: SAIFormat.number(value, decimals: decimals) + suffix)
            .monospacedDigit()
            .environment(\.layoutDirection, .leftToRight)
    }
}

nonisolated enum SAIFormat {
    /// `toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })`
    static func number(_ v: Double, decimals: Int = 0) -> String {
        guard v.isFinite else { return "—" }
        let f = NumberFormatter()
        f.locale = Locale(identifier: "en_US")
        f.numberStyle = .decimal
        f.minimumFractionDigits = decimals
        f.maximumFractionDigits = decimals
        return f.string(from: NSNumber(value: v)) ?? "\(v)"
    }

    /// «19 يوليو 2026» بأرقام لاتينية كبقية التطبيق.
    static func arabicDate(_ iso: String, withYear: Bool = false) -> String {
        let parts = iso.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, (1...12).contains(parts[1]) else { return iso }
        let month = EconomyFormat.monthsAr[parts[1] - 1]
        return withYear ? "\(parts[2]) \(month) \(parts[0])" : "\(parts[2]) \(month)"
    }

    static func updatedAgo(_ iso: String) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        guard let date else { return "قبل لحظات" }
        let minutes = max(0, Int(Date().timeIntervalSince(date) / 60))
        switch minutes {
        case 0: return "قبل لحظات"
        case 1: return "قبل دقيقة"
        case 2: return "قبل دقيقتين"
        case 3...10: return "قبل \(minutes) دقائق"
        default: return "قبل \(minutes) دقيقة"
        }
    }
}

// MARK: - Rich text

/// مقطع نصي بلون أو وزن مختلف داخل فقرة واحدة (مقابل <em> و<b> و<code> في الويب).
struct SAISpan {
    var text: String
    var color: Color?
    var weight: SAI.Weight?
    var code = false

    static func plain(_ t: String) -> SAISpan { SAISpan(text: t) }
    static func strong(_ t: String, _ color: Color = SAI.text, _ weight: SAI.Weight = .medium) -> SAISpan {
        SAISpan(text: t, color: color, weight: weight)
    }
    static func code(_ t: String) -> SAISpan { SAISpan(text: " \(t) ", color: SAI.rgb(0xBFE3FF), code: true) }
}

extension SAI {
    static func rich(_ spans: [SAISpan], size: CGFloat, base: Color, baseWeight: Weight = .regular) -> AttributedString {
        var out = AttributedString()
        for s in spans {
            var run = AttributedString(s.text)
            run.foregroundColor = s.color ?? base
            run.font = font(size, s.weight ?? baseWeight)
            if s.code { run.backgroundColor = SAI.ai.opacity(0.1) }
            out += run
        }
        return out
    }
}

// MARK: - Live dot

/// النقطة الخضراء النابضة (`sai-blink`: تخفت إلى 35% كل ثانيتين).
struct SAIBlinkDot: View {
    var size: CGFloat = 8
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dim = false

    var body: some View {
        Circle()
            .fill(SAI.human)
            .frame(width: size, height: size)
            .shadow(color: SAI.human, radius: 6)
            .opacity(dim ? 0.35 : 1)
            .animation(reduceMotion ? nil : .easeInOut(duration: 1).repeatForever(autoreverses: true), value: dim)
            .onAppear { if !reduceMotion { dim = true } }
            .accessibilityHidden(true)
    }
}

// MARK: - Outlined numerals

/// أرقام مفرّغة بحدّ رفيع (`-webkit-text-stroke`) — لا مقابل لها في SwiftUI فنرسمها بـ UILabel.
struct SAIOutlinedText: UIViewRepresentable {
    let text: String
    let size: CGFloat
    let color: UIColor
    var strokePoints: CGFloat = 1

    func makeUIView(context: Context) -> UILabel {
        let label = UILabel()
        label.textAlignment = .center
        label.setContentHuggingPriority(.required, for: .vertical)
        label.setContentHuggingPriority(.required, for: .horizontal)
        label.isAccessibilityElement = false
        return label
    }

    func updateUIView(_ label: UILabel, context: Context) {
        let font = UIFont(name: SabqFonts.bold, size: size) ?? .boldSystemFont(ofSize: size)
        label.attributedText = NSAttributedString(string: text, attributes: [
            .font: font,
            .strokeColor: color,
            // نسبة مئوية من حجم الخط؛ الموجب يرسم الحد وحده بلا تعبئة.
            .strokeWidth: max(0.5, strokePoints / size * 100),
            .foregroundColor: UIColor.clear,
        ])
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UILabel, context: Context) -> CGSize? {
        uiView.intrinsicContentSize
    }
}

// MARK: - Ticker belt

/// شريط «من داخل المنظومة»: حزام يتحرك يمينًا بلا نهاية، نصف عرضه كل 60 ثانية.
struct SAITickerBelt: View {
    let items: [(tag: String, text: String)]
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var halfWidth: CGFloat = 0

    var body: some View {
        // الحزام في طبقة فوقية حتى لا يفرض عرضه الكامل على الصفحة؛ الارتفاع من سطر مخفي بنفس الخط.
        Text(verbatim: " ")
            .font(SAI.font(14))
            .padding(.vertical, 11)
            .hidden()
            .frame(maxWidth: .infinity)
            .overlay(alignment: .trailing) {
                TimelineView(.animation(minimumInterval: 1 / 60, paused: reduceMotion)) { ctx in
                    let t = ctx.date.timeIntervalSinceReferenceDate
                    let x = halfWidth > 0 ? CGFloat((t * Double(halfWidth) / 60).truncatingRemainder(dividingBy: Double(halfWidth))) : 0
                    HStack(spacing: 0) {
                        half
                        half.onGeometryChange(for: CGFloat.self) { $0.size.width } action: { halfWidth = $0 }
                    }
                    .fixedSize()
                    .offset(x: x)
                }
            }
            // حساب الإزاحة بالاتجاه الفيزيائي؛ النصوص العربية تبقى سليمة داخل كل مقطع.
            .environment(\.layoutDirection, .leftToRight)
            .clipped()
    }

    /// العناصر معكوسة حتى يقرأ أولها على اليمين.
    private var half: some View {
        HStack(spacing: 0) {
            ForEach(Array(items.reversed().enumerated()), id: \.offset) { _, item in
                HStack(spacing: 8) {
                    Text(item.text).foregroundStyle(SAI.rgb(0xC3D0DE))
                    Text(item.tag).foregroundStyle(SAI.ai).font(SAI.font(14, .bold))
                }
                .font(SAI.font(14))
                .lineLimit(1)
                .fixedSize()
                .padding(.vertical, 11)
                .padding(.leading, 46)
            }
        }
    }
}

// MARK: - Data

nonisolated struct APIAIPublicStats: Decodable {
    struct AI: Decodable {
        let totalOps: Double
        let todayOps: Double
        let totalTokens: Double
        let successRate: Double
        let sinceDate: String?
        let daily: [Day]?
        let todayByDomain: Domains?
    }
    struct Day: Decodable { let date: String; let count: Double }
    struct Domains: Decodable { let editorial: Double; let sports: Double; let visual: Double; let audio: Double }
    struct Comments: Decodable { let total: Double; let aiAnalyzed: Double }
    struct Stories: Decodable { let total: Double }
    struct Articles: Decodable { let totalPublished: Double; let todayPublished: Double }
    struct Audio: Decodable { let totalMinutes: Double }
    struct Radar: Decodable { let totalItems: Double }
    struct Sports: Decodable { let totalOps: Double }

    let generatedAt: String
    let ai: AI
    let comments: Comments
    let stories: Stories
    let articles: Articles
    let audio: Audio?
    let radar: Radar?
    let sports: Sports?

    var dailySeries: [Day] { ai.daily ?? [] }
}

nonisolated struct APIAITeamMember: Decodable, Identifiable {
    let slug: String
    let nameAr: String
    let titleAr: String
    let departmentAr: String
    let avatarUrl: String?

    var id: String { slug }

    /// الصور نسبية على الويب (`/ai-team/rased.jpg`) — نُكمّلها بأصل الموقع.
    var absoluteAvatarURL: URL? {
        guard let raw = avatarUrl?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else { return nil }
        if raw.hasPrefix("http") { return URL(string: raw) }
        return URL(string: URLConstants.webOrigin + (raw.hasPrefix("/") ? raw : "/" + raw))
    }
}

nonisolated struct APIAITeamCounters: Decodable {
    let monthOps: Int
    let teamCount: Int
}

nonisolated struct APIAITeam: Decodable {
    let generatedAt: String?
    let team: [APIAITeamMember]
    let counters: APIAITeamCounters?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        generatedAt = try? c.decodeIfPresent(String.self, forKey: .generatedAt)
        team = (try? c.decodeIfPresent([APIAITeamMember].self, forKey: .team)) ?? []
        counters = try? c.decodeIfPresent(APIAITeamCounters.self, forKey: .counters)
    }

    private enum CodingKeys: String, CodingKey { case generatedAt, team, counters }
}

extension APIClient {
    /// `/api/public/ai-stats` — استعلامات إنتاج بكاش 5 دقائق.
    func fetchAIPublicStats() async throws -> APIAIPublicStats {
        try await get(APIAIPublicStats.self, path: "/public/ai-stats", apiRoot: URLConstants.publicAPI)
    }

    func fetchAITeam() async throws -> APIAITeam {
        try await get(APIAITeam.self, path: "/public/ai-team", apiRoot: URLConstants.publicAPI)
    }
}
