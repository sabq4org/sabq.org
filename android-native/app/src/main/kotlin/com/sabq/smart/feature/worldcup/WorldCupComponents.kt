package com.sabq.smart.feature.worldcup

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.sabq.smart.ui.theme.SabqTheme
import kotlinx.coroutines.delay

/** شعار منتخب داخل دائرة بيضاء (الشعارات شفافة فتحتاج خلفية). */
@Composable
fun WcTeamLogo(team: WcTeam, size: Int = 40, ring: Color = WcColors.cardStroke) {
    Box(
        modifier = Modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(Color.White)
            .border(2.dp, ring, CircleShape)
            .padding((size * 0.14).dp),
        contentAlignment = Alignment.Center,
    ) {
        AsyncImage(
            model = team.logo,
            contentDescription = team.name,
            contentScale = ContentScale.Fit,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** صورة دائرية للاعب (صورة/بديل). */
@Composable
fun WcPlayerPhoto(url: String, fallback: String = "", size: Int = 36) {
    if (url.isBlank()) {
        Box(
            modifier = Modifier.size(size.dp).clip(CircleShape).background(WcColors.chipFill),
            contentAlignment = Alignment.Center,
        ) {
            if (fallback.isNotBlank()) {
                Text(fallback.take(2), color = WcColors.onDarkDim, fontWeight = FontWeight.Black, fontSize = (size / 2.4).sp)
            }
        }
    } else {
        AsyncImage(
            model = url,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.size(size.dp).clip(CircleShape).background(WcColors.chipFill),
        )
    }
}

/** شارة حالة المباراة: مباشر (نبض) / انتهت / وقت الانطلاق. */
@Composable
fun WcStatusPill(fixture: WcFixture, onDark: Boolean = true) {
    when {
        fixture.status.live -> {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(WcColors.liveRed)
                    .padding(horizontal = 8.dp, vertical = 3.dp),
            ) {
                LivePulseDot()
                Text(
                    fixture.status.elapsed?.let { "$it'" } ?: fixture.status.label,
                    color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                )
            }
        }
        fixture.status.finished -> {
            Text(
                fixture.status.label,
                color = if (onDark) Color.White.copy(alpha = 0.85f) else SabqTheme.colors.secondaryInk,
                fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(if (onDark) Color.White.copy(alpha = 0.12f) else SabqTheme.colors.outline)
                    .padding(horizontal = 8.dp, vertical = 3.dp),
            )
        }
        else -> {
            Text(
                WcFormat.time(fixture),
                color = WcColors.emeraldDeep, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(WcColors.emerald.copy(alpha = 0.16f))
                    .padding(horizontal = 8.dp, vertical = 3.dp),
            )
        }
    }
}

@Composable
private fun LivePulseDot() {
    val transition = rememberInfiniteTransition(label = "pulse")
    val alpha by transition.animateFloat(
        initialValue = 1f, targetValue = 0.3f,
        animationSpec = infiniteRepeatable(tween(700, easing = LinearEasing), RepeatMode.Reverse),
        label = "a",
    )
    Box(modifier = Modifier.size(5.dp).clip(CircleShape).background(Color.White.copy(alpha = alpha)))
}

/** مؤقّت حيّ يعيد ملي ثانية الآن كل ثانية. */
@Composable
fun rememberSecondTicker(): Long {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1000)
            now = System.currentTimeMillis()
        }
    }
    return now
}

/** شرائح العدّ التنازلي (يوم/ساعة/دقيقة/ثانية) المتحرّكة. */
@Composable
fun WcCountdownChips(timestamp: Int) {
    val now = rememberSecondTicker()
    val total = (timestamp.toLong() * 1000L - now).coerceAtLeast(0L) / 1000L
    if (total <= 0L) {
        // الموعد حان والمزود لم يرفع إشارة «حية» بعد — لا أصفار مجمدة
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(WcColors.emerald),
            )
            Text(
                "حان موعد الانطلاق — التغطية الحية تبدأ خلال لحظات",
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        return
    }
    val days = (total / 86_400).toInt()
    val hours = ((total % 86_400) / 3_600).toInt()
    val minutes = ((total % 3_600) / 60).toInt()
    val seconds = (total % 60).toInt()
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        chip(days, "يوم"); chip(hours, "ساعة"); chip(minutes, "دقيقة"); chip(seconds, "ثانية")
    }
}

@Composable
private fun chip(value: Int, label: String) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .width(54.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Color.White.copy(alpha = 0.10f))
            .padding(vertical = 6.dp),
    ) {
        Text("$value", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black)
        Text(label, color = WcColors.emerald.copy(alpha = 0.85f), fontSize = 10.sp)
    }
}

/** شريط احتمالات الفوز الثلاثي. */
@Composable
fun WcProbabilityBar(fixture: WcFixture, prediction: WcPrediction) {
    val total = (prediction.home + prediction.draw + prediction.away).coerceAtLeast(1)
    val h = prediction.home * 100 / total
    val d = prediction.draw * 100 / total
    val a = prediction.away * 100 / total
    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("فوز ${fixture.home.name} $h%", color = WcColors.emerald.copy(alpha = 0.9f), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            Text("تعادل $d%", color = Color.White.copy(alpha = 0.6f), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            Text("فوز ${fixture.away.name} $a%", color = WcColors.emerald.copy(alpha = 0.9f), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
        }
        Row(
            modifier = Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(50)),
        ) {
            Box(modifier = Modifier.weight(h.coerceAtLeast(1).toFloat()).fillMaxHeight().background(WcColors.emerald))
            Box(modifier = Modifier.weight(d.coerceAtLeast(1).toFloat()).fillMaxHeight().background(Color.White.copy(alpha = 0.55f)))
            Box(modifier = Modifier.weight(a.coerceAtLeast(1).toFloat()).fillMaxHeight().background(WcColors.sky))
        }
        Text("توقعات خوارزمية للاستئناس من مزود البيانات", color = Color.White.copy(alpha = 0.4f), fontSize = 10.sp)
    }
}

/** ترويسة قسم: أيقونة + عنوان + وصف (على خلفية داكنة). */
@Composable
fun WcSectionHeader(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String, tint: Color = WcColors.emerald) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(tint.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
        }
        Column {
            Text(title, color = WcColors.onDark, fontSize = 21.sp, fontWeight = FontWeight.Black)
            Text(subtitle, color = WcColors.onDarkDim, fontSize = 12.sp)
        }
    }
}

@Composable
fun WcLoading() {
    Box(modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp)
    }
}

@Composable
fun WcEmptyText(message: String) {
    Text(
        message,
        color = WcColors.onDarkDim,
        fontSize = 13.sp,
        modifier = Modifier.fillMaxWidth().padding(vertical = 28.dp),
        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
    )
}
