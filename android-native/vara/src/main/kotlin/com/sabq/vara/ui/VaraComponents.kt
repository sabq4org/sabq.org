package com.sabq.vara.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.repeatOnLifecycle
import coil.compose.AsyncImage
import com.sabq.vara.core.Fixture
import com.sabq.vara.core.fixtureKickoff
import com.sabq.vara.core.latinNumber

val VaraCardShape = RoundedCornerShape(28.dp)
val VaraTileShape = RoundedCornerShape(16.dp)
val VaraChipShape = RoundedCornerShape(12.dp)

@Composable
fun VaraBackground(modifier: Modifier = Modifier) {
    val c = LocalVaraColors.current
    Box(modifier.background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom))))
}

@Composable
fun VaraWordmark(size: Int = 21, color: Color = LocalVaraColors.current.text) {
    val c = LocalVaraColors.current
    Text(
        buildAnnotatedString {
            append("VA")
            withStyle(SpanStyle(color = c.gold)) { append("R") }
            append("A")
        },
        color = color,
        fontFamily = VaraFont,
        fontWeight = FontWeight.Bold,
        fontSize = size.sp,
        letterSpacing = (size * .12).sp,
    )
}

@Composable
fun VaraCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val c = LocalVaraColors.current
    Column(
        modifier
            .clip(VaraCardShape)
            .background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), VaraCardShape)
            .padding(16.dp),
        content = content,
    )
}

@Composable
fun SectionHeader(
    title: String,
    subtitle: String? = null,
    count: Int? = null,
    icon: androidx.compose.ui.graphics.vector.ImageVector = Icons.Default.SportsSoccer,
    tint: Color = LocalVaraColors.current.accent,
) {
    val c = LocalVaraColors.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(38.dp).clip(RoundedCornerShape(11.dp)).background(tint.copy(alpha = .14f)), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleLarge, color = c.text)
            if (!subtitle.isNullOrBlank()) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = c.textDim)
        }
        if (count != null) Text("$count", color = tint, fontWeight = FontWeight.Bold, modifier = Modifier.clip(CircleShape).background(tint.copy(.14f)).padding(horizontal = 10.dp, vertical = 4.dp))
    }
}

/**
 * ترويسة يوم بتدرّج لون المحور الخفيف + أيقونة تقويم + عدّاد مباريات.
 * المصدر البصري: دلو «قادمة» في تفاصيل البطولة — يُعاد استخدامها في مركز المباريات و«لك» وغيرها.
 */
@Composable
fun DateSectionBanner(
    label: String,
    count: Int? = null,
    modifier: Modifier = Modifier,
    tint: Color = LocalVaraColors.current.accent,
    subtitle: String? = null,
) {
    val c = LocalVaraColors.current
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            Modifier
                .fillMaxWidth()
                .clip(VaraChipShape)
                .background(tint.copy(alpha = .08f))
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(Icons.Default.CalendarMonth, contentDescription = null, tint = tint, modifier = Modifier.size(14.dp))
            Text(
                label,
                color = c.text,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (count != null && count > 0) {
                Text(
                    if (count == 1) "مباراة" else "$count مباريات",
                    color = tint,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(tint.copy(alpha = .12f))
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                )
            }
        }
        if (!subtitle.isNullOrBlank()) {
            Text(
                subtitle,
                color = tint,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 4.dp),
            )
        }
    }
}

/** هل أغلب حروف الاسم لاتينية؟ (إنجليزي/أوروبي يلوّث محاذاة صفوف RTL.) */
fun String.isPrimarilyLatin(): Boolean {
    val letters = filter { it.isLetter() }
    if (letters.isEmpty()) return false
    val latin = letters.count { ch ->
        val code = ch.code
        code in 0x0041..0x024F || code in 0x1E00..0x1EFF
    }
    return latin * 2 >= letters.length
}

/** عزل اتجاه الاسم (FSI/PDI) حتى لا يقلب محاذاة الصف المحيط. */
fun String.bidiIsolated(): String = if (isEmpty()) this else "\u2068$this\u2069"

/**
 * تسمية نادٍ/لاعب: عزل BiDi للأسماء اللاتينية أو المختلطة، ومحاذاة صريحة،
 * ووزن يقطع بـellipsis بدل دفع الجيران.
 */
@Composable
fun TeamLabel(
    name: String,
    modifier: Modifier = Modifier,
    color: Color = LocalVaraColors.current.text,
    fontSize: TextUnit = 12.sp,
    fontWeight: FontWeight = FontWeight.SemiBold,
    textAlign: TextAlign = TextAlign.Start,
    maxLines: Int = 1,
) {
    val latin = remember(name) { name.isPrimarilyLatin() }
    val text: @Composable () -> Unit = {
        Text(
            text = name.bidiIsolated(),
            color = color,
            fontSize = fontSize,
            fontWeight = fontWeight,
            maxLines = maxLines,
            overflow = TextOverflow.Ellipsis,
            textAlign = textAlign,
            modifier = modifier,
        )
    }
    if (latin) {
        // صندوق LTR داخل صف RTL: «Young FC» يبقى متماسكًا والمحاذاة textAlign سارية.
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr, content = text)
    } else {
        text()
    }
}

@Composable
fun RemoteLogo(url: String, name: String, size: Int = 42) {
    val c = LocalVaraColors.current
    val logoSize = size
    var failed by remember(url) { mutableStateOf(false) }
    val initials = remember(name) {
        name.filter { !it.isWhitespace() }.take(2).ifBlank { "?" }
    }
    Box(
        Modifier
            .size(logoSize.dp)
            .clip(CircleShape)
            .background(Color.White)
            .border(1.dp, c.outline, CircleShape)
            .padding((logoSize * .12f).dp),
        contentAlignment = Alignment.Center,
    ) {
        if (url.isNotBlank() && !failed) {
            AsyncImage(
                model = url,
                contentDescription = name,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Fit,
                onError = { failed = true },
            )
        } else {
            Text(
                initials,
                color = c.accentDeep,
                fontSize = (logoSize / 3f).sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
            )
        }
    }
}

@Composable
fun FixtureCard(
    fixture: Fixture,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    trailing: (@Composable () -> Unit)? = null,
    caption: String? = null,
    showVenue: Boolean = true,
) {
    val c = LocalVaraColors.current
    val topLine = caption ?: fixture.competitionName.ifBlank { fixture.round }
    Column(
        modifier.fillMaxWidth().clip(VaraTileShape).background(c.surface).border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else .7f), VaraTileShape)
            .clickable(onClick = onClick).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(topLine, color = c.textDim, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f), maxLines = 1)
            StatusPill(fixture)
            if (trailing != null) { Spacer(Modifier.width(8.dp)); trailing() }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TeamLine(fixture.home.name, fixture.home.logo, Modifier.weight(1f))
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(horizontal = 10.dp)) {
                FixtureCenter(fixture)
            }
            TeamLine(fixture.away.name, fixture.away.logo, Modifier.weight(1f), reverse = true)
        }
        if (showVenue && fixture.venue.isNotBlank()) Text(fixture.venue, color = c.textFaint, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/// مركز بطاقة المباراة: النتيجة (بالضيف أولًا داخل LTR كي يبقى المضيف يمينًا في
/// RTL) أو الوقت للمباراة القادمة، مع سطر ركلات الترجيح عند وجودها.
@Composable
fun FixtureCenter(fixture: Fixture, scoreSize: Int = 20) {
    val c = LocalVaraColors.current
    if (fixture.status.live || fixture.status.finished) {
        ForceLtr {
            Text("${latinNumber(fixture.awayScore)} - ${latinNumber(fixture.homeScore)}", color = c.text, fontSize = scoreSize.sp, fontWeight = FontWeight.Bold)
        }
        if (fixture.hasPenalties) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("ترجيح", color = c.textDim, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            ForceLtr { Text("${latinNumber(fixture.penAway)} - ${latinNumber(fixture.penHome)}", color = c.textDim, fontSize = 10.sp, fontWeight = FontWeight.Bold) }
        }
    } else {
        ForceLtr { Text(fixtureKickoff(fixture).substringBefore(" · "), color = c.text, fontWeight = FontWeight.Bold) }
        Text(fixtureKickoff(fixture).substringAfter(" · ", ""), color = c.textFaint, fontSize = 10.sp)
    }
}

@Composable
private fun TeamLine(name: String, logo: String, modifier: Modifier, reverse: Boolean = false) {
    val c = LocalVaraColors.current
    // reverse = الضيف: شعار ثم اسم. غير ذلك = المضيف: اسم ثم شعار (ملاصق للمركز).
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        if (reverse) {
            RemoteLogo(logo, name, 34)
            TeamLabel(
                name = name,
                color = c.text,
                fontSize = 12.sp,
                maxLines = 2,
                textAlign = TextAlign.Start,
                modifier = Modifier.weight(1f),
            )
        } else {
            TeamLabel(
                name = name,
                color = c.text,
                fontSize = 12.sp,
                maxLines = 2,
                textAlign = TextAlign.End,
                modifier = Modifier.weight(1f),
            )
            RemoteLogo(logo, name, 34)
        }
    }
}

/// تخطيط LTR قسري — لعزل أرقام النتيجة/الوقت داخل سياق RTL (نظير
/// environment(\.layoutDirection, .leftToRight) في iOS).
@Composable
fun ForceLtr(content: @Composable () -> Unit) {
    androidx.compose.runtime.CompositionLocalProvider(
        androidx.compose.ui.platform.LocalLayoutDirection provides androidx.compose.ui.unit.LayoutDirection.Ltr,
        content = content,
    )
}

/// نص دقيقة حيّ يتقدّم بالثانية من مرساة clockStartEpoch — نظير SpLiveMinuteText.
@Composable
fun LiveMinuteText(status: com.sabq.vara.core.MatchStatus, color: Color, fontSize: Int = 10) {
    val ticking = com.sabq.vara.core.MatchClock.isSelfTicking(status)
    val nowMs = if (ticking) {
        val state = androidx.compose.runtime.produceState(System.currentTimeMillis(), status) {
            while (true) { value = System.currentTimeMillis(); kotlinx.coroutines.delay(1000) }
        }
        state.value
    } else System.currentTimeMillis()
    ForceLtr { Text(com.sabq.vara.core.MatchClock.minuteText(status, nowMs), color = color, fontSize = fontSize.sp, fontWeight = FontWeight.Bold) }
}

@Composable
fun StatusPill(fixture: Fixture) {
    val c = LocalVaraColors.current
    val status = fixture.status
    val codeUpper = status.code.uppercase()
    when {
        status.live -> Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.clip(CircleShape).background(c.live).padding(horizontal = 8.dp, vertical = 3.dp),
        ) {
            Box(Modifier.size(5.dp).clip(CircleShape).background(Color.White))
            LiveMinuteText(status, Color.White, 11)
        }
        status.finished -> PillText("انتهت", c.live)
        // مؤجلة/ملغاة وغيرها: نعرض ليبل الخادم بدل «قادمة» المضللة.
        codeUpper !in setOf("NS", "TBD") && status.label.isNotBlank() && status.label != status.code ->
            PillText(status.label, c.textDim)
        else -> PillText("قادمة", c.accent)
    }
}

@Composable
private fun PillText(label: String, color: Color) {
    Text(label, color = color, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clip(CircleShape).background(color.copy(.12f)).padding(horizontal = 8.dp, vertical = 3.dp))
}

sealed interface LoadState<out T> {
    data object Loading : LoadState<Nothing>
    data class Data<T>(val value: T) : LoadState<T>
    data class Error(val message: String) : LoadState<Nothing>
}

@Composable
fun <T> LoadStateHost(state: LoadState<T>, retry: () -> Unit, content: @Composable (T) -> Unit) {
    val c = LocalVaraColors.current
    when (state) {
        LoadState.Loading -> Box(Modifier.fillMaxWidth().height(180.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = c.accent) }
        is LoadState.Error -> Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(state.message, color = c.textDim, textAlign = TextAlign.Center)
            Button(retry, colors = ButtonDefaults.buttonColors(containerColor = c.accent)) { Icon(Icons.Default.Refresh, null); Spacer(Modifier.width(6.dp)); Text("إعادة المحاولة") }
        }
        is LoadState.Data -> content(state.value)
    }
}

@Composable
fun EmptyState(title: String, subtitle: String = "") {
    val c = LocalVaraColors.current
    Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Icon(Icons.Default.SportsSoccer, null, tint = c.accent, modifier = Modifier.size(32.dp))
        Text(title, color = c.text, fontWeight = FontWeight.SemiBold)
        if (subtitle.isNotBlank()) Text(subtitle, color = c.textDim, fontSize = 12.sp, textAlign = TextAlign.Center)
    }
}

@Composable
fun VaraDivider() { HorizontalDivider(color = LocalVaraColors.current.outline.copy(alpha = .65f)) }

/// سحب-للتحديث موحّد — نظير .refreshable في iOS.
@kotlin.OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun VaraPullRefresh(
    refreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val c = LocalVaraColors.current
    androidx.compose.material3.pulltorefresh.PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = onRefresh,
        modifier = modifier,
    ) { content() }
}

/// فترات الاستطلاع المتكيّف الموحّدة (نظير pollLive في شاشات iOS):
/// live → 10ث، قرب الانطلاق (−30د..+3س) → 30ث، خامل → interval الخامل أو لا شيء.
fun adaptivePollDelayMs(fixtures: List<Fixture>, idleMs: Long? = 45_000L): Long? {
    val now = System.currentTimeMillis()
    if (fixtures.any { it.status.live }) return 10_000L
    val nearKickoff = fixtures.any { fx ->
        val k = fx.kickoffMs ?: return@any false
        !fx.status.finished && k - 30 * 60_000L <= now && now <= k + 3 * 60 * 60_000L
    }
    if (nearKickoff) return 30_000L
    return idleMs
}

/// حلقة استطلاع دورية تعمل فقط والشاشة بالمقدمة (RESUMED) — أول نداء فوري عند
/// كل عودة للمقدمة (نظير scenePhase == .active في iOS)، ثم بحسب delayProvider.
@Composable
fun PollEffect(vararg keys: Any?, delayProvider: () -> Long?, onTick: suspend (first: Boolean) -> Unit) {
    val lifecycle = androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(lifecycle, *keys) {
        lifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.RESUMED) {
            var first = true
            while (true) {
                if (!first) {
                    val delayMs = delayProvider() ?: break
                    kotlinx.coroutines.delay(delayMs)
                }
                runCatching { onTick(first) }
                first = false
            }
        }
    }
}

/// عدّاد تنازلي حيّ يوم/ساعة/دقيقة/ثانية — نظير SpCountdownChips.
@Composable
fun CountdownChips(targetMs: Long) {
    val c = LocalVaraColors.current
    val now = androidx.compose.runtime.produceState(System.currentTimeMillis(), targetMs) {
        while (true) { value = System.currentTimeMillis(); kotlinx.coroutines.delay(1000) }
    }.value
    val total = ((targetMs - now) / 1000L).coerceAtLeast(0)
    val days = total / 86_400; val hours = (total % 86_400) / 3600; val minutes = (total % 3600) / 60; val seconds = total % 60
    val chips = buildList {
        if (days > 0) add(days.toString() to "يوم")
        add(hours.toString().padStart(2, '0') to "ساعة")
        add(minutes.toString().padStart(2, '0') to "دقيقة")
        add(seconds.toString().padStart(2, '0') to "ثانية")
    }
    // LTR صريح: يوم ← ساعة ← دقيقة ← ثانية (اليوم يسارًا) — نظير SpCountdownChips.
    ForceLtr {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            chips.forEach { (value, label) ->
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.clip(VaraChipShape).background(c.chip).padding(horizontal = 12.dp, vertical = 7.dp),
                ) {
                    Text(value, color = c.accent, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Text(label, color = c.textFaint, fontSize = 9.sp)
                }
            }
        }
    }
}
