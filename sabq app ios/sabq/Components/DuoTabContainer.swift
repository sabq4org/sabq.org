import SwiftUI

/// حاوية التبويبات على iPhone Duo بدل `TabView`.
///
/// `TabView` على الشاشة الخارجية بوضعية «الكتاب المغلق» يعرض شريطًا رأسيًا
/// ويحجز له 84 نقطة، ومع حسّاس الكاميرا (84 أخرى) يبقى للمحتوى 298 من 466
/// نقطة — والحجز يبقى حتى لو أُخفي الشريط لأنه يأتي من `UITabBarController`.
/// هنا التبويبات الأربعة أحياء داخل `ZStack` (كما يبقيها `TabView`، فلا تضيع
/// الحالة عند التبديل)، والشريط:
/// - في شريط الحسّاس الجانبي حين تضيق النافذة ويوجد شريط حسّاس يتّسع له
///   (الشاشة الخارجية مطويًا من الوضع الأفقي)، وإلا سفلي.
/// - جانبي في الجهة المقابلة للعمود الجانبي حين تتسع (مفتوحًا أو كتابًا)،
///   كالشريط النظامي اليوم.
///
/// التبويب يُبنى أول مرة يُختار فيها فقط، كما يفعل `TabView`.
struct DuoTabContainer<Content: View>: View {
    @Binding var selection: AppTab
    var onReselect: (AppTab) -> Void = { _ in }
    @ViewBuilder var content: (AppTab) -> Content

    @State private var loaded: Set<AppTab> = []

    var body: some View {
        GeometryReader { proxy in
            // منطقة المحتوى نفسها التي يقيسها `SabqTabNavigation` لقرار العمودين —
            // القياس بالنافذة (مع شريط الحسّاس) جعل الخارجية أفقيًا عمودًا واحدًا
            // بشريط جانبي عائم فوق الصورة (محاكي 2026-10-18).
            let windowWidth = proxy.size.width
            let windowHeight = proxy.size.height
            let narrow = DuoPosture.usesBottomTabBar(windowWidth: windowWidth, windowHeight: windowHeight)
            // مطويًا بحسّاس جانبي: الشريط العمودي في شريط الحسّاس الفارغ تحت
            // الساعة بدل الشريط السفلي، فيستعيد المحتوى ارتفاع الشريط.
            let stripEdge = DuoPosture.sideStripRailEdge(
                windowWidth: windowWidth,
                windowHeight: windowHeight,
                leadingInset: proxy.safeAreaInsets.leading,
                trailingInset: proxy.safeAreaInsets.trailing
            )
            let bottomBar = narrow && stripEdge == nil
            ZStack {
                ForEach(AppTab.allCases) { tab in
                    if loaded.contains(tab) || tab == selection {
                        let isSelected = tab == selection
                        content(tab)
                            .opacity(isSelected ? 1 : 0)
                            .allowsHitTesting(isSelected)
                            .accessibilityHidden(!isSelected)
                            .zIndex(isSelected ? 1 : 0)
                    }
                }
            }
            .environment(\.duoContentInsets, narrow
                ? DuoContentInsets(
                    leading: proxy.safeAreaInsets.leading,
                    trailing: proxy.safeAreaInsets.trailing,
                    bottom: bottomBar ? DuoBottomTabBar.height : 0
                )
                : nil)
            .environment(\.homeSpreadLayout, !narrow)
            .overlay(alignment: .bottom) {
                if bottomBar {
                    DuoBottomTabBar(selection: $selection, onReselect: onReselect)
                }
            }
            // مفتوحًا: UIKit يحجز لعمود القارئ شريطًا بعرض حسّاس الكاميرا على
            // الحافة البعيدة (حواف متماثلة)، والشريط يقع داخله كما يقع شريط
            // النظام اليوم، فلا يغطي نصًا.
            //
            // الشريطان العموديان مستضافان في UIKit (`AbovePlatformViews`): ما يرسمه
            // SwiftUI هنا مباشرة يقع تحت مكدّسات التنقل، فكانت الصفحات المدفوعة —
            // خلفيتها معتمة حتى حافة الشاشة — تغطي الشريط ولا يبقى ظاهرًا إلا فوق
            // جذر التبويب الشفاف (هرمية العرض على المحاكي 2026-10-18).
            // مفتوحًا: الشريط أسفل شريط جهة البداية (اليمين) — طلب المالك
            // 2026-10-18. UIKit يحجز الشريطين بالتساوي مفتوحًا، فإن ضاق الأيمن عن
            // الشريط يبقى أسفل الجهة الأخرى كما كان.
            .overlay(alignment: proxy.safeAreaInsets.leading >= DuoPosture.sideRailMinStrip ? .bottomLeading : .bottomTrailing) {
                if !narrow {
                    if proxy.safeAreaInsets.leading >= DuoPosture.sideRailMinStrip {
                        AbovePlatformViews(content: DuoTabRail(selection: $selection, onReselect: onReselect, horizontalPadding: 0, centered: true)
                            .padding(.bottom, 12))
                            .frame(width: proxy.safeAreaInsets.leading)
                            .offset(x: stripOffset(edge: .leading, insets: proxy.safeAreaInsets))
                    } else {
                        AbovePlatformViews(content: DuoTabRail(selection: $selection, onReselect: onReselect, centered: true)
                            .padding(.bottom, 12))
                    }
                }
            }
            // الشريط العمودي داخل شريط الحسّاس (خارج منطقة المحتوى الآمنة)
            .overlay(alignment: stripEdge == .trailing ? .trailing : .leading) {
                if let edge = stripEdge {
                    AbovePlatformViews(content: DuoTabRail(selection: $selection, onReselect: onReselect, horizontalPadding: 0, centered: true))
                        .frame(width: edge == .leading ? proxy.safeAreaInsets.leading : proxy.safeAreaInsets.trailing)
                        .offset(x: stripOffset(edge: edge, insets: proxy.safeAreaInsets))
                }
            }
        }
        .onChange(of: selection, initial: true) { _, tab in loaded.insert(tab) }
    }

    /// يزيح الشريط من حافة منطقة المحتوى إلى داخل شريط الحسّاس. `offset` يتبع
    /// اتجاه الواجهة (يُعكس في RTL — مقيس على المحاكي)، فالسالب نحو البداية.
    private func stripOffset(edge: HorizontalEdge, insets: EdgeInsets) -> CGFloat {
        edge == .leading ? -insets.leading : insets.trailing
    }
}

/// يستضيف محتوى SwiftUI في `UIHostingController` شفاف فيصير عرض UIKit مستقلًا
/// يُرتَّب فوق مكدّسات التنقل المستضافة قبله. حجمه حجم محتواه.
private struct AbovePlatformViews<Content: View>: UIViewControllerRepresentable {
    let content: Content

    func makeUIViewController(context: Context) -> UIHostingController<Content> {
        let host = UIHostingController(rootView: content)
        host.view.backgroundColor = .clear
        host.safeAreaRegions = []
        return host
    }

    func updateUIViewController(_ host: UIHostingController<Content>, context: Context) {
        host.rootView = content
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiViewController host: UIHostingController<Content>, context: Context) -> CGSize? {
        host.sizeThatFits(in: proposal.replacingUnspecifiedDimensions(by: CGSize(width: 10_000, height: 10_000)))
    }
}

/// زر تبويب واحد بسلوك الشريط النظامي: اللمس يختار، ولمس المختار يعيده إلى
/// جذره.
private struct DuoTabButton<Label: View>: View {
    let tab: AppTab
    @Binding var selection: AppTab
    var onReselect: (AppTab) -> Void
    @ViewBuilder var label: (_ isSelected: Bool) -> Label

    var body: some View {
        let isSelected = tab == selection
        Button {
            if isSelected {
                onReselect(tab)
            } else {
                SabqHaptics.light()
                selection = tab
            }
        } label: {
            label(isSelected)
                .foregroundStyle(isSelected ? SabqTheme.primaryEnd : SabqTheme.secondaryInk)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tab.title)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("duoTab.\(tab.rawValue)")
    }
}

/// الشريط السفلي للشاشة الضيقة: أربعة تبويبات بعرض متساوٍ، أيقونة واسم،
/// خلفية مادة الشريط وخط علوي رفيع.
struct DuoBottomTabBar: View {
    /// ارتفاع الشريط فوق حافة الأمان السفلية — يُضاف إلى حواف المحتوى.
    static let height: CGFloat = 54
    @Binding var selection: AppTab
    var onReselect: (AppTab) -> Void = { _ in }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(AppTab.allCases) { tab in
                DuoTabButton(tab: tab, selection: $selection, onReselect: onReselect) { isSelected in
                    VStack(spacing: 3) {
                        Image(systemName: tab.systemImage)
                            .symbolVariant(isSelected ? .fill : .none)
                            .font(.system(size: 19, weight: .medium))
                            .frame(height: 24)
                        Text(tab.title)
                            .font(SabqFonts.app(size: 10.5, weight: isSelected ? .semibold : .medium))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity, minHeight: SabqLayout.touchTarget)
                }
            }
        }
        .frame(height: Self.height)
        .background(.bar, ignoresSafeAreaEdges: [.bottom, .horizontal])
        .overlay(alignment: .top) {
            Rectangle()
                .fill(SabqTheme.outline.opacity(0.7))
                .frame(height: 0.5)
        }
    }
}

/// الشريط الجانبي للشاشة المفتوحة: أيقونات فقط في عمود أسفل حافة القارئ،
/// بالمكان الذي يضع فيه النظام شريطه الرأسي اليوم.
struct DuoTabRail: View {
    @Binding var selection: AppTab
    var onReselect: (AppTab) -> Void = { _ in }
    /// 10 بجوار القارئ مفتوحًا؛ 0 داخل شريط الحسّاس مطويًا (عرضه يحدده الإطار).
    var horizontalPadding: CGFloat = 10
    /// مفتوحًا أسفل الحافة؛ في شريط الحسّاس وسطه، فالكاميرا أعلاه رأسيًا وأسفله
    /// أفقيًا (محاكي 2026-10-18).
    var centered = false

    var body: some View {
        VStack {
            if !centered { Spacer(minLength: 0) }
            VStack(spacing: 6) {
                ForEach(AppTab.allCases) { tab in
                    DuoTabButton(tab: tab, selection: $selection, onReselect: onReselect) { isSelected in
                        Image(systemName: tab.systemImage)
                            .symbolVariant(isSelected ? .fill : .none)
                            .font(.system(size: 18, weight: .medium))
                            .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                            .background {
                                if isSelected {
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .fill(SabqTheme.primaryEnd.opacity(0.12))
                                }
                            }
                    }
                }
            }
            .padding(6)
            .background(.bar, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(SabqTheme.outline.opacity(0.6), lineWidth: 0.5)
            }
            .padding(.bottom, centered ? 0 : 12)
        }
        .padding(.horizontal, horizontalPadding)
    }
}

// MARK: - حواف المحتوى داخل حاويات UIKit

/// الحواف التي يجب أن يحترمها محتوى كل مكدّس تنقّل على الشاشة الضيقة لـ Duo.
///
/// `NavigationSplitView`/`NavigationStack` (‏UIKit) تحسب حواف الأمان لمحتواها
/// بالطريقة القديمة على وضعية «الكتاب المغلق»: 84 نقطة متماثلة على الجانبين
/// (كهاتف أفقي)، رغم أن الحسّاس في جهة واحدة، وتتجاهل الشريط السفلي الذي
/// أضافته SwiftUI. هذه القيمة تحمل الحواف الحقيقية فيستبدلها المحتوى بها.
struct DuoContentInsets: Equatable {
    var leading: CGFloat = 0
    var trailing: CGFloat = 0
    /// ارتفاع الشريط السفلي فوق حافة الأمان السفلية.
    var bottom: CGFloat = 0
}

extension EnvironmentValues {
    /// `nil` خارج الشاشة الضيقة لـ Duo — لا يتغير شيء.
    @Entry var duoContentInsets: DuoContentInsets? = nil
}

extension View {
    /// يطبَّق على جذر محتوى كل مكدّس تنقّل (والوجهات المدفوعة). على Duo مطويًا
    /// يلغي حجز UIKit الأفقي المتماثل ويضع مكانه حواف الجهاز الحقيقية، ويضيف
    /// ارتفاع الشريط السفلي. في غير ذلك لا يفعل شيئًا، وبنية العرض ثابتة في
    /// الحالتين فلا تُفقد حالة التمرير عند الطيّ والفتح.
    func duoContentInsets() -> some View {
        modifier(DuoContentInsetsModifier())
    }
}

private struct DuoContentInsetsModifier: ViewModifier {
    @Environment(\.duoContentInsets) private var insets

    func body(content: Content) -> some View {
        let value = insets ?? DuoContentInsets()
        content
            .safeAreaPadding(EdgeInsets(top: 0, leading: value.leading, bottom: value.bottom, trailing: value.trailing))
            .ignoresSafeArea(insets == nil ? [] : .container, edges: .horizontal)
    }
}
