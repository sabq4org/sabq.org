import SwiftUI

// MARK: - دماغ «عقل سبق» — نقل BrainCanvas.tsx
//
// منظر جانبي لدماغ بشري، الفص الجبهي نحو اليمين، وعقدة القرار الخضراء في مقدمته:
// كل نبضة تصلها تتحول إلى الأخضر — الآلة تُشير والمحرر يقرّر.
//
// طبقتان: ثابتة (الفصوص، الحد المتوهج، التلافيف، الشقوق) تُرسم مرة لكل مقاس،
// ومتحركة بـ 60 إطارًا (العصبونات، الوصلات، النبضات، عقدة القرار). تتوقف الحركة
// حين يخرج الدماغ من الشاشة أو عند تفعيل «تقليل الحركة».

struct SabqAIBrain: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.saiViewport) private var viewport
    @State private var model = SAIBrainModel()
    @State private var onScreen = true

    var body: some View {
        ZStack {
            Canvas { ctx, size in
                model.ensure(size)
                model.drawStatic(&ctx)
            }
            TimelineView(.animation(minimumInterval: 1 / 60, paused: reduceMotion || !onScreen)) { timeline in
                Canvas { ctx, size in
                    model.ensure(size)
                    model.step(time: timeline.date.timeIntervalSinceReferenceDate, spawn: !reduceMotion)
                    model.drawDynamic(&ctx)
                }
            }
        }
        .environment(\.layoutDirection, .leftToRight)
        .onGeometryChange(for: Bool.self) { proxy in
            let f = proxy.frame(in: .scrollView)
            return f.maxY > 0 && f.minY < viewport
        } action: { onScreen = $0 }
        .accessibilityElement()
        .accessibilityLabel("دماغ عقل سبق: شبكة عصبية تنتهي عند عقدة قرار المحرر")
        .accessibilityAddTraits(.isImage)
    }
}

final class SAIBrainModel {
    private struct Neuron {
        var hx: CGFloat, hy: CGFloat, x: CGFloat, y: CGFloat, ph: CGFloat, r: CGFloat
        var human = false
    }
    private struct Link { let a: Int, b: Int, o: CGFloat }
    private struct Pulse { let link: Int; var t: CGFloat; let speed: CGFloat; let reverse: Bool }

    private var size: CGSize = .zero
    private var shapes: [Path] = []
    private var gyri: [Path] = []
    private var nodes: [Neuron] = []
    private var links: [Link] = []
    private var pulses: [Pulse] = []
    private var time: Double = 0
    private var lastTime: Double?
    private var spawnCarry: Double = 0
    private var seed: Int64 = 7

    private var W: CGFloat { size.width }
    private var H: CGFloat { size.height }

    // ألوان BrainCanvas.tsx كما هي.
    private static let blue = SAI.rgb(0x5CB4FF)
    private static let green = SAI.rgb(0x3FE0A0)

    private func rnd() -> CGFloat {
        seed = (seed * 16807) % 2147483647
        return CGFloat(seed) / 2147483647
    }

    func ensure(_ s: CGSize) {
        guard s.width > 1, s.height > 1, s != size else { return }
        build(s)
    }

    // MARK: Geometry

    private func cerebrumPath() -> Path {
        var p = Path()
        let cx = 0.54 * W, cy = 0.4 * H, rx = 0.41 * W, ry = 0.31 * H
        for i in 0...180 {
            let t = CGFloat(i) / 180 * .pi * 2
            let r = 1 + 0.028 * sin(t * 13) + 0.018 * sin(t * 23 + 1.3)
            let px = cx + cos(t) * rx * r
            var py = cy + sin(t) * ry * r * (cos(t) > 0 ? 1.06 : 0.96)
            if py > cy + ry * 0.55 { py = cy + ry * 0.55 + (py - (cy + ry * 0.55)) * 0.35 }
            if i == 0 { p.move(to: CGPoint(x: px, y: py)) } else { p.addLine(to: CGPoint(x: px, y: py)) }
        }
        p.closeSubpath()
        return p
    }

    private func ellipse(_ cx: CGFloat, _ cy: CGFloat, _ rx: CGFloat, _ ry: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2))
    }

    private func stemPath() -> Path {
        var p = Path()
        p.move(to: CGPoint(x: 0.43 * W, y: 0.56 * H))
        p.addQuadCurve(to: CGPoint(x: 0.385 * W, y: 0.93 * H), control: CGPoint(x: 0.41 * W, y: 0.75 * H))
        p.addLine(to: CGPoint(x: 0.455 * W, y: 0.93 * H))
        p.addQuadCurve(to: CGPoint(x: 0.52 * W, y: 0.6 * H), control: CGPoint(x: 0.475 * W, y: 0.75 * H))
        p.closeSubpath()
        return p
    }

    private func inside(_ x: CGFloat, _ y: CGFloat) -> Bool {
        let pt = CGPoint(x: x, y: y)
        return shapes.contains { $0.contains(pt) }
    }

    private func build(_ s: CGSize) {
        size = s
        seed = 7
        pulses = []
        shapes = [
            cerebrumPath(),
            ellipse(0.6 * W, 0.55 * H, 0.24 * W, 0.13 * H),
            ellipse(0.27 * W, 0.66 * H, 0.135 * W, 0.095 * H),
            stemPath(),
        ]

        gyri = []
        for _ in 0..<44 {
            var px = 0.2 * W + rnd() * 0.68 * W
            var py = 0.14 * H + rnd() * 0.5 * H
            var a = rnd() * .pi * 2
            var pts = [CGPoint(x: px, y: py)]
            for _ in 0..<7 {
                a += (rnd() - 0.5) * 1.8
                px += cos(a) * W * 0.04
                py += sin(a) * H * 0.04
                if !inside(px, py) { break }
                pts.append(CGPoint(x: px, y: py))
            }
            guard pts.count > 2 else { continue }
            var g = Path()
            g.move(to: pts[0])
            for k in 1..<(pts.count - 1) {
                let mid = CGPoint(x: (pts[k].x + pts[k + 1].x) / 2, y: (pts[k].y + pts[k + 1].y) / 2)
                g.addQuadCurve(to: mid, control: pts[k])
            }
            gyri.append(g)
        }

        nodes = []
        let count = W < 420 ? 110 : 190
        let minD = W * 0.028
        var tries = 0
        while nodes.count < count && tries < 8000 {
            tries += 1
            let px = rnd() * W, py = rnd() * H
            guard inside(px, py) else { continue }
            if nodes.contains(where: { hypot($0.hx - px, $0.hy - py) < minD }) { continue }
            nodes.append(Neuron(hx: px, hy: py, x: px, y: py, ph: rnd() * 6.28, r: 0.8 + rnd() * 1.5))
        }
        nodes.append(Neuron(hx: 0.83 * W, hy: 0.33 * H, x: 0.83 * W, y: 0.33 * H, ph: 0, r: 5, human: true))

        links = []
        let maxL = W * 0.075
        for i in 0..<nodes.count {
            for j in (i + 1)..<nodes.count {
                let d = hypot(nodes[i].hx - nodes[j].hx, nodes[i].hy - nodes[j].hy)
                let human = nodes[i].human || nodes[j].human
                if d < (human ? maxL * 1.5 : maxL) { links.append(Link(a: i, b: j, o: 1 - d / maxL)) }
            }
        }
    }

    // MARK: Static layer

    func drawStatic(_ ctx: inout GraphicsContext) {
        guard W > 1 else { return }
        for s in shapes { ctx.fill(s, with: .color(SAI.rgb(0x285AA0, 0.035))) }

        // الحد الخارجي فقط: حواف كل الفصوص ثم مسح داخلها حتى لا تظهر الخطوط المتداخلة، مع توهج أزرق.
        ctx.drawLayer { glow in
            glow.addFilter(.shadow(color: SAI.rgb(0x5CB4FF, 0.8), radius: 11))
            glow.drawLayer { o in
                for s in shapes {
                    o.stroke(s, with: .color(SAI.rgb(0x8CC8FF, 0.75)), style: StrokeStyle(lineWidth: 3, lineJoin: .round))
                }
                o.blendMode = .destinationOut
                for s in shapes { o.fill(s, with: .color(.black)) }
            }
        }

        let round = StrokeStyle(lineWidth: 1.5, lineCap: .round)
        for g in gyri { ctx.stroke(g, with: .color(SAI.rgb(0x78BEFF, 0.2)), style: round) }

        var fissures = Path()
        fissures.move(to: CGPoint(x: 0.73 * W, y: 0.55 * H))
        fissures.addCurve(to: CGPoint(x: 0.42 * W, y: 0.42 * H),
                          control1: CGPoint(x: 0.62 * W, y: 0.47 * H), control2: CGPoint(x: 0.52 * W, y: 0.5 * H))
        fissures.move(to: CGPoint(x: 0.6 * W, y: 0.1 * H))
        fissures.addCurve(to: CGPoint(x: 0.54 * W, y: 0.47 * H),
                          control1: CGPoint(x: 0.56 * W, y: 0.24 * H), control2: CGPoint(x: 0.6 * W, y: 0.34 * H))
        ctx.stroke(fissures, with: .color(SAI.rgb(0x96CDFF, 0.35)), style: StrokeStyle(lineWidth: 1.6, lineCap: .round))

        // حلقات المخيخ: أقواس علوية متداخلة.
        var rings = Path()
        let cx = 0.27 * W, cy = 0.66 * H
        for k in 1..<5 {
            let f = 1 - CGFloat(k) * 0.17
            let rx = 0.135 * W * f, ry = 0.095 * H * f
            for step in 0...32 {
                let a = CGFloat.pi * (1.05 + 0.9 * CGFloat(step) / 32)
                let pt = CGPoint(x: cx + cos(a) * rx, y: cy + sin(a) * ry)
                if step == 0 { rings.move(to: pt) } else { rings.addLine(to: pt) }
            }
        }
        ctx.stroke(rings, with: .color(SAI.rgb(0x78BEFF, 0.16)), lineWidth: 1)
    }

    // MARK: Animation

    func step(time now: Double, spawn: Bool) {
        let dt = lastTime.map { min(max(now - $0, 0), 0.05) } ?? 0
        lastTime = now
        time = now
        let t = CGFloat(now.truncatingRemainder(dividingBy: 3600))

        for i in nodes.indices where !nodes[i].human {
            nodes[i].x = nodes[i].hx + sin(t * 0.7 + nodes[i].ph) * 1.6
            nodes[i].y = nodes[i].hy + cos(t * 0.6 + nodes[i].ph) * 1.6
        }

        // الويب يطلق نبضة باحتمال 0.7 في كل إطار عند 60 إطارًا؛ نحسبها بالزمن لتثبت مع أي معدل.
        if spawn, !links.isEmpty {
            spawnCarry += dt * 60 * 0.7
            while spawnCarry >= 1, pulses.count < 220 {
                spawnCarry -= 1
                pulses.append(Pulse(link: Int.random(in: 0..<links.count), t: 0,
                                    speed: 0.012 + CGFloat.random(in: 0..<0.02), reverse: Bool.random()))
            }
        }
        let frames = CGFloat(dt * 60)
        for i in pulses.indices { pulses[i].t += pulses[i].speed * frames }
        pulses.removeAll { $0.t > 1 }
    }

    func drawDynamic(_ ctx: inout GraphicsContext) {
        guard W > 1, !nodes.isEmpty else { return }
        let t = CGFloat(time.truncatingRemainder(dividingBy: 3600))

        // الوصلات مجمّعة في درجات شفافية: رسم واحد لكل درجة بدل رسمة لكل وصلة.
        let blueBins = 8, greenBins = 5
        var blue = Array(repeating: Path(), count: blueBins)
        var green = Array(repeating: Path(), count: greenBins)
        for l in links {
            let a = nodes[l.a], b = nodes[l.b]
            if a.human || b.human {
                let alpha = min(max(0.18 + l.o * 0.2, 0.02), 0.38)
                let k = min(greenBins - 1, Int((alpha / 0.38) * CGFloat(greenBins)))
                green[k].move(to: CGPoint(x: a.x, y: a.y)); green[k].addLine(to: CGPoint(x: b.x, y: b.y))
            } else {
                let alpha = max(l.o * 0.32, 0)
                let k = min(blueBins - 1, Int((alpha / 0.32) * CGFloat(blueBins)))
                blue[k].move(to: CGPoint(x: a.x, y: a.y)); blue[k].addLine(to: CGPoint(x: b.x, y: b.y))
            }
        }
        for k in 0..<blueBins where !blue[k].isEmpty {
            ctx.stroke(blue[k], with: .color(Self.blue.opacity(0.32 * (CGFloat(k) + 0.5) / CGFloat(blueBins))), lineWidth: 0.8)
        }
        for k in 0..<greenBins where !green[k].isEmpty {
            ctx.stroke(green[k], with: .color(Self.green.opacity(0.38 * (CGFloat(k) + 0.5) / CGFloat(greenBins))), lineWidth: 0.8)
        }

        // النبضات: البيضاء المزرقة تسري في الشبكة، وما يصل عقدة القرار يصير أخضر.
        var bluePulses = Path(), greenPulses = Path()
        for p in pulses {
            let l = links[p.link]
            let a = nodes[p.reverse ? l.b : l.a], b = nodes[p.reverse ? l.a : l.b]
            let x = a.x + (b.x - a.x) * p.t, y = a.y + (b.y - a.y) * p.t
            if b.human {
                greenPulses.addEllipse(in: CGRect(x: x - 2.4, y: y - 2.4, width: 4.8, height: 4.8))
            } else {
                bluePulses.addEllipse(in: CGRect(x: x - 1.7, y: y - 1.7, width: 3.4, height: 3.4))
            }
        }
        if !bluePulses.isEmpty {
            ctx.drawLayer { l in
                l.addFilter(.shadow(color: Self.blue, radius: 6))
                l.fill(bluePulses, with: .color(SAI.rgb(0xBEE4FF, 0.95)))
            }
        }
        if !greenPulses.isEmpty {
            ctx.drawLayer { l in
                l.addFilter(.shadow(color: Self.green, radius: 6))
                l.fill(greenPulses, with: .color(Self.green))
            }
        }

        // العصبونات تومض بدرجات، وعقدة القرار تتنفس بهالة خضراء.
        let twinkleBins = 6
        var dots = Array(repeating: Path(), count: twinkleBins)
        for n in nodes {
            if n.human {
                let radius = 46 + sin(t * 2.2) * 7
                let center = CGPoint(x: n.x, y: n.y)
                ctx.fill(Path(ellipseIn: CGRect(x: n.x - 56, y: n.y - 56, width: 112, height: 112)),
                         with: .radialGradient(Gradient(colors: [Self.green.opacity(0.55), Self.green.opacity(0)]),
                                               center: center, startRadius: 0, endRadius: radius))
                ctx.fill(Path(ellipseIn: CGRect(x: n.x - n.r, y: n.y - n.r, width: n.r * 2, height: n.r * 2)),
                         with: .color(Self.green))
                continue
            }
            let tw = 0.55 + 0.45 * sin(t * 1.8 + n.ph * 3)
            let k = min(twinkleBins - 1, max(0, Int(tw * CGFloat(twinkleBins))))
            dots[k].addEllipse(in: CGRect(x: n.x - n.r, y: n.y - n.r, width: n.r * 2, height: n.r * 2))
        }
        for k in 0..<twinkleBins where !dots[k].isEmpty {
            let tw = (CGFloat(k) + 0.5) / CGFloat(twinkleBins)
            ctx.fill(dots[k], with: .color(SAI.rgb(0xC8E8FF, 0.45 + tw * 0.5)))
        }
    }
}
