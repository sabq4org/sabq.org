import SwiftUI

private struct AnalyticsReadingBodyFrameKey: PreferenceKey {
    static var defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) { value = nextValue() }
}

extension View {
    /// Marks the actual article body as the range used for reading-depth
    /// analytics. Comments and related content are deliberately excluded.
    func analyticsReadingBody() -> some View {
        background(GeometryReader { proxy in
            Color.clear.preference(
                key: AnalyticsReadingBodyFrameKey.self,
                value: proxy.frame(in: .named("sabq-analytics-scroll"))
            )
        })
    }

    /// Reports body-only depth while leaving the existing visual/behavior
    /// scroll progress callback untouched.
    func analyticsReadingProgress(_ onChange: @escaping (CGFloat) -> Void) -> some View {
        modifier(AnalyticsReadingProgressModifier(onChange: onChange))
    }
}

private struct AnalyticsReadingProgressModifier: ViewModifier {
    let onChange: (CGFloat) -> Void
    @State private var bodyFrame: CGRect = .zero
    @State private var viewportHeight: CGFloat = 0

    private func report(_ frame: CGRect, viewport: CGFloat) {
        guard frame.height > 0, viewport > 0 else { return }
        onChange(CGFloat(SabqAnalyticsPrivacy.readingDepth(
            bodyTop: Double(frame.minY), bodyHeight: Double(frame.height), viewportHeight: Double(viewport))))
    }

    func body(content: Content) -> some View {
        content
            .coordinateSpace(name: "sabq-analytics-scroll")
            .background(GeometryReader { proxy in
                Color.clear
                    .onAppear { viewportHeight = proxy.size.height }
                    .onChange(of: proxy.size.height) { _, height in viewportHeight = height }
            })
            .onPreferenceChange(AnalyticsReadingBodyFrameKey.self) { frame in
                bodyFrame = frame
                report(frame, viewport: viewportHeight)
            }
            .onChange(of: viewportHeight) { _, height in report(bodyFrame, viewport: height) }
    }
}
