package com.sabq.smart.feature.kingscup

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.sabq.smart.R
import com.sabq.smart.ui.theme.IbmPlexSansArabic

// شريط كأس الملك في الواجهة الرئيسية — port ‏1:1 لـiOS `KingsCupHomeStrip`:
// بطاقة بتدرّج الهوية (زمردي ملكي + ذهبي) بثلاث حالات بالأولوية: البطل ←
// عدّاد يوم الجولة (3 مباريات فأكثر) ← المباراة القادمة/الحية. تختفي كليًا
// عند إطفاء البلوك من لوحة التحكم (blockHidden) أو غياب البيانات.

@Composable
fun KingsCupHomeStrip(onClick: () -> Unit, viewModel: KingsCupStripViewModel = hiltViewModel()) {
    val overview by viewModel.overview.collectAsStateWithLifecycle()
    val ov = overview ?: return
    if (ov.blockHidden == true) return
    if (ov.champion == null && ov.nextMatch == null) return

    val champion = ov.champion
    val matchdayMode = champion == null && (ov.matchday?.count ?: 0) >= 3
    val glow = if (champion != null) KingsCupColors.gold else KingsCupColors.leaf

    ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
        Box(
            modifier = Modifier.fillMaxWidth()
                .shadow(14.dp, RoundedCornerShape(22.dp), spotColor = KingsCupColors.royal, ambientColor = KingsCupColors.royal)
                .clip(RoundedCornerShape(22.dp))
                .background(Brush.linearGradient(listOf(KingsCupColors.heroTop, KingsCupColors.royal, KingsCupColors.heroBottom)))
                .border(
                    1.dp,
                    if (champion != null) KingsCupColors.gold.copy(alpha = 0.35f) else Color.White.copy(alpha = 0.18f),
                    RoundedCornerShape(22.dp),
                )
                .clickable(onClick = onClick),
        ) {
            // توهّج ناعم في الزاوية العليا — ذهبي احتفالي مع البطل.
            Box(Modifier.matchParentSize()) {
                Box(
                    Modifier.size(140.dp).background(
                        Brush.radialGradient(listOf(glow.copy(alpha = 0.20f), Color.Transparent)),
                    ),
                )
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 13.dp),
            ) {
                KcStripIdentity(
                    subtitle = when {
                        champion != null -> "اكتملت البطولة"
                        matchdayMode -> "تغطية بتوقيت الرياض"
                        ov.nextMatch?.status?.live == true -> "مباشر الآن"
                        else -> "تغطية حية بتوقيت الرياض"
                    },
                )

                Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                    when {
                        champion != null -> KcStripChampion(champion)
                        matchdayMode && ov.matchday != null -> KcStripMatchday(ov.matchday)
                        ov.nextMatch != null -> KcStripMatch(ov.nextMatch)
                    }
                }

                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowLeft, null,
                    tint = Color.White.copy(alpha = 0.9f), modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}

@Composable
private fun KcStripIdentity(subtitle: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Image(
            painter = painterResource(R.drawable.kings_cup_logo),
            contentDescription = null, contentScale = ContentScale.Fit,
            modifier = Modifier.height(32.dp)
                .shadow(4.dp, RoundedCornerShape(10.dp))
                .clip(RoundedCornerShape(10.dp)).background(Color.White)
                .padding(horizontal = 6.dp, vertical = 4.dp),
        )
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("كأس الملك", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            Text(subtitle, color = KingsCupColors.leaf, fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

// ── بطاقة البطل ──

@Composable
private fun KcStripChampion(c: KcChampion) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(
            Modifier.size(40.dp).clip(CircleShape).background(Color.White)
                .border(1.5.dp, KingsCupColors.gold.copy(alpha = 0.8f), CircleShape).padding(4.dp),
            contentAlignment = Alignment.Center,
        ) {
            AsyncImage(model = c.team.logo, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxWidth())
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("🏆 بطل كأس الملك", color = KingsCupColors.gold, fontSize = 10.sp, fontWeight = FontWeight.Medium, maxLines = 1)
            Text(c.team.name, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val runnerUp = c.runnerUp
            val score = c.score
            if (runnerUp != null && score != null) {
                // «الفائز أولًا» من الخادم — لا انقلاب في RTL.
                Text(
                    "فاز على ${runnerUp.name} $score${c.penalties?.let { " (ترجيح $it)" } ?: ""}",
                    color = KingsCupColors.leaf, fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

// ── بطاقة يوم الجولة (عدّاد مشترك — أدوار الدفعة الواحدة) ──

@Composable
private fun KcStripMatchday(md: KcMatchday) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(
            md.round ?: "جولة البطولة",
            color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        Text(
            "${md.count} ${if (md.count == 2) "مباراتان" else "مباريات"} · ${KcFormat.day(md.date)}",
            color = KingsCupColors.leaf, fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        if (md.liveCount > 0) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Box(Modifier.size(6.dp).clip(CircleShape).background(KingsCupColors.liveRed))
                Text(
                    if (md.liveCount == 1) "مباراة تجري الآن" else "${md.liveCount} مباريات تجري الآن",
                    color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Medium, maxLines = 1,
                )
            }
        } else {
            md.nextKickoffTs?.let { ts ->
                val now = rememberKcSecondTicker()
                Text(
                    "تنطلق بعد ${KcFormat.countdown(ts, now)}",
                    color = KingsCupColors.leaf, fontSize = 11.sp, maxLines = 1,
                )
            }
        }
    }
}

// ── بطاقة المباراة القادمة/الحية ──

@Composable
private fun KcStripMatch(f: KcFixture) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        KcStripLogo(f.home.logo)
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            if (f.started) {
                KcLtrText("${f.goals.away ?: 0} - ${f.goals.home ?: 0}", Color.White, 18, FontWeight.Black)
                KcStripLiveStatus(f)
            } else {
                Text(KcFormat.time(f), color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                val now = rememberKcSecondTicker()
                if (f.timestamp.toLong() * 1000L <= now) {
                    // الموعد حان والمزود لم يرفع إشارة «حية» بعد — لا 00:00:00 مجمدة.
                    Text(
                        "حان موعد الانطلاق — التغطية خلال لحظات",
                        color = KingsCupColors.emerald.copy(alpha = 0.85f), fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1,
                    )
                } else {
                    Text(
                        "تنطلق بعد ${KcFormat.countdown(f.timestamp, now)}",
                        color = KingsCupColors.emerald.copy(alpha = 0.85f), fontSize = 10.sp, maxLines = 1,
                    )
                }
            }
        }
        KcStripLogo(f.away.logo)
    }
}

@Composable
private fun KcStripLiveStatus(f: KcFixture) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp),
        modifier = Modifier.clip(RoundedCornerShape(11.dp)).background(KingsCupColors.liveRed)
            .border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(11.dp))
            .padding(horizontal = 9.dp, vertical = 5.dp),
    ) {
        Text(f.status.label.ifEmpty { "مباشر" }, color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Medium, maxLines = 1)
        kcLiveMinute(f.status)?.let { minute ->
            Box(Modifier.size(3.5.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.85f)))
            KcLtrText(minute, Color.White, 10, FontWeight.Medium)
        }
    }
}

@Composable
private fun KcStripLogo(url: String) {
    Box(
        Modifier.size(32.dp).clip(CircleShape).background(Color.White)
            .border(1.dp, Color.White.copy(alpha = 0.5f), CircleShape).padding(3.dp),
        contentAlignment = Alignment.Center,
    ) {
        AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxWidth())
    }
}
