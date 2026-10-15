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

    /// أي شريط تبويب يستخدمه `DuoTabContainer`: سفلي حين تضيق النافذة عن
    /// عمودين (الشاشة الخارجية بأي وضعية)، وجانبي حين تتسع (مفتوحًا).
    ///
    /// الخلفية: على الشاشة الخارجية بوضعية «الكتاب المغلق» يعرض `TabView`
    /// شريطًا رأسيًا ويحجز له 84 نقطة مقابل الحسّاس، فلا يبقى للمحتوى إلا 298
    /// من 466 نقطة (مقيس على المحاكي 2026-10-15)، ولا يُلغى الحجز بإخفاء
    /// الشريط. لذلك يملك Duo شريطه الخاص.
    /// - Parameter windowWidth: عرض النافذة كاملًا مع حواف الأمان.
    static func usesBottomTabBar(windowWidth: CGFloat) -> Bool {
        windowWidth < matchColumnsMinWidth
    }
}

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
    }
}
