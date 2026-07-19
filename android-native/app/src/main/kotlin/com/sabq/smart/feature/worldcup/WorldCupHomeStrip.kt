package com.sabq.smart.feature.worldcup

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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.R
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import com.sabq.smart.ui.theme.IbmPlexSansArabic
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class WorldCupStripViewModel @Inject constructor(
    private val repo: WorldCupRepository,
) : ViewModel() {
    private val _overview = MutableStateFlow<WcOverview?>(null)
    val overview: StateFlow<WcOverview?> = _overview.asStateFlow()

    init {
        viewModelScope.launch { _overview.value = runCatching { repo.overview() }.getOrNull() }
    }
}

/** شريط المونديال أعلى الواجهة الرئيسية — يختفي كليًا عند إطفاء البلوك أو غياب البيانات. */
@Composable
fun WorldCupHomeStrip(onClick: () -> Unit, viewModel: WorldCupStripViewModel = hiltViewModel()) {
    val overview by viewModel.overview.collectAsStateWithLifecycle()
    // البطل (بعد حسم النهائي) يتقدّم على مربع المباراة — يبقي البانر حيًّا
    // بعد انتهاء آخر مباراة حتى يُطفأ البلوك من لوحة التحكم
    val champion = overview?.champion
    val f = overview?.matchOfTheDay?.fixture
    if (overview?.hidden == true || (champion == null && f == null)) return

    val live = champion == null && f?.status?.live == true
    androidx.compose.runtime.CompositionLocalProvider(LocalWcForceDark provides true) {
    ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
        Box(
            modifier = Modifier.fillMaxWidth()
                // ظلّ زمردي ملكي يرفع البطاقة عن الخلفية — مطابق iOS
                .shadow(14.dp, RoundedCornerShape(22.dp), spotColor = WcColors.royal, ambientColor = WcColors.royal)
                .clip(RoundedCornerShape(22.dp))
                // تدرّج ثلاثي حيّ (أعلى-يمين ← أسفل-يسار) بدل التدرّج المسطّح
                .background(
                    Brush.linearGradient(
                        colors = listOf(WcColors.heroTop, WcColors.royal, WcColors.heroBottom),
                    )
                )
                .border(1.dp, Color.White.copy(alpha = 0.18f), RoundedCornerShape(22.dp))
                .clickable { onClick() },
        ) {
            // توهّج أخضر فاتح ناعم في الزاوية العليا يضيف عمقًا (مطابق iOS) —
            // ذهبي احتفالي مع البطل. يُرسم كطبقة تطابق حجم البطاقة
            // (matchParentSize) حتى لا يفرض ارتفاعه الخاص على البطاقة.
            val glow = if (champion != null) WcColors.gold else WcColors.leaf
            Box(modifier = Modifier.matchParentSize()) {
                Box(
                    modifier = Modifier.size(140.dp).background(
                        Brush.radialGradient(
                            colors = listOf(glow.copy(alpha = 0.22f), Color.Transparent),
                        )
                    )
                )
            }
            Row(
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 13.dp),
            ) {
                // شعار البطولة الرسمي على خلفية بيضاء — اللمسة الذهبية
                Image(
                    painter = painterResource(R.drawable.world_cup_emblem),
                    contentDescription = null, contentScale = ContentScale.Fit,
                    modifier = Modifier.height(34.dp)
                        .shadow(4.dp, RoundedCornerShape(10.dp))
                        .clip(RoundedCornerShape(10.dp)).background(Color.White)
                        .padding(horizontal = 6.dp, vertical = 4.dp),
                )
                Column {
                    Text("مونديال 2026", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Black, maxLines = 1)
                    if (champion != null) {
                        Text("اكتملت البطولة", color = WcColors.leaf, fontSize = 9.sp, maxLines = 1)
                    } else if (live) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Box(Modifier.size(6.dp).clip(CircleShape).background(WcColors.liveRed))
                            Text("مباشر الآن", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                        }
                    } else {
                        Text("تغطية حية بتوقيت الرياض", color = WcColors.leaf, fontSize = 9.sp, maxLines = 1)
                    }
                }
                // كتلة الفريقين تتمدّد لملء الوسط: الشعاران عند الطرفين والنتيجة في
                // المنتصف — يُزيل الفراغ الأخضر الكبير ويجعل البانر متوازنًا وممتلئًا.
                // مع البطل تحل بطاقة التتويج محل مربع المباراة كاملًا.
                if (champion != null) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                        modifier = Modifier.weight(1f).padding(horizontal = 4.dp),
                    ) {
                        ChampionCenter(champion)
                    }
                } else if (f != null) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.weight(1f).padding(horizontal = 4.dp),
                    ) {
                        StripLogo(f.home.logo)
                        Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) { StripCenter(f) }
                        StripLogo(f.away.logo)
                    }
                }
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, null, tint = Color.White.copy(alpha = 0.9f), modifier = Modifier.size(18.dp))
            }
        }
    }
    }
}

/**
 * بطاقة البطل — تحل محل مربع المباراة بعد حسم النهائي. سطر النتيجة بصيغة
 * «فاز على {الوصيف} W-L» الموحّدة (الفائز أولًا من الخادم فلا انقلاب في RTL).
 */
@Composable
private fun ChampionCenter(c: WcChampion) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(
            modifier = Modifier.size(40.dp).clip(CircleShape).background(Color.White)
                .border(1.5.dp, WcColors.gold.copy(alpha = 0.8f), CircleShape)
                .padding(4.dp),
            contentAlignment = Alignment.Center,
        ) {
            AsyncImage(model = c.team.logo, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxWidth())
        }
        Column {
            Text("🏆 بطل كأس العالم 2026", color = WcColors.gold, fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            Text(c.team.name, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.Black, maxLines = 1)
            val runnerUp = c.runnerUp
            val score = c.score
            if (runnerUp != null && score != null) {
                val pens = c.penalties?.let { " (ركلات الترجيح $it)" } ?: ""
                Text("فاز على ${runnerUp.name} $score$pens", color = WcColors.leaf, fontSize = 9.sp, maxLines = 1)
            }
        }
    }
}

@Composable
private fun StripLogo(url: String) {
    Box(modifier = Modifier.size(30.dp).clip(CircleShape).background(Color.White).padding(3.dp), contentAlignment = Alignment.Center) {
        AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun StripCenter(f: WcFixture) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        if (f.started) {
            // المضيف معروض يمينًا في RTL — الضيف أولًا داخل LTR
            LtrText("${f.goals.away ?: 0} - ${f.goals.home ?: 0}", Color.White, 18, FontWeight.Black)
            WcStatusPill(f)
        } else {
            Text(WcFormat.time(f), color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Black, maxLines = 1)
            val now = rememberSecondTicker()
            if (f.timestamp.toLong() * 1000L <= now) {
                // الموعد حان والمزود لم يرفع إشارة «حية» بعد — لا 00:00:00 مجمدة
                Text("حان موعد الانطلاق — التغطية الحية خلال لحظات", color = WcColors.emerald.copy(alpha = 0.85f), fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            } else {
                Text("تنطلق بعد ${WcFormat.countdown(f.timestamp, now)}", color = WcColors.emerald.copy(alpha = 0.85f), fontSize = 10.sp, maxLines = 1)
            }
        }
    }
}
