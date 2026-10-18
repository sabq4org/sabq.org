import SwiftUI
import UIKit

// MARK: - Haptic Feedback

enum SabqHaptics {
    static func light() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }
    static func medium() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }
    static func soft() {
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
    }
    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }
    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
    static func error() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }
}

// MARK: - Shimmer Effect

struct ShimmerModifier: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase: CGFloat = 0

    func body(content: Content) -> some View {
        if reduceMotion {
            content
        } else {
            content
                .overlay(
                    GeometryReader { geo in
                        LinearGradient(
                            colors: [
                                .clear,
                                Color.white.opacity(0.25),
                                .clear
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: geo.size.width * 0.6)
                        .offset(x: phase * (geo.size.width * 1.6) - geo.size.width * 0.3)
                        .blendMode(.softLight)
                    }
                )
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .onAppear {
                    withAnimation(.linear(duration: 1.5).repeatForever(autoreverses: false)) {
                        phase = 1
                    }
                }
        }
    }
}

extension View {
    func shimmer() -> some View {
        modifier(ShimmerModifier())
    }
}

// MARK: - Skeleton Views

struct SkeletonBox: View {
    var width: CGFloat? = nil
    var height: CGFloat = 16
    var radius: CGFloat = 8

    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(SabqTheme.outline.opacity(0.5))
            .frame(width: width, height: height)
            .shimmer()
    }
}

struct ArticleRowSkeleton: View {
    var body: some View {
        HStack(alignment: .top, spacing: NewsRowStyle.thumbnailGap) {
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                SkeletonBox(height: 16)
                SkeletonBox(width: 200, height: 16)
                SkeletonBox(width: 120, height: 12)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            SkeletonBox(width: NewsRowStyle.thumbnailWidth, height: NewsRowStyle.thumbnailHeight,
                        radius: NewsRowStyle.thumbnailRadius)
        }
        .padding(.vertical, SabqLayout.space4)
    }
}

struct FeaturedCardSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SkeletonBox(height: 200, radius: 0)
                .clipShape(
                    UnevenRoundedRectangle(
                        topLeadingRadius: SabqTheme.cardRadius,
                        bottomLeadingRadius: 0,
                        bottomTrailingRadius: 0,
                        topTrailingRadius: SabqTheme.cardRadius,
                        style: .continuous
                    )
                )

            VStack(alignment: .leading, spacing: 12) {
                SkeletonBox(height: 20)
                SkeletonBox(width: 240, height: 16)
                SkeletonBox(width: 180, height: 14)
            }
            .padding(20)
        }
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(SabqTheme.surface)
                .shadow(color: SabqTheme.shadow, radius: 16, x: 0, y: 6)
        )
    }
}

struct HomeFeedSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack {
                SkeletonBox(width: 120, height: 48, radius: 12)
                Spacer()
                HStack(spacing: 12) {
                    SkeletonBox(width: 48, height: 48, radius: 24)
                    SkeletonBox(width: 48, height: 48, radius: 24)
                }
            }

            SkeletonBox(height: 50, radius: SabqTheme.tileRadius)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(0..<5, id: \.self) { _ in
                        VStack(spacing: 8) {
                            SkeletonBox(width: 68, height: 68, radius: 34)
                            SkeletonBox(width: 50, height: 10)
                        }
                    }
                }
            }

            FeaturedCardSkeleton()
                .padding(.horizontal, 4)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(0..<6, id: \.self) { _ in
                        SkeletonBox(width: 80, height: 36, radius: SabqTheme.chipRadius)
                    }
                }
            }

            VStack(alignment: .leading, spacing: 16) {
                ForEach(0..<4, id: \.self) { _ in
                    ArticleRowSkeleton()
                    if true { Divider().foregroundStyle(SabqTheme.outline.opacity(0.3)) }
                }
            }
            .padding(20)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                    .fill(SabqTheme.surface)
                    .shadow(color: SabqTheme.shadow, radius: 16, x: 0, y: 6)
            )
        }
    }
}

// MARK: - Animated Appear Modifier

struct AnimatedAppear: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let index: Int
    @State private var isVisible = false

    func body(content: Content) -> some View {
        content
            .opacity(isVisible || reduceMotion ? 1 : 0)
            .offset(y: isVisible || reduceMotion ? 0 : 18)
            .onAppear {
                withAnimation(reduceMotion ? nil : .spring(response: 0.45, dampingFraction: 0.82).delay(Double(index) * 0.05)) {
                    isVisible = true
                }
            }
    }
}

extension View {
    func animatedAppear(index: Int = 0) -> some View {
        modifier(AnimatedAppear(index: index))
    }
}

// MARK: - Scroll Geometry Compat (iOS 18+ native / iOS 17 KVO fallback)

/// iOS 17 fallback for `.onScrollGeometryChange`: a zero-size probe placed
/// as the ScrollView's background locates the backing `UIScrollView` in the
/// hosting UIKit tree and observes `contentOffset` via KVO. Before this,
/// the fallback was a silent no-op — on iOS 17 (the minimum we ship to)
/// re-tapping Home never scrolled to top, the reading-progress bar stayed
/// at zero, reading-depth analytics reported nothing, and the tab bar
/// never auto-hid. The traversal only ever executes on iOS 17.x (18+ takes
/// the native path), so it is frozen against a fixed OS and cannot rot
/// with future releases.
private struct LegacyScrollObserver: UIViewRepresentable {
    let onScroll: (_ offsetY: CGFloat, _ progress: CGFloat) -> Void

    func makeUIView(context: Context) -> LegacyScrollProbeView {
        let view = LegacyScrollProbeView()
        view.onScroll = onScroll
        return view
    }

    func updateUIView(_ uiView: LegacyScrollProbeView, context: Context) {
        uiView.onScroll = onScroll
    }
}

final class LegacyScrollProbeView: UIView {
    var onScroll: ((CGFloat, CGFloat) -> Void)?
    private var observation: NSKeyValueObservation?

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil, observation == nil else { return }
        // انتظر دورة تخطيط واحدة حتى تكتمل شجرة الـ UIKit المضيفة.
        DispatchQueue.main.async { [weak self] in self?.attach() }
    }

    private func attach() {
        guard observation == nil, let scrollView = findScrollView() else { return }
        observation = scrollView.observe(\.contentOffset, options: [.new]) { [weak self] sv, _ in
            // نفس القيم الخام التي يمررها مسار iOS 18 (onScrollGeometryChange)
            // كي تصح عتبات المستهلكين (120 للعودة للأعلى، 80 لإخفاء الشريط).
            let y = sv.contentOffset.y
            let h = max(1, sv.contentSize.height - sv.bounds.height)
            let p = min(1, max(0, y / h))
            DispatchQueue.main.async { self?.onScroll?(y, p) }
        }
    }

    private func findScrollView() -> UIScrollView? {
        // الـ probe خلفية للـ ScrollView فليس داخله — نصعد للأسلاف ونبحث
        // نزولًا، ونختار الأكبر مساحةً كي لا نلتقط rail أفقيًا متداخلًا.
        var ancestor: UIView? = superview
        var hops = 0
        while let container = ancestor, hops < 6 {
            var found: [UIScrollView] = []
            Self.collectScrollViews(in: container, depth: 0, into: &found)
            if let best = found.max(by: {
                $0.bounds.width * $0.bounds.height < $1.bounds.width * $1.bounds.height
            }) {
                return best
            }
            ancestor = container.superview
            hops += 1
        }
        return nil
    }

    private static func collectScrollViews(in view: UIView, depth: Int, into result: inout [UIScrollView]) {
        if let sv = view as? UIScrollView {
            result.append(sv)
            return
        }
        guard depth < 8 else { return }
        for sub in view.subviews {
            collectScrollViews(in: sub, depth: depth + 1, into: &result)
        }
    }
}

/// Reports the scroll Y offset — `.onScrollGeometryChange` on iOS 18+,
/// KVO probe on iOS 17 (see `LegacyScrollObserver`).
private struct ScrollOffsetTracker: ViewModifier {
    let onChange: (CGFloat) -> Void

    func body(content: Content) -> some View {
        if #available(iOS 18, *) {
            content.onScrollGeometryChange(for: CGFloat.self) { geo in
                geo.contentOffset.y
            } action: { _, y in
                onChange(y)
            }
        } else {
            content.background(LegacyScrollObserver { y, _ in onChange(y) })
        }
    }
}

/// Reports scroll progress in [0, 1] — `.onScrollGeometryChange` on
/// iOS 18+, KVO probe on iOS 17. Drives the reading-progress bar and
/// reading-depth analytics in the article/opinion detail screens.
private struct ScrollProgressTracker: ViewModifier {
    let onChange: (CGFloat) -> Void

    func body(content: Content) -> some View {
        if #available(iOS 18, *) {
            content.onScrollGeometryChange(for: CGFloat.self) { geo in
                let h = max(1, geo.contentSize.height - geo.containerSize.height)
                return min(1, max(0, geo.contentOffset.y / h))
            } action: { _, p in
                onChange(p)
            }
        } else {
            content.background(LegacyScrollObserver { _, p in onChange(p) })
        }
    }
}

extension View {
    func sabqScrollOffsetTracker(_ onChange: @escaping (CGFloat) -> Void) -> some View {
        modifier(ScrollOffsetTracker(onChange: onChange))
    }

    func sabqScrollProgressTracker(_ onChange: @escaping (CGFloat) -> Void) -> some View {
        modifier(ScrollProgressTracker(onChange: onChange))
    }

    /// Auto-hide the floating tab bar when this ScrollView scrolls down,
    /// re-show it on upward scroll or when the user returns near the top.
    /// iOS 18+ uses onScrollGeometryChange; iOS 17 uses the KVO probe.
    func sabqAutoHideTabBar() -> some View {
        modifier(TabBarAutoHideTracker())
    }
}

// MARK: - Tab Bar Visibility

/// Drives the floating tab bar's appear/disappear animation as the
/// reader scrolls. Singleton because the tab bar lives in ContentView
/// while the ScrollViews that drive it sit several screens deep — a
/// shared store keeps the propagation O(1) without an environment dance.
@MainActor
@Observable
final class TabBarVisibility {
    static let shared = TabBarVisibility()
    var isVisible: Bool = true
    /// Last reported offset — we compare against this to detect direction.
    private var lastY: CGFloat = 0
    /// Stamps the last `isVisible` mutation so two toggles can't
    /// overlap inside one 0.22s animation window. Without this, the
    /// rubber-band bounce at the bottom of a long feed produced
    /// rapid alternating toggles that visibly jittered the bar (user
    /// report 2026-05-19: "الشريط العائم يهتز كثيراً").
    private var lastToggleAt: Date = .distantPast
    /// Min spacing between toggles in seconds (≥ the animation duration
    /// below, so the bar finishes one animation before starting another).
    private let toggleCooldown: TimeInterval = 0.5
    /// Ignore tiny pixel jitter. 30 is large enough that natural scrolls
    /// still register but iOS's rubber-band bounce (≈10-20px swings)
    /// no longer triggers spurious direction flips.
    private let movementThreshold: CGFloat = 30
    /// Always show the bar in the top zone — even if the reader scrolls
    /// down briefly. Below this offset, only direction matters.
    private let pinnedTopZone: CGFloat = 80

    private init() {}

    func report(_ y: CGFloat) {
        let delta = y - lastY
        guard abs(delta) > movementThreshold else { return }

        let now = Date()
        let coolingDown = now.timeIntervalSince(lastToggleAt) < toggleCooldown

        if y < pinnedTopZone {
            if !isVisible && !coolingDown {
                withAnimation(.easeOut(duration: 0.22)) { isVisible = true }
                lastToggleAt = now
            }
        } else if delta > 0, isVisible, !coolingDown {
            withAnimation(.easeOut(duration: 0.22)) { isVisible = false }
            lastToggleAt = now
        } else if delta < 0, !isVisible, !coolingDown {
            withAnimation(.easeOut(duration: 0.22)) { isVisible = true }
            lastToggleAt = now
        }

        lastY = y
    }

    /// Called when navigation pops (back to a list) so the tab bar
    /// snaps visible regardless of the last detail-view scroll state.
    func reset() {
        lastY = 0
        if !isVisible {
            withAnimation(.easeOut(duration: 0.22)) { isVisible = true }
        }
    }
}

private struct TabBarAutoHideTracker: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 18, *) {
            content.onScrollGeometryChange(for: CGFloat.self) { geo in
                geo.contentOffset.y
            } action: { _, y in
                TabBarVisibility.shared.report(y)
            }
        } else {
            content.background(LegacyScrollObserver { y, _ in
                TabBarVisibility.shared.report(y)
            })
        }
    }
}

// MARK: - Cached Image

struct CachedAsyncImage<Placeholder: View>: View {
    let url: URL?
    let contentMode: ContentMode
    /// Max thumbnail edge size in pixels for the on-device decode. Big
    /// hero shots can sit at 2400. Inline body images rarely render
    /// wider than ~1200pt × 2x = 2400, but the body column is narrower
    /// than the hero so we let callers pass a tighter budget to save
    /// memory + decode time. Default keeps the old behaviour.
    let maxPixelSize: CGFloat
    @ViewBuilder let placeholder: () -> Placeholder

    @State private var image: UIImage?
    @State private var failed = false

    init(
        url: URL?,
        contentMode: ContentMode,
        maxPixelSize: CGFloat = 2400,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.url = url
        self.contentMode = contentMode
        self.maxPixelSize = maxPixelSize
        self.placeholder = placeholder
    }

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
                    .transition(.opacity.animation(.easeOut(duration: 0.25)))
            } else {
                placeholder()
                    .environment(\.sabqImageLoadFailed, failed || url == nil)
            }
        }
        .task(id: url) {
            await loadImage(for: url)
        }
    }

    @MainActor
    private func loadImage(for requestedURL: URL?) async {
        failed = false
        guard let requestedURL else {
            image = nil
            return
        }
        if let cached = ImageCache.cached(requestedURL, minPixelSize: self.maxPixelSize) {
            image = cached
            return
        }

        let maxPx = self.maxPixelSize
        // Two attempts with short backoff. CF Images sometimes returns
        // a transient error on the first connect; without retry, the
        // image slot stays empty for the rest of the session because
        // .task(id:) doesn't auto-retry.
        // Download a width-bounded CF variant (saves bytes), but keep the
        // NSCache key as the original URL so the lightbox/prefetch align.
        let fetchURL = ImageCDN.sized(requestedURL, width: Int(maxPx))
        var loaded: UIImage? = nil
        for attempt in 0..<2 {
            if Task.isCancelled { return }
            loaded = await Task.detached(priority: .userInitiated) { () -> UIImage? in
                guard let (data, _) = try? await ImageCache.imageSession.data(from: fetchURL) else {
                    return nil
                }
                return ImageCache.decodedImage(data: data, maxPixelSize: maxPx)
            }.value
            if loaded != nil { break }
            if attempt == 0 && !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 500_000_000) // 0.5s
            }
        }

        // After the await we may have been cancelled (user scrolled past, etc)
        // or the URL we were asked to load has changed. Cache regardless so
        // the next mount is instant, but only update UI when we're still the
        // current request.
        if let loaded {
            ImageCache.store(loaded, for: requestedURL, budget: maxPx)
        }
        guard !Task.isCancelled, url == requestedURL else { return }
        if let loaded {
            withAnimation(.easeOut(duration: 0.25)) {
                image = loaded
            }
        } else {
            image = nil
            failed = true
        }
    }
}

// MARK: - Image Placeholder

extension EnvironmentValues {
    /// يضبطه محمّلا الصور حين يفشل التحميل نهائيًا أو لا يوجد رابط.
    @Entry var sabqImageLoadFailed = false
}

/// خانة الصورة الموحّدة: تعبئة هادئة بوميض خفيف أثناء التحميل، وشعار سبق
/// باهت عند غياب الصورة أو فشلها.
struct SabqImagePlaceholder: View {
    @Environment(\.sabqImageLoadFailed) private var failed
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var sweep = false

    var body: some View {
        SabqTheme.surfaceMuted
            .overlay {
                if failed {
                    GeometryReader { proxy in
                        Image("SabqLogo")
                            .renderingMode(.template)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .foregroundStyle(SabqTheme.textTertiary.opacity(0.22))
                            .frame(height: min(40, proxy.size.height * 0.32))
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                } else if !reduceMotion {
                    GeometryReader { proxy in
                        LinearGradient(
                            colors: [.clear, SabqTheme.surfaceStrong.opacity(0.9), .clear],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: proxy.size.width * 0.6)
                        .offset(x: sweep ? proxy.size.width : -proxy.size.width * 0.6)
                    }
                    .clipped()
                    .onAppear {
                        withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) {
                            sweep = true
                        }
                    }
                }
            }
            .accessibilityHidden(true)
    }
}

// MARK: - Focal Cached Image

/// Cached image that fills its container while keeping the editor-picked
/// focal point inside the visible viewport — same behaviour as
/// `object-fit: cover` + `object-position: x% y%` on the web. When
/// `focalPoint` is nil it degrades gracefully to a centred fill (i.e.
/// identical to `CachedAsyncImage(contentMode: .fill)`).
///
/// The trick is that SwiftUI's `aspectRatio(contentMode: .fill)` always
/// centres the overflow. To honour the focal point we load the UIImage
/// ourselves, compute the fill-scale + clamped offset against the
/// container bounds in a GeometryReader, and translate the image so the
/// focal point lands at the same percentage position inside the
/// container.
struct FocalCachedAsyncImage<Placeholder: View>: View {
    let url: URL?
    let focalPoint: ImageFocalPoint?
    /// سقف بكسلات التحميل/الفك — كان 2400 مثبّتًا فكانت مصغّرات 84pt تجلب
    /// ~30 ضعف حاجتها (تدقيق الأداء 2026-08-02). الافتراضي 1400 يغطي
    /// هيرو بعرض الشاشة على أكبر الأجهزة؛ مرّر 260 للمصغرات.
    var maxPixelSize: CGFloat = 1400
    /// صورة بعيدة الشكل عن الإطار (إنفوغرافيك طولي 9:16 أو مربعة في إطار 16:9)
    /// تُعرض كاملة في الوسط فوق نسخة مموّهة منها بدل قصّ معظمها.
    var fitsMismatchedAspect: Bool = false
    @ViewBuilder let placeholder: () -> Placeholder

    @State private var image: UIImage?
    // التلاشي يُدار بـ opacity مستقلة بدل .transition — حتى لا يلتقط أنيميشن
    // الإدراج إعادةَ حساب إزاحة التركيز أثناء استقرار التخطيط عند التحميل
    // (كان ذلك يُحدث «انزلاق الصورة + فراغ جانبي» لحظيًا، أوضحه عرض Pro Max).
    @State private var shown = false
    @State private var failed = false

    init(
        url: URL?,
        focalPoint: ImageFocalPoint?,
        maxPixelSize: CGFloat = 1400,
        fitsMismatchedAspect: Bool = false,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.url = url
        self.focalPoint = focalPoint
        self.maxPixelSize = maxPixelSize
        self.fitsMismatchedAspect = fitsMismatchedAspect
        self.placeholder = placeholder
    }

    var body: some View {
        GeometryReader { proxy in
                ZStack(alignment: .topLeading) {
                if let image {
                    focalImage(image, in: proxy.size)
                        .opacity(shown ? 1 : 0)
                } else {
                    placeholder()
                        .environment(\.sabqImageLoadFailed, failed || url == nil)
                        .frame(width: proxy.size.width, height: proxy.size.height)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .clipped()
            // The whole app runs in RTL (.sabqRTL()), which flips
            // `.topLeading` alignment to actually anchor at top-RIGHT.
            // Our offset math assumes top-LEFT origin (x grows to the
            // right, focal.x = 0 ⇒ left edge), so we force LTR here to
            // keep the coordinate system consistent. The image content
            // itself is just pixels — it doesn't get mirrored.
            .environment(\.layoutDirection, .leftToRight)
        }
        .task(id: url) {
            await loadImage(for: url)
        }
    }

    /// أبعد من ربع عن نسبة الإطار في أي اتجاه: 4:3 أو مربعة أو طولية في إطار 16:9.
    private static func isAspectMismatched(_ image: CGSize, _ container: CGSize) -> Bool {
        guard image.width > 0, image.height > 0, container.width > 0, container.height > 0 else { return false }
        let ratio = (image.width / image.height) / (container.width / container.height)
        return ratio < 0.8 || ratio > 1.25
    }

    private func letterboxedImage(_ image: UIImage, in container: CGSize) -> some View {
        let size = CGSize(width: max(1, container.width), height: max(1, container.height))
        return ZStack {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: size.width, height: size.height)
                .blur(radius: 14)
                .clipped()
            Color.black.opacity(0.06)
            Image(uiImage: image)
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: size.width, height: size.height)
        }
        .frame(width: size.width, height: size.height)
        .animation(nil, value: container)
    }

    private func focalImage(_ image: UIImage, in container: CGSize) -> some View {
        let containerW = max(1, container.width)
        let containerH = max(1, container.height)
        let imgW = max(1, image.size.width)
        let imgH = max(1, image.size.height)
        let scale = max(containerW / imgW, containerH / imgH)
        let drawnW = imgW * scale
        let drawnH = imgH * scale

        let focal = focalPoint?.unit ?? CGPoint(x: 0.5, y: 0.5)
        let rawX = containerW * focal.x - drawnW * focal.x
        let rawY = containerH * focal.y - drawnH * focal.y
        let offsetX = min(0, max(containerW - drawnW, rawX))
        let offsetY = min(0, max(containerH - drawnH, rawY))

        return Image(uiImage: image)
            .resizable()
            .interpolation(.high)
            .frame(width: drawnW, height: drawnH)
            .offset(x: offsetX, y: offsetY)
            // داخل كروسيل TabView (.page) يُعيد GeometryReader قياس الصفحة
            // أثناء السحب، فتتغيّر أبعاد الحاوية ومعها الإزاحة المحسوبة. بدون
            // هذا يلتقط SwiftUI تلك التغيّرات ضمن أنيميشن السحب فتبدو الصورة
            // «تنزلق من مكانها» عند الانتقال بين الشرائح. تعطيل الأنيميشن عند
            // تغيّر الحجم يثبّت الصورة (الظهور الأول يبقى بتلاشٍ عبر transition).
            .animation(nil, value: container)
    }

    @MainActor
    private func loadImage(for requestedURL: URL?) async {
        failed = false
        guard let requestedURL else {
            image = nil
            shown = false
            return
        }
        if let cached = ImageCache.cached(requestedURL, minPixelSize: maxPixelSize) {
            // صورة مخبّأة: ضعها بموضعها النهائي فورًا بلا أنيميشن هندسة، ثم
            // لاشِ الشفافية فقط — فلا تنزلق ولا يظهر فراغ على الشاشات العريضة.
            image = cached
            shown = false
            withAnimation(.easeOut(duration: 0.2)) { shown = true }
            return
        }

        // Same hardening as CachedAsyncImage: dedicated image session
        // (12 parallel connections/host) + one retry after 0.5s. Without
        // these, articles with 10+ inline images stalled half-loaded
        // because URLSession.shared caps at 4 concurrent + .task(id:)
        // does not auto-retry on transient failures.
        let size = maxPixelSize
        let fetchURL = ImageCDN.sized(requestedURL, width: Int(size))
        var loaded: UIImage? = nil
        for attempt in 0..<2 {
            if Task.isCancelled { return }
            loaded = await Task.detached(priority: .userInitiated) { () -> UIImage? in
                guard let (data, _) = try? await ImageCache.imageSession.data(from: fetchURL) else {
                    return nil
                }
                return ImageCache.decodedImage(data: data, maxPixelSize: size)
            }.value
            if loaded != nil { break }
            if attempt == 0 && !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 500_000_000)
            }
        }

        if let loaded {
            ImageCache.store(loaded, for: requestedURL, budget: size)
        }
        guard !Task.isCancelled, url == requestedURL else { return }
        if let loaded {
            // ضبط الصورة بلا أنيميشن (موضع نهائي فورًا) ثم تلاشي الشفافية فقط —
            // يمنع التقاطَ أنيميشنِ الإدراج لإعادة حساب إزاحة التركيز.
            image = loaded
            shown = false
            withAnimation(.easeOut(duration: 0.25)) { shown = true }
        } else {
            image = nil
            shown = false
            failed = true
        }
    }
}

/// Rewrites Cloudflare Images delivery URLs to a width-bounded flexible
/// variant so the network downloads a right-sized payload instead of the
/// full-resolution original. Mirrors the web client (`client/src/lib/
/// cdnImage.ts`): for `imagedelivery.net/<hash>/<id>/<variant>` it swaps
/// the trailing variant segment for `w=<width>,q=<quality>,fit=scale-down`.
/// Flexible variants are enabled on the CF account; if they ever get
/// disabled CF falls back to the named variant. Non-CF hosts (and URLs
/// that already carry a flexible variant) are returned untouched, so the
/// helper is safe to call on every image URL.
nonisolated enum ImageCDN {
    static func sized(_ url: URL, width: Int, quality: Int = 82) -> URL {
        guard let host = url.host, host.contains("imagedelivery.net") else { return url }

        // Skip if the last path component is already a flexible variant
        // (contains `w=`/`h=`), otherwise we'd nest variants and 404.
        let last = url.lastPathComponent
        if last.contains("w=") || last.contains("h=") { return url }

        let variant = "w=\(width),q=\(quality),fit=scale-down"
        let base = url.deletingLastPathComponent()
        return base.appendingPathComponent(variant)
    }
}

nonisolated enum ImageCache {
    /// قيمة الكاش: الصورة + «ميزانية» الجلب (maxPixelSize وقت التنزيل).
    /// المفتاح يبقى الرابط الأصلي (مشاركة البطاقة/الهيرو/اللايتبوكس)، لكن
    /// القبول صار «ترقية فقط»: طالب دقّة أعلى لا يقبل نسخة البطاقة الصغيرة —
    /// كان prefetch البطاقات (1200px) يسبق الهيرو فيملأ مفتاحه ويظهر الهيرو
    /// ضبابيًّا على الشاشات العريضة. الميزانية تمنع أيضًا إعادة جلب عبثية
    /// لأصلٍ أصغر من المطلوب (جُلب بميزانية كافية وبقي صغيرًا = هذا أفضل المتاح).
    final class Entry {
        let image: UIImage
        let budget: CGFloat
        init(image: UIImage, budget: CGFloat) {
            self.image = image
            self.budget = budget
        }
    }

    nonisolated(unsafe) static let shared: NSCache<NSURL, Entry> = {
        let c = NSCache<NSURL, Entry>()
        c.countLimit = 150
        c.totalCostLimit = 100 * 1024 * 1024
        return c
    }()

    /// النسخة المخبّأة إن كانت كافية للدقّة المطلوبة (بميزانيتها أو بأبعادها
    /// الفعلية ≥ 85% من المطلوب — التقريب يمنع إعادة جلب بلا فرق بصري).
    static func cached(_ url: URL, minPixelSize: CGFloat) -> UIImage? {
        guard let entry = shared.object(forKey: url as NSURL) else { return nil }
        if entry.budget + 0.5 >= minPixelSize { return entry.image }
        let maxDim = max(entry.image.size.width, entry.image.size.height) * entry.image.scale
        return maxDim >= minPixelSize * 0.85 ? entry.image : nil
    }

    /// النسخة المخبّأة بأي دقّة — للعرض الفوري ريثما تصل الأعلى (اللايتبوكس).
    static func cachedAny(_ url: URL) -> UIImage? {
        shared.object(forKey: url as NSURL)?.image
    }

    /// يخزّن نسخة — ولا يستبدل نسخة بميزانية أكبر بأخرى أصغر (سباق
    /// prefetch البطاقات مع تحميل الهيرو المتزامن).
    static func store(_ image: UIImage, for url: URL, budget: CGFloat) {
        if let existing = shared.object(forKey: url as NSURL), existing.budget >= budget {
            return
        }
        shared.setObject(
            Entry(image: image, budget: budget),
            forKey: url as NSURL,
            cost: byteCost(of: image)
        )
    }

    /// Dedicated URLSession for image downloads. The default
    /// `URLSession.shared` caps `httpMaximumConnectionsPerHost` at 4 —
    /// which is the wrong tradeoff for articles whose body contains
    /// 10+ CF Images on the same host. With the default cap, only 4
    /// download in parallel, the rest queue, and the user perceives the
    /// reader as "slow to load images". Bumping this to 12 keeps every
    /// inline image saturating its own connection. We also set a
    /// generous per-resource timeout (45s) so slow-but-not-dead
    /// connections don't get cut and re-queued.
    static let imageSession: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.httpMaximumConnectionsPerHost = 12
        cfg.timeoutIntervalForRequest = 45
        cfg.timeoutIntervalForResource = 60
        cfg.requestCachePolicy = .returnCacheDataElseLoad
        cfg.urlCache = URLCache(
            memoryCapacity: 32 * 1024 * 1024,
            diskCapacity: 256 * 1024 * 1024
        )
        return URLSession(configuration: cfg)
    }()

    static func clear() {
        shared.removeAllObjects()
    }

    /// Warm the cache for a batch of image URLs without blocking UI.
    /// Called when articles appear near the viewport edge so images
    /// are already decoded by the time the user scrolls to them.
    static func prefetch(urls: [URL], maxPixelSize: CGFloat = 2400) {
        let width = Int(maxPixelSize)
        for url in urls {
            // Cache key is always the ORIGINAL url so the lightbox and the
            // on-mount loaders all hit the same entry. Only the network
            // fetch uses the width-bounded CF variant.
            if cached(url, minPixelSize: maxPixelSize) != nil { continue }
            let fetchURL = ImageCDN.sized(url, width: width)
            Task.detached(priority: .utility) {
                guard let (data, _) = try? await imageSession.data(from: fetchURL) else { return }
                guard let img = decodedImage(data: data, maxPixelSize: maxPixelSize) else { return }
                store(img, for: url, budget: maxPixelSize)
            }
        }
    }

    /// Decode + downsample an image to a sensible on-screen maximum.
    /// Uses ImageIO's `kCGImageSourceCreateThumbnailFromImageAlways` so
    /// the full-resolution bitmap never lives in memory.
    static func decodedImage(data: Data, maxPixelSize: CGFloat) -> UIImage? {
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
        ]
        guard
            let source = CGImageSourceCreateWithData(data as CFData, nil),
            let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, opts as CFDictionary)
        else {
            // Fall back to the standard decoder when ImageIO can't process
            // the payload (rare — usually corrupt or unsupported formats).
            return UIImage(data: data)
        }
        return UIImage(cgImage: cg)
    }

    /// Approximate bitmap cost in bytes (width × height × 4 for RGBA).
    /// Used as the NSCache `cost` so `totalCostLimit` actually enforces a
    /// memory ceiling.
    static func byteCost(of image: UIImage) -> Int {
        Int(image.size.width * image.scale * image.size.height * image.scale * 4)
    }
}

// MARK: - Upload image preparation

/// تجهيز صورة للرفع: تصغير الضلع الأطول إلى حدّ معقول ثم JPEG — مشترك بين
/// المشاركة الجديدة (ArticleSubmissionView) وإعادة الإرسال (ArticleRevisionView)
/// التي كانت ترفع الأصل الخام (4-8MB × عدة صور × 1.33 base64 = تجاوز حدّ
/// جسم JSON وذروة ذاكرة بلا داعٍ).
nonisolated enum SabqImageUpload {
    static func prepare(
        _ image: UIImage,
        maxDimension: CGFloat = 2000,
        quality: CGFloat = 0.7
    ) -> (data: Data, image: UIImage) {
        let size = image.size
        let longest = max(size.width, size.height)
        let scaled: UIImage
        if longest > maxDimension {
            let factor = maxDimension / longest
            let newSize = CGSize(width: size.width * factor, height: size.height * factor)
            let format = UIGraphicsImageRendererFormat.default()
            format.scale = 1
            let renderer = UIGraphicsImageRenderer(size: newSize, format: format)
            scaled = renderer.image { _ in
                image.draw(in: CGRect(origin: .zero, size: newSize))
            }
        } else {
            scaled = image
        }
        let data = scaled.jpegData(compressionQuality: quality)
            ?? image.jpegData(compressionQuality: quality)
            ?? Data()
        return (data, scaled)
    }
}

// MARK: - Identifiable URL

/// Wrapper that lets a URL drive `.fullScreenCover(item:)`-style sheets
/// without forcing every caller to declare a one-off Identifiable type.
/// Used by the lightbox flows in ArticleDetail / OpinionDetail /
/// ArticleContentView so tapping any image in the article body opens the
/// shared `ImageLightbox` viewer.
nonisolated struct IdentifiableURL: Identifiable, Hashable {
    let url: URL
    var id: String { url.absoluteString }

    init(_ url: URL) { self.url = url }
}

// MARK: - Image Lightbox

/// Full-screen image viewer surfaced when a reader taps the hero or an
/// inline image inside the article body. Shows the asset at the highest
/// resolution we can fetch (up to 4096 px on the longest side — well
/// above any iPhone screen) on a black backdrop, with pinch-to-zoom +
/// double-tap to toggle zoom + drag-to-pan when zoomed. A single tap
/// anywhere dismisses, matching the user's expectation that "تطبيق على
/// الصورة" → close.
struct ImageLightbox: View {
    let url: URL?
    let placeholderImage: UIImage?
    @Environment(\.dismiss) private var dismiss

    @State private var image: UIImage?
    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero

    init(url: URL?, placeholderImage: UIImage? = nil) {
        self.url = url
        self.placeholderImage = placeholderImage
        _image = State(initialValue: placeholderImage)
    }

    var body: some View {
        ZStack {
            Color.black
                .opacity(scale <= 1.01 ? max(0.0, 1.0 - abs(offset.height) / 400.0) : 1.0)
                .ignoresSafeArea()

            if let image {
                GeometryReader { proxy in
                    Image(uiImage: image)
                        .resizable()
                        .interpolation(.high)
                        .aspectRatio(contentMode: .fit)
                        .frame(width: proxy.size.width, height: proxy.size.height)
                        .scaleEffect(scale * (scale <= 1.01 ? max(0.8, 1.0 - abs(offset.height) / 2000.0) : 1.0))
                        .offset(offset)
                        .gesture(
                            MagnificationGesture()
                                .onChanged { value in
                                    let next = lastScale * value
                                    scale = min(5.0, max(1.0, next))
                                }
                                .onEnded { _ in
                                    lastScale = scale
                                    if scale <= 1.01 {
                                        withAnimation(.spring(response: 0.32, dampingFraction: 0.85)) {
                                            scale = 1
                                            offset = .zero
                                            lastOffset = .zero
                                        }
                                        lastScale = 1
                                    }
                                }
                                .simultaneously(with:
                                    DragGesture()
                                        .onChanged { value in
                                            if scale > 1.01 {
                                                offset = CGSize(
                                                    width: lastOffset.width + value.translation.width,
                                                    height: lastOffset.height + value.translation.height
                                                )
                                            } else {
                                                offset = CGSize(width: 0, height: value.translation.height)
                                            }
                                        }
                                        .onEnded { value in
                                            if scale > 1.01 {
                                                lastOffset = offset
                                            } else {
                                                if abs(value.translation.height) > 100 {
                                                    SabqHaptics.light()
                                                    dismiss()
                                                } else {
                                                    withAnimation(.spring(response: 0.32, dampingFraction: 0.85)) {
                                                        offset = .zero
                                                        lastOffset = .zero
                                                    }
                                                }
                                            }
                                        }
                                )
                        )
                }
            } else {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    .scaleEffect(1.3)
            }

            VStack {
                HStack {
                    Spacer()
                    Button {
                        SabqHaptics.light()
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(SabqFonts.app(size: 14, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 36, height: 36)
                            .background(Circle().fill(.white.opacity(0.18)))
                    }
                    .buttonStyle(.plain)
                    .padding(.trailing, 18)
                    .padding(.top, 8)
                }
                Spacer()
            }
        }
        // Single tap anywhere dismisses — primary affordance per user.
        // The MagnificationGesture is attached to the image only, so a
        // tap on the backdrop or even the image (while not zoomed) is
        // unambiguous. Double-tap zooms in / resets.
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
            withAnimation(.spring(response: 0.32, dampingFraction: 0.85)) {
                if scale > 1.01 {
                    scale = 1; offset = .zero; lastOffset = .zero
                } else {
                    scale = 2.4
                }
                lastScale = scale
            }
        }
        .onTapGesture {
            SabqHaptics.light()
            dismiss()
        }
        .task(id: url) {
            await loadFullResolution()
        }
        .statusBarHidden(true)
    }

    @MainActor
    private func loadFullResolution() async {
        guard let url else { return }

        // Bigger budget than CachedAsyncImage's 2400 ceiling so pinch-zoom
        // stays sharp. NSCache hit short-circuits to the already-loaded
        // bitmap; otherwise we download once and seed both `image` and
        // the cache.
        if let cached = ImageCache.cachedAny(url) {
            // Show the cached (lower-res) bitmap immediately so the user
            // never sees a blank lightbox, then upgrade if a higher-res
            // version is available below.
            if image == nil { image = cached }
        }

        let loaded = await Task.detached(priority: .userInitiated) { () -> UIImage? in
            guard let (data, _) = try? await ImageCache.imageSession.data(from: url) else {
                return nil
            }
            return ImageCache.decodedImage(data: data, maxPixelSize: 4096)
        }.value

        guard !Task.isCancelled else { return }
        if let loaded {
            withAnimation(.easeOut(duration: 0.25)) { image = loaded }
        }
    }
}

// MARK: - Surface Card

struct SurfaceCard<Content: View>: View {
    private let content: Content
    var accent: Color?
    /// كسولة للقوائم الطويلة — انظر تعليق body.
    var lazy: Bool = false
    /// نصف قطر اختياري للحاويات ذات الكثافة الأعلى؛ يبقى الافتراضي هو هوية السطح العامة.
    var cornerRadius: CGFloat = SabqTheme.cardRadius
    /// المسافة بين عناصر المحتوى؛ تبقى 18 للحاويات العامة ويمكن تصفيرها للقوائم ذات الفواصل.
    var spacing: CGFloat = SabqLayout.space16

    init(
        accent: Color? = nil,
        lazy: Bool = false,
        cornerRadius: CGFloat = SabqTheme.cardRadius,
        spacing: CGFloat = SabqLayout.space16,
        @ViewBuilder content: () -> Content
    ) {
        self.accent = accent
        self.lazy = lazy
        self.cornerRadius = cornerRadius
        self.spacing = spacing
        self.content = content()
    }

    var body: some View {
        // `lazy: true` للقوائم الطويلة داخل ScrollView — النسخة العادية كانت
        // تُركّب 50 صفًا وصورها دفعة واحدة أثناء حركة الدفع (تدقيق 2026-08-02).
        return Group {
            if lazy {
                LazyVStack(alignment: .leading, spacing: spacing) { content }
            } else {
                VStack(alignment: .leading, spacing: spacing) { content }
            }
        }
        .padding(SabqLayout.cardInset)
        .frame(maxWidth: .infinity, alignment: .leading)
        .multilineTextAlignment(.leading)
        // بلوك هادئ بلا حد (النموذج المعتمد #1913).
        .background(
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(SabqTheme.surfaceMuted)
        )
        .sabqRTL()
    }
}

// MARK: - Screen Header

struct SabqPageIntro: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .sabqText(SabqType.excerpt)
            .foregroundStyle(SabqTheme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct CompactScreenHeader: View {
    @Environment(\.legibilityWeight) private var legibilityWeight
    let title: String
    let subtitle: String
    var actionTitle: String?
    var actionIcon: String?
    var actionTint: Color = SabqTheme.primaryEnd
    var action: (() -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(title)
                    .font(SabqType.articleTitle.font(boldText: legibilityWeight == .bold))
                    .accessibilityAddTraits(.isHeader)
                    .foregroundStyle(SabqTheme.ink)

                Text(subtitle)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if let actionTitle, let actionIcon, let action {
                SmallActionButton(
                    title: actionTitle,
                    systemImage: actionIcon,
                    tint: actionTint,
                    action: action
                )
            }
        }
        .sabqRTL()
    }
}

// MARK: - Section Header

struct SectionHeader: View {
    let title: String
    let subtitle: String
    let icon: String
    let tint: Color

    var body: some View {
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(title)
                    .font(SabqType.sectionHeading.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)

                Text(subtitle)
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            SmallSquareBadge(systemImage: icon, tint: tint)
        }
    }
}

// MARK: - Badges

struct SmallSquareBadge: View {
    let systemImage: String
    let tint: Color

    var body: some View {
        RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
            .fill(SabqTheme.surfaceMuted)
            .frame(width: 40, height: 40)
            .overlay {
                Image(systemName: systemImage)
                    .font(SabqFonts.app(size: 18, weight: .semibold))
                    .foregroundStyle(tint)
            }
            .accessibilityHidden(true)
    }
}

struct SquareIconBadge: View {
    let systemImage: String
    let tint: Color

    var body: some View {
        RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
            .fill(SabqTheme.surfaceMuted)
            .frame(width: 72, height: 72)
            .overlay {
                Image(systemName: systemImage)
                    .font(SabqFonts.app(size: 26, weight: .semibold))
                    .foregroundStyle(tint)
            }
    }
}

// MARK: - Buttons

struct SmallActionButton: View {
    let title: String
    let systemImage: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: SabqLayout.space8) {
                Text(title)
                    .font(SabqType.caption)

                Image(systemName: systemImage)
                    .font(SabqType.caption)
            }
            .foregroundStyle(tint)
            .padding(.horizontal, SabqLayout.space12)
            .padding(.vertical, SabqLayout.space8)
            .frame(minHeight: SabqLayout.touchTarget)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                    .fill(SabqTheme.surfaceMuted)
            )
        }
        .buttonStyle(.plain)
    }
}

struct PrimaryCTAButton: View {
    let title: String
    let systemImage: String
    var isDisabled: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(SabqType.button.font)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(isDisabled ? SabqTheme.disabledInk : SabqTheme.onAction)
                .padding(.horizontal, SabqLayout.space16)
                .padding(.vertical, SabqLayout.space12)
                .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                .background(isDisabled ? SabqTheme.disabledFill : SabqTheme.actionFill,
                            in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
    }
}

// MARK: - Chips

struct CategoryChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(isSelected ? SabqTheme.onAction : SabqTheme.textPrimary)
                .padding(.horizontal, SabqLayout.space16)
                .padding(.vertical, SabqLayout.space8)
                .frame(minHeight: SabqLayout.touchTarget)
                .background(
                    Capsule(style: .continuous)
                        .fill(
                            isSelected
                                ? AnyShapeStyle(SabqTheme.actionFill)
                                : AnyShapeStyle(SabqTheme.surfaceMuted)
                        )
                )
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}

struct StatusChip: View {
    let title: String
    let tint: Color

    var body: some View {
        Text(title)
            .font(SabqType.tag.font)
            .foregroundStyle(tint)
            .padding(.horizontal, SabqLayout.space8)
            .padding(.vertical, SabqLayout.space4)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                    .fill(SabqTheme.surfaceMuted)
            )
    }
}

/// Detail-page label pill — matches the clean, compact, borderless capsule
/// style used on the home hero card (`FeaturedArticleCard`).
struct DetailLabelPill: View {
    let title: String
    let tint: Color
    var icon: String? = nil
    var fill: Color? = nil

    var body: some View {
        HStack(spacing: 4) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .semibold))
                    .frame(width: 12, height: 12)
                    .accessibilityHidden(true)
            }
            Text(title)
                .font(SabqType.tag.font)
                .lineLimit(1)
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 8)
        .padding(.vertical, 2.5)
        .background(
            Capsule(style: .continuous)
                .fill(fill ?? tint.opacity(0.08))
        )
        .contentShape(Capsule(style: .continuous))
    }
}

// MARK: - Featured Article Card

struct FeaturedArticleCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let article: Article
    let onBookmark: () -> Void
    let isBookmarked: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Width-driven 16:9 frame; fixedSize stops a parent from squeezing
            // the image narrower than the text column.
            Color.clear
                .frame(maxWidth: .infinity)
                .aspectRatio(16.0 / 9.0, contentMode: .fit)
                .fixedSize(horizontal: false, vertical: true)
                .overlay {
                    Group {
                        if let urlString = article.imageURL, let url = URL(string: urlString) {
                            FocalCachedAsyncImage(url: url, focalPoint: article.imageFocalPoint, fitsMismatchedAspect: true) {
                                SabqImagePlaceholder()
                            }
                        } else {
                            SabqImagePlaceholder()
                                .environment(\.sabqImageLoadFailed, true)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .strokeBorder(SabqTheme.separator, lineWidth: 0.75)
                )
                .aiImageBadgeOverlay(
                    isVisible: article.isAiGeneratedImage,
                    model: article.aiImageModel,
                    inset: 10
                )
                .padding(.bottom, SabqLayout.space12)

            HStack(alignment: .center, spacing: 8) {
                Text(article.categoryTitle)
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.primary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2.5)
                    .background(
                        Capsule(style: .continuous)
                            .fill(SabqTheme.primary.opacity(0.07))
                    )
                if article.isFreshlyPublished {
                    Text("جديد")
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.success)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2.5)
                        .background(
                            Capsule(style: .continuous)
                                .fill(SabqTheme.success.opacity(0.08))
                        )
                } else {
                    Text(heroWhen)
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                        .monospacedDigit()
                }
            }
            .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
            .padding(.bottom, SabqLayout.space8)

            SabqRTLText(
                article.title,
                uiFont: SabqType.leadTitle.uiFont,
                color: SabqTheme.textPrimary,
                lineLimit: dynamicTypeSize.isAccessibilitySize ? 0 : 3,
                lineSpacing: SabqType.leadTitle.lineSpacing,
                textStyle: SabqType.leadTitle.uiTextStyle
            )
            .padding(.bottom, SabqLayout.space8)

            if !article.excerpt.isEmpty {
                SabqRTLText(
                    article.excerpt,
                    uiFont: SabqType.excerpt.uiFont,
                    color: SabqTheme.textSecondary,
                    lineLimit: dynamicTypeSize.isAccessibilitySize ? 0 : 2,
                    lineSpacing: SabqType.excerpt.lineSpacing,
                    textStyle: SabqType.excerpt.uiTextStyle
                )
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .contextMenu {
            Button(action: onBookmark) {
                Label(
                    isBookmarked ? "إزالة من المحفوظات" : "حفظ المقال",
                    systemImage: isBookmarked ? "bookmark.slash" : "bookmark"
                )
            }
        }
        .accessibilityAction(named: isBookmarked ? "إزالة من المحفوظات" : "حفظ الخبر", onBookmark)
    }

    /// «قبل 40 دقيقة» لخبر اليوم، و«أمس 4:35 م» لخبر الأمس، والتاريخ لما قبله.
    private var heroWhen: String {
        let cal = SabqFormatters.riyadhCalendar
        let date = article.publishDate
        if cal.isDateInToday(date) { return article.relativeDate }
        let clock = "\(SabqFormatters.riyadhHourMinute.string(from: date)) \(SabqFormatters.riyadhPeriod.string(from: date))"
        if cal.isDateInYesterday(date) { return "أمس \(clock)" }
        return article.dateFormatted
    }
}

// MARK: - Compact Article Row

/// Shared geometry and typography for the compact news-list rows. Keeping
/// these values here lets custom row consumers adopt the same visual rhythm
/// without changing the global surface-card treatment.
enum NewsRowStyle {
    /// مصغّرة 4:3 بعرض 104 وارتفاع 78 على طرف السطر لموازنة ارتفاع العنوان والبيانات، وزوايا 8.
    static let thumbnailWidth: CGFloat = 104
    static let thumbnailHeight: CGFloat = 78
    static let thumbnailRadius: CGFloat = SabqRadius.small
    static let thumbnailGap: CGFloat = SabqLayout.space12
    static let textStackSpacing: CGFloat = SabqLayout.space8
    static let titleSize: CGFloat = SabqType.rowTitle.size
    static let compactTitleSize: CGFloat = SabqType.rowTitle.size
    static let compactTitleLines = 3
    static let titleLineSpacing: CGFloat = SabqType.rowTitle.lineSpacing
    static let metadataSize: CGFloat = SabqType.meta.size
    static let metadataLineSpacing: CGFloat = 2
}

struct CompactArticleRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let article: Article
    let onBookmark: () -> Void
    let isBookmarked: Bool
    /// Shows a "جديد" badge for articles that just landed via pull-to-refresh
    /// / the live "أخبار جديدة" banner (`ArticlesStore.isRecentlyAdded`).
    /// Defaulted so the eight non-home call sites stay source-compatible.
    var isNew: Bool = false
    /// The category page already names the section in its header.
    var showsCategory: Bool = true
    /// تكبير المصغّرة (رئيسية Duo مفتوحًا تكبّر صور البارزة قليلًا).
    var thumbnailScale: CGFloat = 1

    // Reader can flip between the legacy thumbnail-on-the-side layout
    // ("classic") and the experimental image-on-top hero layout
    // ("spacious") from Settings → العرض. Default is "classic" — the
    // spacious variant took too much vertical real estate and was rolled
    // back. Kept as an opt-in until we can iterate on density.
    @AppStorage("homeCardStyle") private var styleRaw: String = "classic"

    private var isSpacious: Bool { styleRaw == "spacious" }

    var body: some View {
        if isSpacious {
            spaciousLayout
        } else {
            classicLayout
        }
    }

    // MARK: - Classic (thumbnail on the side)

    private var classicLayout: some View {
        HStack(alignment: .top, spacing: NewsRowStyle.thumbnailGap) {
            VStack(alignment: .leading, spacing: NewsRowStyle.textStackSpacing) {
                SabqRTLText(
                    article.title,
                    uiFont: SabqType.rowTitle.uiFont,
                    color: SabqTheme.textPrimary,
                    lineLimit: dynamicTypeSize.isAccessibilitySize ? 0 : NewsRowStyle.compactTitleLines,
                    lineSpacing: NewsRowStyle.titleLineSpacing,
                    textStyle: SabqType.rowTitle.uiTextStyle
                )

                metadataRow
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            compactThumbnail
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .contentShape(Rectangle())
    }

    // MARK: - Spacious (image on top, 16:10 hero)

    private var spaciousLayout: some View {
        VStack(alignment: .leading, spacing: 12) {
            heroImage

            SabqRTLText(
                article.title,
                uiFont: SabqType.rowTitle.uiFont,
                color: SabqTheme.textPrimary,
                lineLimit: dynamicTypeSize.isAccessibilitySize ? 0 : 3,
                lineSpacing: NewsRowStyle.titleLineSpacing,
                textStyle: SabqType.rowTitle.uiTextStyle
            )

            metadataRow
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .contentShape(Rectangle())
    }

    /// مصغّرة 112×63 مع نقطة التركيز وشارة الصورة المولّدة.
    private var compactThumbnail: some View {
        Group {
            if let urlString = article.imageURL, let url = URL(string: urlString) {
                FocalCachedAsyncImage(url: url, focalPoint: article.imageFocalPoint, maxPixelSize: 360, fitsMismatchedAspect: true) {
                    SabqImagePlaceholder()
                }
            } else {
                SabqImagePlaceholder()
                    .environment(\.sabqImageLoadFailed, true)
            }
        }
        .frame(width: NewsRowStyle.thumbnailWidth * thumbnailScale, height: NewsRowStyle.thumbnailHeight * thumbnailScale)
        .clipShape(RoundedRectangle(cornerRadius: NewsRowStyle.thumbnailRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: NewsRowStyle.thumbnailRadius, style: .continuous)
                .strokeBorder(SabqTheme.separator, lineWidth: 0.75)
        )
        .aiImageBadgeOverlay(
            isVisible: article.isAiGeneratedImage,
            model: article.aiImageModel,
            inset: 4,
            sizeScale: 0.65
        )
    }

    private var heroImage: some View {
        // 16:10 container — full row width. CachedAsyncImage fills.
        Color.clear
            .aspectRatio(16.0 / 10.0, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .overlay(
                Group {
                    if let urlString = article.imageURL, let url = URL(string: urlString) {
                        FocalCachedAsyncImage(url: url, focalPoint: article.imageFocalPoint) {
                            SabqImagePlaceholder()
                        }
                    } else {
                        SabqImagePlaceholder()
                            .environment(\.sabqImageLoadFailed, true)
                    }
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            .aiImageBadgeOverlay(
                isVisible: article.isAiGeneratedImage,
                model: article.aiImageModel,
                inset: 10
            )
    }

    // MARK: - Shared sub-views

    private var categoryPill: some View {
        Text(article.categoryTitle)
            .font(SabqType.tag.font)
            .foregroundStyle(SabqTheme.primary)
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 2.5)
            .background(
                Capsule(style: .continuous)
                    .fill(SabqTheme.primary.opacity(0.07))
            )
            .fixedSize(horizontal: true, vertical: false)
    }

    private var newPill: some View {
        Text("جديد")
            .font(SabqType.tag.font)
            .foregroundStyle(SabqTheme.success)
            .padding(.horizontal, 8)
            .padding(.vertical, 2.5)
            .background(
                Capsule(style: .continuous)
                    .fill(SabqTheme.success.opacity(0.08))
            )
            .fixedSize(horizontal: true, vertical: false)
    }

    private var metadataRow: some View {
        TimelineView(.periodic(from: .now, by: 30)) { context in
            let showNew = isNew || article.isFreshlyPublished(relativeTo: context.date)
            HStack(alignment: .center, spacing: 6) {
                if showsCategory {
                    categoryPill
                }
                if showNew {
                    newPill
                } else {
                    Text(SabqFormatters.relativeArabic.localizedString(for: article.publishDate, relativeTo: context.date))
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
            }
            .font(SabqType.meta.font)
            .lineSpacing(NewsRowStyle.metadataLineSpacing)
            .foregroundStyle(SabqTheme.textTertiary)
            .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - Category Tile

struct CategoryTile: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.legibilityWeight) private var legibilityWeight
    let category: ArticleCategory

    init(category: ArticleCategory) {
        self.category = category
    }

    init(category: ArticleCategory, action: @escaping () -> Void) {
        self.category = category
    }

    init(category: ArticleCategory, articleCount: Int, action: @escaping () -> Void) {
        self.category = category
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SmallSquareBadge(systemImage: category.icon, tint: SabqTheme.primaryEnd)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                Text(category.title)
                    .font(SabqFonts.editorial(.headline, size: 16, weight: .semibold, boldText: legibilityWeight == .bold))
                    .foregroundStyle(SabqTheme.ink)

                Group {
                    if dynamicTypeSize.isAccessibilitySize {
                        Text(category.subtitle)
                    } else {
                        Text(category.subtitle).lineLimit(2, reservesSpace: true)
                    }
                }
                .font(SabqType.caption)
                .foregroundStyle(SabqTheme.tertiaryInk)
                .fixedSize(horizontal: false, vertical: true)
                .multilineTextAlignment(.leading)
            }
        }
        .padding(SabqLayout.cardInset)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surfaceMuted)

        )
    }
}

// MARK: - Empty State

struct EmptyStateView: View {
    let icon: String
    let tint: Color
    let title: String
    let subtitle: String
    var action: (() -> Void)? = nil
    var actionTitle: String? = nil

    var body: some View {
        VStack(spacing: SabqLayout.space12) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 26, weight: .regular))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(SabqTheme.textSecondary)
                .frame(width: 56, height: 56)
                .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium))
                .accessibilityHidden(true)

            Text(title)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Text(subtitle)
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: 360)

            if let action, let actionTitle {
                Button(actionTitle) {
                    SabqHaptics.light()
                    action()
                }
                .font(SabqType.button.font)
                .foregroundStyle(SabqTheme.primary)
                .padding(.horizontal, SabqLayout.space24)
                .frame(minHeight: SabqLayout.controlHeight)
                .overlay(RoundedRectangle(cornerRadius: SabqRadius.medium)
                    .stroke(SabqTheme.outline, lineWidth: 1))
                .padding(.top, SabqLayout.space4)
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space24)
    }
}

// MARK: - Error State

struct ErrorStateView: View {
    let message: String
    var retryAction: (() -> Void)?

    var body: some View {
        EmptyStateView(
            icon: "wifi.exclamationmark",
            tint: SabqTheme.coral,
            title: "تعذّر تحميل المحتوى",
            subtitle: message,
            action: retryAction,
            actionTitle: "إعادة المحاولة"
        )
    }
}

// MARK: - Tab Bar

// Floating-capsule TabBar redesigned around 4 tabs (was 5).
// Aesthetic mirrors the Passport sheet calmness the user pointed at as
// reference: ultraThinMaterial container, generous breathing room, an
// accent-tinted pill that slides under the selected tab via
// matchedGeometryEffect. The selected tab keeps its label visible; idle tabs
// shrink to icon-only so the bar feels light, not crowded.
struct SabqTabBar: View {
    @Binding var selectedTab: AppTab
    /// Fires on every tap, even when the tap targets the already-selected
    /// tab. ContentView uses this hook to empty its `navigationPath`
    /// (pop-to-root behaviour) — `.onChange(of: selectedTab)` alone
    /// wouldn't fire when the value doesn't change, which is exactly the
    /// case when the user is deep inside a pushed view of the Home tab
    /// and taps Home again hoping to escape.
    var onSelect: ((AppTab) -> Void)? = nil
    @Namespace private var selectionNamespace

    private let tabs: [AppTab] = [.home, .explore, .bookmarks, .profile]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(tabs) { tab in
                let isSelected = selectedTab == tab
                Button {
                    SabqHaptics.light()
                    onSelect?(tab)
                    if selectedTab != tab {
                        withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) {
                            selectedTab = tab
                        }
                    }
                } label: {
                    tabLabel(tab: tab, isSelected: isSelected)
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity)
                // التبويب غير المحدد أيقونة فقط — بدون توصيف لا يعرف مستخدم
                // VoiceOver أسماء التبويبات ولا أيّها المحدد حاليًا.
                .accessibilityLabel(tab.title)
                .accessibilityAddTraits(isSelected ? [.isSelected] : [])
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .background(
            Capsule(style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    Capsule(style: .continuous)
                        .stroke(SabqTheme.outline.opacity(0.30), lineWidth: 0.5)
                )
                .shadow(color: SabqTheme.deepShadow.opacity(0.35), radius: 18, x: 0, y: -2)
                .shadow(color: SabqTheme.shadow, radius: 36, x: 0, y: 8)
        )
    }

    @ViewBuilder
    private func tabLabel(tab: AppTab, isSelected: Bool) -> some View {
        let tint = SabqTheme.primaryEnd
        HStack(spacing: 6) {
            Image(systemName: isSelected ? tab.selectedImage : tab.systemImage)
                .font(SabqFonts.app(size: 16, weight: .medium))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(isSelected ? tint : SabqTheme.tertiaryInk)

            if isSelected {
                Text(tab.title)
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(tint)
                    // Without these, "استكشاف" wraps onto a second line
                    // inside the narrower active capsule on 6.1" devices.
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
                    .transition(.asymmetric(
                        insertion: .opacity.combined(with: .move(edge: .leading)),
                        removal: .opacity
                    ))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity)
        .background {
            if isSelected {
                Capsule(style: .continuous)
                    .fill(tint.opacity(0.14))
                    .matchedGeometryEffect(id: "selectionPill", in: selectionNamespace)
            }
        }
        .contentShape(Capsule(style: .continuous))
    }
}

// MARK: - Search Bar

struct SabqSearchBar: View {
    @Binding var text: String
    let placeholder: String
    var onSubmit: (() -> Void)?
    var focusState: FocusState<Bool>.Binding?

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(SabqFonts.app(size: 16, weight: .semibold))
                .foregroundStyle(text.isEmpty ? SabqTheme.primaryEnd.opacity(0.5) : SabqTheme.primaryEnd)
                .animation(.easeInOut(duration: 0.2), value: text.isEmpty)

            textField

            if !text.isEmpty {
                Button {
                    withAnimation(.easeOut(duration: 0.15)) {
                        text = ""
                    }
                    SabqHaptics.light()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(SabqFonts.app(size: 16))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
                .buttonStyle(.plain)
                .transition(.scale.combined(with: .opacity))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    // Soft tint over the material so the bar reads warm in
                    // light mode and adapts in dark — calmer than pure glass.
                    RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                        .fill(SabqTheme.paleFill.opacity(0.35))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.40), lineWidth: 0.5)
        )
        .animation(.easeInOut(duration: 0.2), value: !text.isEmpty)
    }

    @ViewBuilder
    private var textField: some View {
        let field = TextField(placeholder, text: $text)
            .font(SabqFonts.app(size: 16, weight: .medium))
            .foregroundStyle(SabqTheme.ink)
            .multilineTextAlignment(.leading)
            .onSubmit { onSubmit?() }

        if let focusState {
            field.focused(focusState)
        } else {
            field
        }
    }
}

// MARK: - Flow Layout

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > maxWidth, currentX > 0 {
                currentY += rowHeight + spacing
                currentX = 0
                rowHeight = 0
            }
            currentX += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }

        return CGSize(width: maxWidth, height: currentY + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var currentX: CGFloat = bounds.minX
        var currentY: CGFloat = bounds.minY
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > bounds.maxX, currentX > bounds.minX {
                currentY += rowHeight + spacing
                currentX = bounds.minX
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: currentX, y: currentY), proposal: .unspecified)
            currentX += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

struct SabqAdaptivePickerStyle: ViewModifier {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    @ViewBuilder
    func body(content: Content) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            content.pickerStyle(.menu)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            content.pickerStyle(.segmented)
        }
    }
}

// MARK: - سطح بطاقات الرئيسية

extension View {
    /// البلوكات الخاصة على الصفحة البيضاء: تعبئة هادئة بزوايا 12 وحدود سماوية ناعمة.
    func sabqBlockSurface(_ fill: Color = SabqTheme.surfaceMuted) -> some View {
        let shape = RoundedRectangle(cornerRadius: SabqTheme.blockRadius, style: .continuous)
        return background(shape.fill(fill))
            .overlay(shape.strokeBorder(SabqTheme.skyOutline.opacity(0.65), lineWidth: 0.75))
            .clipShape(shape)
    }

    /// بطاقة تحريرية مميزة بخلفية سماوية سبق هادئة وإطار سماوي ناعم.
    func sabqSkyCardSurface() -> some View {
        let shape = RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
        return background(shape.fill(SabqTheme.skyTint))
            .overlay(shape.strokeBorder(SabqTheme.skyOutline.opacity(0.85), lineWidth: 0.75))
            .clipShape(shape)
    }
}

/// فاصل رفيع ونظيف بين أقسام الصفحة بدل الشريط الرمادي العريض.
struct SabqSectionBand: View {
    var body: some View {
        SabqTheme.separator
            .frame(height: 1)
            .padding(.vertical, SabqLayout.space4)
            .accessibilityHidden(true)
    }
}
