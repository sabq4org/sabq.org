import SwiftUI

/// وضعيات iPhone Duo التي تغيّر التخطيط، وقراراتها كدوال صافية قابلة للاختبار.
///
/// كل ما يخص المفصلة يأتي من واجهات iOS 27.1 (`onHingeChange`،
/// `GeometryProxy.reservedRegions(kind: .division)`) خلف `#available`؛ على أي
/// إصدار أو جهاز آخر تبقى الحالة `.unknown` فلا يتغيّر شيء.
enum DuoHingeStatus: Equatable, Sendable {
    case unknown, closed, partiallyOpen, fullyOpen
}

/// ما تحتاجه الشاشات من المفصلة: حالتها، ومكان الفاصل إن كان أفقيًا (وضع
/// الطاولة) بإحداثيات الحاوية التي قيست فيها.
struct DuoHingeState: Equatable, Sendable {
    var status: DuoHingeStatus = .unknown
    /// المدى الرأسي لشريط المفصلة حين يقطع الشاشة أفقيًا. `nil` حين يكون
    /// الفاصل رأسيًا (وضع الكتاب) أو غائبًا.
    var horizontalDivision: ClosedRange<CGFloat>? = nil
}

/// تخطيط مركز المباراة بحسب الوضعية.
enum MatchCenterLayout: Equatable, Sendable {
    /// الهاتف العادي والشاشة الخارجية: التبويبات كما هي.
    case standard
    /// مفتوح (أو وضع الكتاب): سير المباراة يمينًا والأرقام يسارًا.
    case columns
    /// مدار أفقيًا ونصف مطوي: النتيجة أعلى المفصلة والتفاصيل أسفلها.
    case tabletop
}

enum DuoPosture {
    /// أقل عرض يتّسع لعمودين في مركز المباراة (أصغر من عتبة القارئ 640 لأن
    /// ورقة المركز تُعرض بلا شريط تبويب جانبي).
    static let matchColumnsMinWidth: CGFloat = 600

    /// وضع الطاولة يُعرف بأمرين معًا: المفصلة نصف مفتوحة، وفاصلها يقطع
    /// الحاوية أفقيًا. وضع الكتاب (فاصل رأسي) يبقى عمودين.
    static func matchLayout(width: CGFloat, hinge: DuoHingeState) -> MatchCenterLayout {
        if hinge.status == .partiallyOpen, hinge.horizontalDivision != nil {
            return .tabletop
        }
        return width >= matchColumnsMinWidth ? .columns : .standard
    }

    /// يحوّل مناطق الفصل إلى مدى رأسي لشريط أفقي. المنطقة الأفقية أعرض من
    /// ارتفاعها بوضوح؛ نأخذ الأعرض إن تعددت.
    static func horizontalDivision(from frames: [CGRect]) -> ClosedRange<CGFloat>? {
        let horizontal = frames.filter { $0.width > $0.height * 2 && $0.height > 0 }
        guard let band = horizontal.max(by: { $0.width < $1.width }) else { return nil }
        return band.minY...band.maxY
    }

    /// أي شريط تبويب يستخدمه `DuoTabContainer`: سفلي حين لا تُعرض النافذة
    /// عمودين (الخارجية رأسيًا، ومفتوحًا رأسيًا)، وجانبي مع العمودين.
    ///
    /// الخلفية: على الشاشة الخارجية بوضعية «الكتاب المغلق» يعرض `TabView`
    /// شريطًا رأسيًا ويحجز له 84 نقطة مقابل الحسّاس، فلا يبقى للمحتوى إلا 298
    /// من 466 نقطة (مقيس على المحاكي 2026-10-15)، ولا يُلغى الحجز بإخفاء
    /// الشريط. لذلك يملك Duo شريطه الخاص.
    /// - Parameter windowWidth: عرض النافذة كاملًا مع حواف الأمان.
    static func usesBottomTabBar(windowWidth: CGFloat, windowHeight: CGFloat) -> Bool {
        !usesReaderColumns(width: windowWidth, height: windowHeight)
    }

    /// أقل عرض لعمودي «الأخبار + القارئ».
    static let readerColumnsMinWidth: CGFloat = 640

    /// عمودان على Duo: عرض كافٍ **وأفقي**. مفتوحًا رأسيًا (≈669×951) عمود واحد
    /// بطلب المالك 2026-10-18 — كان العرض وحده يفرّق، لكن الرأسي المفتوح والخارجية
    /// أفقيًا (≈678×466) شبه متساويين عرضًا. مفتوحًا أفقيًا (951×669) والخارجية
    /// أفقيًا عمودان كما كانا.
    static func usesReaderColumns(width: CGFloat, height: CGFloat) -> Bool {
        width >= readerColumnsMinWidth && width > height
    }

    /// أدنى عرض لشريط الحسّاس الجانبي يتّسع لشريط التبويب العمودي (`DuoTabRail`
    /// ‏76 نقطة؛ الشريط 84).
    static let sideRailMinStrip: CGFloat = 76

    /// على الشاشة الضيقة: الجهة التي فيها شريط حسّاس جانبي يتّسع لشريط التبويب
    /// العمودي، فيُعرض فيه بدل الشريط السفلي (طلب المالك 2026-10-18 — الشريط
    /// تحت الساعة فارغ، وإزالة الشريط السفلي تعيد للأخبار ~54 نقطة ارتفاعًا).
    /// `nil` = لا شريط جانبي كافٍ (أو النافذة عريضة) فيبقى الشريط السفلي/الجانبي
    /// المعتاد.
    static func sideStripRailEdge(windowWidth: CGFloat, windowHeight: CGFloat, leadingInset: CGFloat, trailingInset: CGFloat) -> HorizontalEdge? {
        guard usesBottomTabBar(windowWidth: windowWidth, windowHeight: windowHeight) else { return nil }
        let widest = max(leadingInset, trailingInset)
        guard widest >= sideRailMinStrip else { return nil }
        return leadingInset >= trailingInset ? .leading : .trailing
    }
}

// واجهات المفصلة موجودة في SDK ‏iOS 27.1 فقط؛ `#available` لا يكفي لأن الرموز
// نفسها غائبة عن SDK أقدم (CI يبني بـ Xcode 26.x، وXcode 27.0 بلا 27.1).
// `SwiftUICore` في SDK ‏27.1 إصداره 8.0.85 (و8.0.84 في 27.0)، فشرط الترجمة
// يقبل SDK ‏27.1 فما بعد. البناء بأقدم منه يُبقي المفصلة «غير معروفة»: لا
// وضع طاولة، ويبقى عمودا المركز بحسب العرض فقط.
#if canImport(SwiftUICore, _version: 8.0.85)
extension DuoHingeStatus {
    @available(iOS 27.1, *)
    init(_ status: DeviceHinge.Status?) {
        switch status {
        case .some(.closed): self = .closed
        case .some(.partiallyOpen): self = .partiallyOpen
        case .some(.fullyOpen): self = .fullyOpen
        default: self = .unknown
        }
    }
}
#endif

extension View {
    /// يقرأ حالة المفصلة ومكان فاصلها داخل هذه الحاوية. لا يفعل شيئًا قبل
    /// iOS 27.1 أو على جهاز بلا مفصلة.
    func duoHingeState(_ state: Binding<DuoHingeState>) -> some View {
        modifier(DuoHingeReader(state: state))
    }
}

private struct DuoHingeReader: ViewModifier {
    @Binding var state: DuoHingeState

    func body(content: Content) -> some View {
        #if canImport(SwiftUICore, _version: 8.0.85)
        if #available(iOS 27.1, *) {
            content
                .onHingeChange { _, new in
                    state.status = DuoHingeStatus(new.hinge?.status)
                }
                .background {
                    GeometryReader { proxy in
                        let frames = proxy.reservedRegions(kind: .division).map(\.frame)
                        Color.clear
                            .onChange(of: frames, initial: true) { _, new in
                                let band = DuoPosture.horizontalDivision(from: new)
                                if state.horizontalDivision != band { state.horizontalDivision = band }
                            }
                    }
                }
        } else {
            content
        }
        #else
        content
        #endif
    }
}
