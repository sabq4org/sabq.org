import SwiftUI

/// Parallax background for the seasonal Eid Al-Adha theme. Sits
/// behind the entire app while [EidThemeManager.isActive] is true,
/// painting a deep-green-to-cream gradient overlaid with hand-drawn
/// Islamic motifs (crescent, Kaaba, palm tree, stars). Foreground
/// surfaces (`SurfaceCard`, etc.) scroll over it; the background
/// itself stays fixed so the motifs come into view between cards
/// as the user scrolls — the parallax effect the spec calls for.
///
/// Drawn with SwiftUI Shapes / Path / Canvas so we don't ship a
/// rasterised PNG or rely on external SVG assets. Each motif is a
/// small composable view that can be repositioned independently for
/// design tuning without touching the others.
///
/// Accessibility: when **Reduce Motion** is on, the static layer is
/// still drawn but the slow drifting motion on the stars is disabled.
struct EidThemeBackground: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            backgroundGradient
            motifLayer
        }
        .ignoresSafeArea()
        .allowsHitTesting(false) // never steal taps from the content above.
    }

    /// Vertical gradient — cream at the top, deep green at the
    /// bottom — gives the foreground content a warm, surface-like
    /// frame without competing with article text.
    private var backgroundGradient: some View {
        LinearGradient(
            colors: colorScheme == .dark
                ? [
                    Color(red: 0.06, green: 0.16, blue: 0.10),
                    Color(red: 0.04, green: 0.10, blue: 0.06),
                ]
                : [
                    EidThemeManager.Palette.cream,
                    EidThemeManager.Palette.cream.opacity(0.85),
                    EidThemeManager.Palette.greenDeep.opacity(0.18),
                ],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    @ViewBuilder
    private var motifLayer: some View {
        GeometryReader { proxy in
            let w = proxy.size.width
            let h = proxy.size.height

            ZStack {
                // Star field — small scattered stars that drift very
                // slowly in the background. Cheap, sets mood.
                StarField(count: 24, reduceMotion: reduceMotion)
                    .frame(width: w, height: h)
                    .opacity(colorScheme == .dark ? 0.45 : 0.20)

                // Crescent moon — top-leading on RTL screens.
                CrescentShape()
                    .fill(EidThemeManager.Palette.gold)
                    .frame(width: 100, height: 100)
                    .position(x: w * 0.18, y: h * 0.10)
                    .opacity(0.22)

                // Single tall palm — bottom-trailing corner.
                PalmTreeMotif()
                    .frame(width: 130, height: 200)
                    .position(x: w * 0.85, y: h * 0.78)
                    .opacity(0.20)

                // Stylised Kaaba silhouette — mid-right.
                KaabaMotif()
                    .frame(width: 110, height: 130)
                    .position(x: w * 0.78, y: h * 0.32)
                    .opacity(0.18)

                // Lantern — bottom-leading.
                LanternMotif()
                    .frame(width: 70, height: 110)
                    .position(x: w * 0.16, y: h * 0.82)
                    .opacity(0.22)
            }
        }
    }
}

// MARK: - Motifs

/// Classic crescent — outer circle minus an inner offset circle.
private struct CrescentShape: Shape {
    func path(in rect: CGRect) -> Path {
        let r = min(rect.width, rect.height) / 2
        let center = CGPoint(x: rect.midX, y: rect.midY)
        var p = Path()
        p.addArc(center: center, radius: r, startAngle: .degrees(0),
                 endAngle: .degrees(360), clockwise: false)
        // Cut a smaller offset circle to leave a crescent.
        let cutR = r * 0.85
        let cutCenter = CGPoint(x: center.x + r * 0.35, y: center.y - r * 0.05)
        p.addArc(center: cutCenter, radius: cutR, startAngle: .degrees(0),
                 endAngle: .degrees(360), clockwise: true)
        return p
    }
}

/// Stylised Kaaba — a cube outline with a hint of the door, drawn
/// with rectangles + a band stroke.
private struct KaabaMotif: View {
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            ZStack {
                // Cube body.
                RoundedRectangle(cornerRadius: 4)
                    .fill(EidThemeManager.Palette.greenDeep)
                    .frame(width: w * 0.95, height: h * 0.92)
                // Gold cloth band ("الحزام").
                Rectangle()
                    .fill(EidThemeManager.Palette.gold)
                    .frame(width: w * 0.95, height: h * 0.10)
                    .offset(y: -h * 0.20)
                // Door hint.
                RoundedRectangle(cornerRadius: 2)
                    .fill(EidThemeManager.Palette.gold.opacity(0.85))
                    .frame(width: w * 0.18, height: h * 0.45)
                    .offset(x: w * 0.20, y: h * 0.18)
            }
        }
    }
}

/// Tall date palm — central trunk plus radial fronds.
private struct PalmTreeMotif: View {
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            ZStack {
                // Trunk.
                Capsule()
                    .fill(EidThemeManager.Palette.greenDeep)
                    .frame(width: w * 0.10, height: h * 0.70)
                    .offset(y: h * 0.10)
                // Fronds — 7 strokes radiating from the top.
                ForEach(0..<7, id: \.self) { i in
                    Capsule()
                        .fill(EidThemeManager.Palette.greenDeep)
                        .frame(width: w * 0.55, height: w * 0.06)
                        .offset(x: w * 0.18)
                        .rotationEffect(.degrees(Double(i) * 30 - 90),
                                         anchor: .leading)
                        .offset(y: -h * 0.30)
                }
                // Date cluster — small gold dots near the crown.
                ForEach(0..<5, id: \.self) { i in
                    Circle()
                        .fill(EidThemeManager.Palette.gold)
                        .frame(width: 6, height: 6)
                        .offset(
                            x: cos(Double(i) * 0.7) * 12,
                            y: -h * 0.28 + sin(Double(i) * 0.7) * 8
                        )
                }
            }
        }
    }
}

/// Lantern — bell-shaped silhouette with a chain at the top.
private struct LanternMotif: View {
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            ZStack {
                // Chain.
                Rectangle()
                    .fill(EidThemeManager.Palette.gold)
                    .frame(width: 2, height: h * 0.15)
                    .offset(y: -h * 0.40)
                // Top cap.
                Trapezoid(insetFraction: 0.20)
                    .fill(EidThemeManager.Palette.gold)
                    .frame(width: w * 0.55, height: h * 0.10)
                    .offset(y: -h * 0.27)
                // Body.
                RoundedRectangle(cornerRadius: w * 0.20)
                    .fill(EidThemeManager.Palette.greenDeep)
                    .frame(width: w * 0.85, height: h * 0.50)
                // Bottom cap.
                Trapezoid(insetFraction: -0.20)
                    .fill(EidThemeManager.Palette.gold)
                    .frame(width: w * 0.55, height: h * 0.08)
                    .offset(y: h * 0.30)
                // Inner glow.
                RoundedRectangle(cornerRadius: 2)
                    .fill(EidThemeManager.Palette.gold)
                    .frame(width: w * 0.25, height: h * 0.20)
                    .opacity(0.85)
            }
        }
    }
}

private struct Trapezoid: Shape {
    /// Positive = bottom narrower, negative = top narrower.
    var insetFraction: CGFloat

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let inset = rect.width * abs(insetFraction)
        if insetFraction >= 0 {
            p.move(to: CGPoint(x: rect.minX, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.maxX - inset, y: rect.maxY))
            p.addLine(to: CGPoint(x: rect.minX + inset, y: rect.maxY))
        } else {
            p.move(to: CGPoint(x: rect.minX + inset, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.maxX - inset, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        }
        p.closeSubpath()
        return p
    }
}

/// Field of small randomly-placed stars. Positions are seeded once
/// per view life so the field is stable across scrolls; opacity
/// pulses slowly in the background unless Reduce Motion is on.
private struct StarField: View {
    let count: Int
    let reduceMotion: Bool

    @State private var pulse = false

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                ForEach(0..<count, id: \.self) { idx in
                    let seed = Double(idx)
                    let x = proxy.size.width * CGFloat((seed * 73).truncatingRemainder(dividingBy: 100) / 100)
                    let y = proxy.size.height * CGFloat((seed * 41).truncatingRemainder(dividingBy: 100) / 100)
                    let size = 3 + ((idx % 3) * 2)
                    StarShape()
                        .fill(EidThemeManager.Palette.gold)
                        .frame(width: CGFloat(size), height: CGFloat(size))
                        .position(x: x, y: y)
                        .opacity(reduceMotion ? 0.6 : (pulse ? 0.85 : 0.45))
                        .animation(
                            reduceMotion
                                ? nil
                                : .easeInOut(duration: 2.5 + Double(idx % 4) * 0.6)
                                    .repeatForever(autoreverses: true),
                            value: pulse
                        )
                }
            }
            .onAppear { pulse = true }
        }
    }
}

/// 5-pointed star drawn with Path.
private struct StarShape: Shape {
    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let outer = min(rect.width, rect.height) / 2
        let inner = outer * 0.45
        var p = Path()
        for i in 0..<10 {
            let angle = Double(i) * (.pi / 5) - .pi / 2
            let r = i.isMultiple(of: 2) ? outer : inner
            let pt = CGPoint(
                x: center.x + CGFloat(cos(angle)) * r,
                y: center.y + CGFloat(sin(angle)) * r
            )
            if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
        }
        p.closeSubpath()
        return p
    }
}
