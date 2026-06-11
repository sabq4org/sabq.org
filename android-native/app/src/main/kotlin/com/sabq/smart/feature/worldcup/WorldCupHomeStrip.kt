package com.sabq.smart.feature.worldcup

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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

/** شريط المونديال أعلى الواجهة الرئيسية — يختفي كليًا عند غياب البيانات. */
@Composable
fun WorldCupHomeStrip(onClick: () -> Unit, viewModel: WorldCupStripViewModel = hiltViewModel()) {
    val overview by viewModel.overview.collectAsStateWithLifecycle()
    val f = overview?.matchOfTheDay?.fixture ?: return

    ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
        Row(
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
                .background(Brush.linearGradient(listOf(WcColors.stadiumTop, WcColors.stadiumBottom)))
                .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(20.dp))
                .clickable { onClick() }.padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            Column {
                Text("مونديال 2026", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Black, maxLines = 1)
                Text("تغطية حية بتوقيت الرياض", color = WcColors.emerald.copy(alpha = 0.8f), fontSize = 9.sp, maxLines = 1)
            }
            Spacer(Modifier.weight(1f))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StripLogo(f.home.logo)
                StripCenter(f)
                StripLogo(f.away.logo)
            }
            Spacer(Modifier.weight(1f))
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, null, tint = WcColors.emerald, modifier = Modifier.size(20.dp))
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
            LtrText("${f.goals.home ?: 0} - ${f.goals.away ?: 0}", Color.White, 18, FontWeight.Black)
            WcStatusPill(f)
        } else {
            Text(WcFormat.time(f), color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Black, maxLines = 1)
            val now = rememberSecondTicker()
            Text("تنطلق بعد ${WcFormat.countdown(f.timestamp, now)}", color = WcColors.emerald.copy(alpha = 0.85f), fontSize = 10.sp, maxLines = 1)
        }
    }
}
