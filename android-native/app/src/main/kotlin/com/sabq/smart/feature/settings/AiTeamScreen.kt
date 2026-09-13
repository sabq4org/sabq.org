package com.sabq.smart.feature.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil.compose.SubcomposeAsyncImage
import com.sabq.smart.data.api.ApiAiTeam
import com.sabq.smart.data.api.ApiAiTeamMember
import com.sabq.smart.data.api.SabqApi
import com.sabq.smart.data.readerErrorMessage
import com.sabq.smart.ui.components.EmptyStateView
import com.sabq.smart.ui.components.SkeletonBox
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** ألوان الشريط الكحلي كما في الويب (`TeamBand` في SabqAI.tsx). */
private object AiTeamPalette {
    val band = Color(0xFF0E2233)
    val card = Color(0xFF12293B)
    val border = Color(0xFF1E3448)
    val accent = Color(0xFF4CBCFD)
    val muted = Color(0xFF8CA3B5)
    val avatar = Color(0xFF0E76B8)
    val role = Color(0xFFDCF1FE).copy(alpha = 0.8f)
}

@HiltViewModel
class AiTeamViewModel @Inject constructor(private val api: SabqApi) : ViewModel() {
    sealed interface State {
        data object Loading : State
        data class Loaded(val team: ApiAiTeam) : State
        data class Error(val message: String) : State
    }
    private val _state = MutableStateFlow<State>(State.Loading)
    val state: StateFlow<State> = _state.asStateFlow()

    fun load() {
        _state.value = State.Loading
        viewModelScope.launch {
            runCatching { api.getAiTeam() }
                .onSuccess { _state.value = State.Loaded(it) }
                .onFailure { _state.value = State.Error(readerErrorMessage(it, "تعذر جلب بيانات الفريق")) }
        }
    }
}

/** «فريق سبق الذكي» — نقل TeamBand من صفحة عقل سبق (e1dc9c7) ونظير iOS `AITeamView`. */
@Composable
fun AiTeamScreen(onBack: () -> Unit, viewModel: AiTeamViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.load() }
    Box(Modifier.fillMaxSize().background(SabqTheme.colors.background)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            Spacer(Modifier.statusBarsPadding().height(56.dp))
            when (val s = state) {
                is AiTeamViewModel.State.Loaded -> if (s.team.isRenderable) Band(s.team) else NotAvailable(null, viewModel::load)
                AiTeamViewModel.State.Loading -> Box(Modifier.padding(16.dp)) { SkeletonBox(height = 320.dp, radius = 20.dp) }
                is AiTeamViewModel.State.Error -> NotAvailable(s.message, viewModel::load)
            }
            Spacer(Modifier.height(120.dp))
        }
        Row(
            modifier = Modifier.fillMaxWidth().background(SabqTheme.colors.background.copy(alpha = 0.94f)).statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(40.dp).clip(CircleShape).background(SabqTheme.colors.surface.copy(alpha = 0.92f)).clickable { onBack() }, contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "رجوع", tint = SabqTheme.colors.ink, modifier = Modifier.size(20.dp))
            }
            Text("فريق سبق الذكي", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(40.dp))
        }
    }
}

@Composable
private fun NotAvailable(message: String?, onRetry: () -> Unit) {
    EmptyStateView(
        icon = Icons.Filled.Groups,
        tint = SabqTheme.colors.primaryEnd,
        title = "الفريق غير متاح حاليًا",
        subtitle = message ?: "لم نتمكن من جلب بيانات الفريق الآن. حاول مرة أخرى بعد قليل.",
        actionTitle = "إعادة المحاولة",
        onAction = onRetry,
        modifier = Modifier.fillMaxWidth().padding(16.dp),
    )
}

@Composable
private fun Band(team: ApiAiTeam) {
    Column(
        Modifier.fillMaxWidth().background(AiTeamPalette.band).padding(horizontal = 16.dp, vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("داخل عقل سبق", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = AiTeamPalette.accent)
            Text("فريق سبق الذكي", fontSize = 24.sp, fontWeight = FontWeight.Black, color = Color.White)
            Text(
                "أول غرفة أخبار سعودية تعرّفك بزملائها الرقميين بأسمائهم وأدوارهم — يعملون على مدار الساعة، ولا يُنشر لهم حرف قبل اعتماد محرر بشري.",
                fontSize = 13.sp, color = AiTeamPalette.muted, textAlign = TextAlign.Center, lineHeight = 20.sp,
            )
        }
        val members = team.team
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            var i = 0
            while (i < members.size) {
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Max), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.weight(1f).fillMaxSize()) { MemberCard(members[i]) }
                    if (i + 1 < members.size) Box(Modifier.weight(1f).fillMaxSize()) { MemberCard(members[i + 1]) } else Spacer(Modifier.weight(1f))
                }
                i += 2
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
            val ops = team.counters?.monthOps ?: 0
            if (ops > 0) Counter(value = ops.toString(), label = "عملًا هذا الشهر", modifier = Modifier.weight(1f))
            Counter(value = (team.counters?.teamCount ?: members.size).toString(), label = "زميلًا رقميًا", modifier = Modifier.weight(1f))
            Counter(value = "100%", label = "تحت إشراف بشري", modifier = Modifier.weight(1f))
        }
        Text(
            "🛡 الإنسان يعتمد كل شيء — سياسة سبق للذكاء الاصطناعي",
            fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Color.White,
            modifier = Modifier.clip(CircleShape).background(Color.White.copy(alpha = 0.08f)).border(1.dp, AiTeamPalette.border, CircleShape).padding(horizontal = 14.dp, vertical = 8.dp),
        )
    }
}

@Composable
private fun MemberCard(m: ApiAiTeamMember) {
    val shape = RoundedCornerShape(12.dp)
    Row(
        Modifier.fillMaxSize().clip(shape).background(AiTeamPalette.card).border(1.dp, AiTeamPalette.border, shape).padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        val initial: @Composable () -> Unit = {
            Box(Modifier.size(44.dp).clip(CircleShape).background(AiTeamPalette.avatar), contentAlignment = Alignment.Center) {
                Text(m.nameAr.take(1), fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.White)
            }
        }
        val url = m.absoluteAvatarUrl
        if (url != null) {
            SubcomposeAsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(44.dp).clip(CircleShape), loading = { initial() }, error = { initial() })
        } else initial()
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(m.nameAr, fontSize = 14.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(m.titleAr, fontSize = 11.sp, color = AiTeamPalette.role, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(m.departmentAr, fontSize = 10.sp, color = AiTeamPalette.accent, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun Counter(value: String, label: String, modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(value, fontSize = 22.sp, fontWeight = FontWeight.Black, color = AiTeamPalette.accent)
        Text(label, fontSize = 11.sp, color = AiTeamPalette.muted, textAlign = TextAlign.Center)
    }
}
