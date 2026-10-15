package com.sabq.smart.feature.economy

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.CompositionLocalProvider
import com.sabq.smart.ui.theme.SabqTheme

/** ألوان الاتجاه (نظير iOS `EconomyTone`). */
object EconomyTone {
    val up = Color(0.10f, 0.50f, 0.34f)
    val down = Color(0.82f, 0.29f, 0.15f)
    fun color(tone: String): Color? = when (tone) { "up" -> up; "down" -> down; else -> null }
}

/** شارة حمراء نابضة «جديد» / «أرقام جديدة» / «نشرة جديدة». */
@Composable
fun EconomyNewBadge(label: String = "جديد") {
    val transition = rememberInfiniteTransition(label = "economy-badge")
    val pulse by transition.animateFloat(
        initialValue = 1f, targetValue = 0.35f,
        animationSpec = infiniteRepeatable(tween(1000), RepeatMode.Reverse),
        label = "pulse",
    )
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(Color(0.94f, 0.27f, 0.27f))
            .padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Box(Modifier.size(6.dp).alpha(pulse).clip(CircleShape).background(Color.White))
        Text(label, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White)
    }
}

/** شريحة التغير: ▲/▼ + النسبة المطلقة، اللون يحمل الاتجاه؛ «—» عند الغياب. */
@Composable
fun EconomyChangeChip(value: Double?, digits: Int = 1, suffix: String = "", hideEmpty: Boolean = false) {
    if (value == null && hideEmpty) return
    val direction = when {
        value == null || !value.isFinite() -> 0
        value > 0.0001 -> 1
        value < -0.0001 -> -1
        else -> 0
    }
    val tint = if (direction > 0) EconomyTone.up else if (direction < 0) EconomyTone.down else SabqTheme.colors.secondaryInk
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Row(
            modifier = Modifier
                .clip(CircleShape)
                .background(tint.copy(alpha = 0.10f))
                .padding(horizontal = 8.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                text = if (value == null) "—" else if (direction > 0) "▲" else if (direction < 0) "▼" else "•",
                fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = tint,
            )
            if (value != null) {
                Text(EconomyFormat.fmtPct(value, digits) + suffix, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = tint)
            }
        }
    }
}

private fun chartPoints(values: List<Double>, width: Float, height: Float, padTop: Float, padBottom: Float): List<Offset> {
    val v = values.filter { it.isFinite() }
    if (v.size < 2) return emptyList()
    val minV = v.min(); val maxV = v.max()
    val span = maxOf(maxV - minV, 0.000001)
    val stepX = width / (v.size - 1)
    // RTL: الأقدم على اليمين والأحدث على اليسار (كما في الويب وiOS).
    return v.mapIndexed { i, value ->
        Offset(
            x = width - i * stepX,
            y = height - padBottom - ((value - minV) / span).toFloat() * (height - padTop - padBottom),
        )
    }
}

/** خط اتجاه صغير (72×26) مع نقطة على آخر قيمة. */
@Composable
fun EconomySparkline(values: List<Double>, modifier: Modifier = Modifier, tint: Color = SabqTheme.colors.primaryEnd, lineWidth: Float = 2f) {
    Canvas(modifier = modifier) {
        val pts = chartPoints(values, size.width, size.height, 3f, 3f)
        if (pts.size < 2) return@Canvas
        val path = Path().apply { moveTo(pts[0].x, pts[0].y); pts.drop(1).forEach { lineTo(it.x, it.y) } }
        drawPath(path, tint, style = Stroke(width = lineWidth.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
        drawCircle(tint, radius = 3.dp.toPx(), center = pts.last())
    }
}

/** مساحة صغيرة بتدرّج تحت الخط + تسميتا الطرفين. */
@Composable
fun EconomyMiniArea(values: List<Double>, labels: List<String> = emptyList(), modifier: Modifier = Modifier, tint: Color = SabqTheme.colors.primaryEnd) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Canvas(modifier = Modifier.fillMaxWidth().weight(1f)) {
            val pts = chartPoints(values, size.width, size.height, 6f, 2f)
            if (pts.size < 2) return@Canvas
            val area = Path().apply {
                moveTo(pts[0].x, size.height)
                pts.forEach { lineTo(it.x, it.y) }
                lineTo(pts.last().x, size.height)
                close()
            }
            drawPath(area, Brush.verticalGradient(listOf(tint.copy(alpha = 0.25f), tint.copy(alpha = 0.02f))))
            val line = Path().apply { moveTo(pts[0].x, pts[0].y); pts.drop(1).forEach { lineTo(it.x, it.y) } }
            drawPath(line, tint, style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
        if (labels.size >= 2) {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(labels.last(), fontSize = 9.sp, color = SabqTheme.colors.tertiaryInk)
                    Text(labels.first(), fontSize = 9.sp, color = SabqTheme.colors.tertiaryInk)
                }
            }
        }
    }
}

/** بطاقة بشريط علوي ملوّن (3dp) مقصوص مع زوايا البطاقة — ملاحظة المالك في iOS. */
@Composable
fun EconomyAccentCard(
    tone: Color,
    modifier: Modifier = Modifier,
    radius: androidx.compose.ui.unit.Dp = 12.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(radius)
    Column(
        modifier = modifier
            .clip(shape)
            .background(SabqTheme.colors.surface)
            .border(1.dp, SabqTheme.colors.outline, shape),
    ) {
        Box(Modifier.fillMaxWidth().height(3.dp).background(tone))
        Column(content = content)
    }
}

/** بطاقة الاقتصاد العادية (سطح + إطار) بحشو 14. */
@Composable
fun EconomyCard(modifier: Modifier = Modifier, radius: androidx.compose.ui.unit.Dp = 14.dp, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(radius)
    Column(
        modifier = modifier
            .clip(shape)
            .background(SabqTheme.colors.surface)
            .border(1.dp, SabqTheme.colors.outline, shape)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        content = content,
    )
}

/**
 * بطاقة الرئيسية برقم واحد (بقرار المالك #1641/#1642): أولوية النشرة الشهرية
 * الجديدة (< 48 ساعة) ثم إنفاق الأسبوع؛ تختفي كليًا بلا بيانات.
 */
@Composable
fun EconomyHomeBlock(snapshot: EconomySnapshot?, onClick: () -> Unit) {
    when (EconomyFormat.homeMode(snapshot)) {
        EconomyFormat.HomeMode.Monthly -> {
            val monthly = snapshot?.monthly ?: return
            val card = monthly.cards.firstOrNull() ?: return
            EconomyTeaser(
                title = "رقم من ${monthly.monthLabelAr}",
                figure = card.figure,
                caption = if (card.key == "mobileVsCard") "من إنفاق نقاط البيع تم بالجوال" else (card.seriesLabelAr ?: card.cardTitle),
                badge = "نشرة جديدة",
                cta = "أرقام الشهر",
                onClick = onClick,
            )
        }
        EconomyFormat.HomeMode.Weekly -> {
            val weekly = snapshot?.weekly ?: return
            EconomyTeaser(
                title = "أين أنفق السعوديون؟",
                figure = "${EconomyFormat.fmtSar(weekly.totalValue)} ريال",
                caption = "إنفاق نقاط البيع · ${weekly.weekLabelAr}",
                badge = if (EconomyFormat.isFresh(weekly.ingestedAt)) "أرقام جديدة" else null,
                cta = "أين صُرفت؟",
                onClick = onClick,
            )
        }
        EconomyFormat.HomeMode.Hidden -> Unit
    }
}

@Composable
private fun EconomyTeaser(title: String, figure: String, caption: String, badge: String?, cta: String, onClick: () -> Unit) {
    EconomyAccentCard(tone = SabqTheme.colors.primaryEnd, radius = 16.dp, modifier = Modifier.fillMaxWidth().clickable { onClick() }) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(title, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink, modifier = Modifier.weight(1f))
                if (badge != null) EconomyNewBadge(badge)
            }
            Text(figure, fontSize = 32.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.primaryEnd, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(caption, fontSize = 11.sp, color = SabqTheme.colors.secondaryInk)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("المصدر: البنك المركزي السعودي", fontSize = 10.sp, color = SabqTheme.colors.secondaryInk, modifier = Modifier.weight(1f))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(cta, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.primaryEnd)
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = SabqTheme.colors.primaryEnd, modifier = Modifier.size(12.dp))
                }
            }
        }
    }
}

/** شبكة عمودين بارتفاع متساوٍ لكل صف (بديل LazyVerticalGrid داخل LazyColumn). */
@Composable
fun TwoColumnGrid(count: Int, spacing: androidx.compose.ui.unit.Dp = 10.dp, cell: @Composable (Int) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(spacing)) {
        var i = 0
        while (i < count) {
            Row(
                modifier = Modifier.fillMaxWidth().height(androidx.compose.ui.unit.Dp.Unspecified).let { it },
                horizontalArrangement = Arrangement.spacedBy(spacing),
            ) {
                androidx.compose.foundation.layout.Row(
                    modifier = Modifier.fillMaxWidth().height(androidx.compose.foundation.layout.IntrinsicSize.Max),
                    horizontalArrangement = Arrangement.spacedBy(spacing),
                ) {
                    Box(Modifier.weight(1f).fillMaxSize()) { cell(i) }
                    if (i + 1 < count) Box(Modifier.weight(1f).fillMaxSize()) { cell(i + 1) } else Spacer(Modifier.weight(1f))
                }
            }
            i += 2
        }
    }
}
