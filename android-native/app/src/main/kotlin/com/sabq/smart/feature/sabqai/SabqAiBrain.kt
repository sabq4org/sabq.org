package com.sabq.smart.feature.sabqai

import android.graphics.BlurMaskFilter
import android.graphics.Region
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asComposePath
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

/**
 * دماغ «عقل سبق» — نقل iOS `SabqAIBrain.swift` (وهو نقل BrainCanvas.tsx في الويب):
 * منظر جانبي لدماغ بشري، الفص الجبهي نحو اليمين، وعقدة القرار الخضراء في مقدمته.
 * كل نبضة تصلها تتحول إلى الأخضر — الآلة تُشير والمحرر يقرّر. تتوقف الحركة
 * عند إيقاف الرسوم المتحركة من إعدادات النظام.
 */
@Composable
fun SabqAiBrain(modifier: Modifier = Modifier, animate: Boolean) {
    val model = remember { SaiBrainModel() }
    var frame by remember { mutableLongStateOf(0L) }
    LaunchedEffect(animate) {
        if (!animate) return@LaunchedEffect
        while (true) {
            withFrameNanos { frame = it }
        }
    }
    Canvas(modifier.semantics { contentDescription = "دماغ عقل سبق: شبكة عصبية تنتهي عند عقدة قرار المحرر" }) {
        model.ensure(size)
        model.step(frame / 1_000_000_000.0, spawn = animate)
        model.drawStatic(this)
        model.drawDynamic(this)
    }
}

private class SaiBrainModel {
    private class Neuron(val hx: Float, val hy: Float, var x: Float, var y: Float, val ph: Float, val r: Float, val human: Boolean = false)
    private class Link(val a: Int, val b: Int, val o: Float)
    private class Pulse(val link: Int, var t: Float, val speed: Float, val reverse: Boolean)

    private var size = Size.Zero
    private var shapes: List<android.graphics.Path> = emptyList()
    private var regions: List<Region> = emptyList()
    private var outline: Path = Path()
    private var gyri: List<Path> = emptyList()
    private var nodes: MutableList<Neuron> = mutableListOf()
    private var links: List<Link> = emptyList()
    private val pulses = mutableListOf<Pulse>()
    private var time = 0.0
    private var lastTime: Double? = null
    private var spawnCarry = 0.0
    private var seed = 7L

    private val W get() = size.width
    private val H get() = size.height

    private val blue = Color(0xFF5CB4FF)
    private val green = Color(0xFF3FE0A0)

    private fun rnd(): Float {
        seed = (seed * 16807) % 2147483647
        return seed.toFloat() / 2147483647f
    }

    fun ensure(s: Size) {
        if (s.width <= 1f || s.height <= 1f || s == size) return
        build(s)
    }

    private fun cerebrum(): android.graphics.Path {
        val p = android.graphics.Path()
        val cx = 0.54f * W; val cy = 0.4f * H; val rx = 0.41f * W; val ry = 0.31f * H
        for (i in 0..180) {
            val t = i / 180f * Math.PI.toFloat() * 2
            val r = 1 + 0.028f * sin(t * 13) + 0.018f * sin(t * 23 + 1.3f)
            val px = cx + cos(t) * rx * r
            var py = cy + sin(t) * ry * r * (if (cos(t) > 0) 1.06f else 0.96f)
            if (py > cy + ry * 0.55f) py = cy + ry * 0.55f + (py - (cy + ry * 0.55f)) * 0.35f
            if (i == 0) p.moveTo(px, py) else p.lineTo(px, py)
        }
        p.close()
        return p
    }

    private fun ellipse(cx: Float, cy: Float, rx: Float, ry: Float) = android.graphics.Path().apply {
        addOval(cx - rx, cy - ry, cx + rx, cy + ry, android.graphics.Path.Direction.CW)
    }

    private fun stem() = android.graphics.Path().apply {
        moveTo(0.43f * W, 0.56f * H)
        quadTo(0.41f * W, 0.75f * H, 0.385f * W, 0.93f * H)
        lineTo(0.455f * W, 0.93f * H)
        quadTo(0.475f * W, 0.75f * H, 0.52f * W, 0.6f * H)
        close()
    }

    private fun inside(x: Float, y: Float): Boolean = regions.any { it.contains(x.toInt(), y.toInt()) }

    private fun build(s: Size) {
        size = s
        seed = 7
        pulses.clear()
        shapes = listOf(
            cerebrum(),
            ellipse(0.6f * W, 0.55f * H, 0.24f * W, 0.13f * H),
            ellipse(0.27f * W, 0.66f * H, 0.135f * W, 0.095f * H),
            stem(),
        )
        val clip = Region(0, 0, W.toInt() + 1, H.toInt() + 1)
        regions = shapes.map { Region().apply { setPath(it, clip) } }
        // الحد الخارجي وحده: اتحاد الفصوص حتى لا تظهر الخطوط المتداخلة.
        val union = android.graphics.Path()
        shapes.forEach { union.op(it, android.graphics.Path.Op.UNION) }
        outline = union.asComposePath()

        val g = mutableListOf<Path>()
        repeat(44) {
            var px = 0.2f * W + rnd() * 0.68f * W
            var py = 0.14f * H + rnd() * 0.5f * H
            var a = rnd() * Math.PI.toFloat() * 2
            val pts = mutableListOf(Offset(px, py))
            for (k in 0 until 7) {
                a += (rnd() - 0.5f) * 1.8f
                px += cos(a) * W * 0.04f
                py += sin(a) * H * 0.04f
                if (!inside(px, py)) break
                pts.add(Offset(px, py))
            }
            if (pts.size > 2) {
                val path = Path()
                path.moveTo(pts[0].x, pts[0].y)
                for (k in 1 until pts.size - 1) {
                    val mid = Offset((pts[k].x + pts[k + 1].x) / 2, (pts[k].y + pts[k + 1].y) / 2)
                    path.quadraticTo(pts[k].x, pts[k].y, mid.x, mid.y)
                }
                g.add(path)
            }
        }
        gyri = g

        nodes = mutableListOf()
        val count = if (W < 420 * 2.5f) 110 else 190
        val minD = W * 0.028f
        var tries = 0
        while (nodes.size < count && tries < 8000) {
            tries++
            val px = rnd() * W; val py = rnd() * H
            if (!inside(px, py)) continue
            if (nodes.any { hypot(it.hx - px, it.hy - py) < minD }) continue
            nodes.add(Neuron(px, py, px, py, rnd() * 6.28f, (0.8f + rnd() * 1.5f) * density))
        }
        nodes.add(Neuron(0.83f * W, 0.33f * H, 0.83f * W, 0.33f * H, 0f, 5f * density, human = true))

        val l = mutableListOf<Link>()
        val maxL = W * 0.075f
        for (i in nodes.indices) for (j in i + 1 until nodes.size) {
            val d = hypot(nodes[i].hx - nodes[j].hx, nodes[i].hy - nodes[j].hy)
            val human = nodes[i].human || nodes[j].human
            if (d < (if (human) maxL * 1.5f else maxL)) l.add(Link(i, j, 1 - d / maxL))
        }
        links = l
    }

    /** نسبة البكسل إلى النقطة تُضبط من العرض: اللوحة مصممة لعرض ~360 نقطة. */
    private val density: Float get() = max(1f, W / 360f)

    fun step(now: Double, spawn: Boolean) {
        val dt = lastTime?.let { min(max(now - it, 0.0), 0.05) } ?: 0.0
        lastTime = now
        time = now
        val t = (now % 3600).toFloat()
        val wob = 1.6f * density
        for (n in nodes) if (!n.human) {
            n.x = n.hx + sin(t * 0.7f + n.ph) * wob
            n.y = n.hy + cos(t * 0.6f + n.ph) * wob
        }
        if (spawn && links.isNotEmpty()) {
            spawnCarry += dt * 60 * 0.7
            while (spawnCarry >= 1 && pulses.size < 220) {
                spawnCarry -= 1
                pulses.add(Pulse(Random.nextInt(links.size), 0f, 0.012f + Random.nextFloat() * 0.02f, Random.nextBoolean()))
            }
        }
        val frames = (dt * 60).toFloat()
        pulses.forEach { it.t += it.speed * frames }
        pulses.removeAll { it.t > 1 }
    }

    fun drawStatic(scope: DrawScope) = with(scope) {
        if (W <= 1) return@with
        shapes.forEach { drawPath(it.asComposePath(), Color(0xFF285AA0).copy(alpha = 0.035f)) }

        // توهج أزرق حول الحد الخارجي.
        drawIntoCanvas { canvas ->
            val paint = Paint().apply {
                color = Color(0xFF5CB4FF).copy(alpha = 0.8f)
                style = androidx.compose.ui.graphics.PaintingStyle.Stroke
                strokeWidth = 6f * density
            }
            paint.asFrameworkPaint().maskFilter = BlurMaskFilter(11f * density, BlurMaskFilter.Blur.NORMAL)
            canvas.drawPath(outline, paint)
        }
        drawPath(outline, Color(0xFF8CC8FF).copy(alpha = 0.75f), style = Stroke(width = 1.5f * density))

        val round = Stroke(width = 1.5f * density, cap = StrokeCap.Round)
        gyri.forEach { drawPath(it, Color(0xFF78BEFF).copy(alpha = 0.2f), style = round) }

        val fissures = Path().apply {
            moveTo(0.73f * W, 0.55f * H)
            cubicTo(0.62f * W, 0.47f * H, 0.52f * W, 0.5f * H, 0.42f * W, 0.42f * H)
            moveTo(0.6f * W, 0.1f * H)
            cubicTo(0.56f * W, 0.24f * H, 0.6f * W, 0.34f * H, 0.54f * W, 0.47f * H)
        }
        drawPath(fissures, Color(0xFF96CDFF).copy(alpha = 0.35f), style = Stroke(width = 1.6f * density, cap = StrokeCap.Round))

        val rings = Path()
        val cx = 0.27f * W; val cy = 0.66f * H
        for (k in 1 until 5) {
            val f = 1 - k * 0.17f
            val rx = 0.135f * W * f; val ry = 0.095f * H * f
            for (step in 0..32) {
                val a = Math.PI.toFloat() * (1.05f + 0.9f * step / 32f)
                val x = cx + cos(a) * rx; val y = cy + sin(a) * ry
                if (step == 0) rings.moveTo(x, y) else rings.lineTo(x, y)
            }
        }
        drawPath(rings, Color(0xFF78BEFF).copy(alpha = 0.16f), style = Stroke(width = 1f * density))
    }

    fun drawDynamic(scope: DrawScope) = with(scope) {
        if (W <= 1 || nodes.isEmpty()) return@with
        val t = (time % 3600).toFloat()
        val line = 0.8f * density

        val blueBins = 8; val greenBins = 5
        val bluePaths = List(blueBins) { Path() }
        val greenPaths = List(greenBins) { Path() }
        for (l in links) {
            val a = nodes[l.a]; val b = nodes[l.b]
            if (a.human || b.human) {
                val alpha = (0.18f + l.o * 0.2f).coerceIn(0.02f, 0.38f)
                val k = min(greenBins - 1, (alpha / 0.38f * greenBins).toInt())
                greenPaths[k].moveTo(a.x, a.y); greenPaths[k].lineTo(b.x, b.y)
            } else {
                val alpha = max(l.o * 0.32f, 0f)
                val k = min(blueBins - 1, (alpha / 0.32f * blueBins).toInt())
                bluePaths[k].moveTo(a.x, a.y); bluePaths[k].lineTo(b.x, b.y)
            }
        }
        bluePaths.forEachIndexed { k, p -> drawPath(p, blue.copy(alpha = 0.32f * (k + 0.5f) / blueBins), style = Stroke(width = line)) }
        greenPaths.forEachIndexed { k, p -> drawPath(p, green.copy(alpha = 0.38f * (k + 0.5f) / greenBins), style = Stroke(width = line)) }

        for (p in pulses) {
            val l = links[p.link]
            val a = nodes[if (p.reverse) l.b else l.a]; val b = nodes[if (p.reverse) l.a else l.b]
            val c = Offset(a.x + (b.x - a.x) * p.t, a.y + (b.y - a.y) * p.t)
            if (b.human) {
                drawCircle(green.copy(alpha = 0.35f), radius = 5f * density, center = c)
                drawCircle(green, radius = 2.4f * density, center = c)
            } else {
                drawCircle(blue.copy(alpha = 0.3f), radius = 3.6f * density, center = c)
                drawCircle(Color(0xFFBEE4FF).copy(alpha = 0.95f), radius = 1.7f * density, center = c)
            }
        }

        for (n in nodes) {
            if (n.human) {
                val radius = (46 + sin(t * 2.2f) * 7) * density
                val center = Offset(n.x, n.y)
                drawCircle(
                    Brush.radialGradient(listOf(green.copy(alpha = 0.55f), green.copy(alpha = 0f)), center = center, radius = radius),
                    radius = radius,
                    center = center,
                )
                drawCircle(green, radius = n.r, center = center)
                continue
            }
            val tw = 0.55f + 0.45f * sin(t * 1.8f + n.ph * 3)
            drawCircle(Color(0xFFC8E8FF).copy(alpha = (0.45f + tw * 0.5f).coerceIn(0f, 1f)), radius = n.r, center = Offset(n.x, n.y))
        }
    }
}
