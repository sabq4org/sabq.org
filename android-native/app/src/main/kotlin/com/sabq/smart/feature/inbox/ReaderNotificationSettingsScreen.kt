package com.sabq.smart.feature.inbox

import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.Explore
import androidx.compose.material.icons.outlined.LocalFireDepartment
import androidx.compose.material.icons.outlined.Newspaper
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.NotificationsOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationManagerCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.sabq.smart.ui.components.ErrorStateView
import com.sabq.smart.ui.components.SabqDetailScaffold
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@HiltViewModel
class ReaderNotificationSettingsViewModel @Inject constructor(
    private val api: ReaderInboxApi,
) : ViewModel() {

    data class UiState(
        val prefs: ReaderNotificationPrefs = ReaderNotificationPrefs.Defaults,
        val loaded: Boolean = false,
        val loadError: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()
    private var saved: ReaderNotificationPrefs = ReaderNotificationPrefs.Defaults

    fun load() {
        viewModelScope.launch {
            runCatching { api.preferences() }
                .onSuccess { p ->
                    saved = p
                    _state.value = UiState(prefs = p, loaded = true)
                }
                .onFailure { _state.update { it.copy(loadError = !it.loaded) } }
        }
    }

    private var pending: ReaderNotificationPrefs? = null
    private var saving = false

    /**
     * حفظ فوري عند كل تغيير (كما iOS). الطلبات متسلسلة: طلب واحد في الطريق،
     * وأحدث حالة معلّقة تُرسل بعده، فلا يكتب طلب قديم فوق تغيير أحدث.
     * الفشل يعيد الشاشة إلى آخر حالة حفظها الخادم.
     */
    fun update(transform: (ReaderNotificationPrefs) -> ReaderNotificationPrefs) {
        val next = transform(_state.value.prefs)
        if (!_state.value.loaded || next == _state.value.prefs) return
        _state.update { it.copy(prefs = next) }
        pending = next
        if (!saving) drain()
    }

    private fun drain() {
        saving = true
        viewModelScope.launch {
            try {
                while (true) {
                    val body = pending ?: break
                    pending = null
                    runCatching { api.updatePreferences(body) }
                        .onSuccess { result ->
                            saved = result
                            if (pending == null && _state.value.prefs == body) _state.update { it.copy(prefs = result) }
                        }
                        .onFailure {
                            if (pending == null) _state.update { it.copy(prefs = saved) }
                        }
                }
            } finally {
                saving = false
            }
        }
    }
}

/**
 * إعدادات إشعارات القارئ — نظير iOS `ReaderNotificationSettingsView`: الخيارات
 * التي يقرؤها خادم الإرسال فعلًا (الملخص اليومي، أنواع التوصيات، ساعات
 * الهدوء). إذن الإشعارات على الجهاز يُدار من إعدادات النظام.
 */
@Composable
fun ReaderNotificationSettingsScreen(
    onBack: () -> Unit,
    viewModel: ReaderNotificationSettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val colors = SabqTheme.colors
    var systemEnabled by remember { mutableStateOf(NotificationManagerCompat.from(context).areNotificationsEnabled()) }
    LifecycleResumeEffect(Unit) {
        systemEnabled = NotificationManagerCompat.from(context).areNotificationsEnabled()
        onPauseOrDispose { }
    }
    LaunchedEffect(Unit) { viewModel.load() }

    SabqDetailScaffold(title = "إعدادات الإشعارات", onBack = onBack) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
            Group(
                title = "على هذا الجهاز",
                footer = if (systemEnabled) "العاجل والتنبيهات المهمة تصلك على شاشة القفل."
                else "الإشعارات متوقفة لتطبيق سبق، فلن يصلك العاجل على شاشة القفل.",
            ) {
                Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    InboxIcon(if (systemEnabled) Icons.Outlined.NotificationsActive else Icons.Outlined.NotificationsOff, colors.primaryEnd)
                    Text(
                        if (systemEnabled) "الإشعارات مفعّلة" else "الإشعارات متوقفة",
                        fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = colors.ink,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = {
                        val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        runCatching { context.startActivity(intent) }
                    }) { Text("الإعدادات", color = colors.primaryEnd, fontWeight = FontWeight.SemiBold) }
                }
            }

            when {
                state.loaded -> {
                    val p = state.prefs
                    Group("الملخص اليومي", "إشعار واحد مساءً في صندوق إشعاراتك بأهم ما نُشر في اهتماماتك.") {
                        ToggleRow("الملخص اليومي", null, Icons.Outlined.Newspaper, p.dailyDigest) { v -> viewModel.update { it.copy(dailyDigest = v) } }
                    }
                    Group("توصيات لك", "تصل إلى صندوق إشعاراتك، بحد أقصى ثلاث في اليوم.") {
                        ToggleRow("محتوى مخصص", "مقالات مشابهة لما قرأته سابقًا", Icons.Outlined.AutoAwesome, p.becauseYouLiked) { v -> viewModel.update { it.copy(becauseYouLiked = v) } }
                        HorizontalDivider(color = colors.outline.copy(alpha = 0.5f))
                        ToggleRow("الأكثر رواجًا", "المقالات الشائعة في مجالات اهتمامك", Icons.Outlined.LocalFireDepartment, p.trendingForYou) { v -> viewModel.update { it.copy(trendingForYou = v) } }
                        HorizontalDivider(color = colors.outline.copy(alpha = 0.5f))
                        ToggleRow("اكتشاف محتوى جديد", "مقالات من أقسام أخرى قد تثير اهتمامك", Icons.Outlined.Explore, p.similarToSaved) { v -> viewModel.update { it.copy(similarToSaved = v) } }
                    }
                    Group("أوقات الهدوء", "لا تصلك التوصيات بين هذين الوقتين.") {
                        TimeRow("من", p.quietHoursStart) { v -> viewModel.update { it.copy(quietHoursStart = v) } }
                        HorizontalDivider(color = colors.outline.copy(alpha = 0.5f))
                        TimeRow("إلى", p.quietHoursEnd) { v -> viewModel.update { it.copy(quietHoursEnd = v) } }
                    }
                }
                state.loadError -> ErrorStateView(message = "تعذر تحميل الإعدادات", onRetry = viewModel::load, modifier = Modifier.fillMaxWidth())
                else -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = colors.primaryEnd)
                }
            }
        }
    }
}

@Composable
private fun Group(title: String, footer: String, content: @Composable () -> Unit) {
    val colors = SabqTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = colors.ink)
        SurfaceCard { Column { content() } }
        Text(footer, fontSize = 12.sp, color = colors.tertiaryInk)
    }
}

@Composable
private fun ToggleRow(title: String, subtitle: String?, icon: ImageVector, checked: Boolean, onChange: (Boolean) -> Unit) {
    val colors = SabqTheme.colors
    Row(
        Modifier.fillMaxWidth().clickable { onChange(!checked) }.padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        InboxIcon(icon, colors.primaryEnd)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = colors.ink)
            subtitle?.let { Text(it, fontSize = 13.sp, color = colors.secondaryInk) }
        }
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TimeRow(label: String, value: String, onChange: (String) -> Unit) {
    val colors = SabqTheme.colors
    var open by remember { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth().clickable { open = true }.padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        InboxIcon(Icons.Outlined.Bedtime, colors.primaryEnd)
        Text(label, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = colors.ink, modifier = Modifier.weight(1f))
        Text(value, fontSize = 15.sp, color = colors.primaryEnd, fontWeight = FontWeight.SemiBold)
    }
    if (open) {
        val (h, m) = QuietHours.split(value)
        val picker = rememberTimePickerState(initialHour = h, initialMinute = m, is24Hour = true)
        AlertDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                TextButton(onClick = {
                    open = false
                    onChange(QuietHours.format(picker.hour, picker.minute))
                }) { Text("تم") }
            },
            dismissButton = { TextButton(onClick = { open = false }) { Text("إلغاء") } },
            text = { TimePicker(state = picker) },
        )
    }
}

/** "HH:mm" ⇄ ساعة ودقيقة. */
object QuietHours {
    fun split(raw: String): Pair<Int, Int> {
        val parts = raw.split(":").mapNotNull { it.trim().toIntOrNull() }
        val h = parts.getOrNull(0)?.takeIf { it in 0..23 } ?: 22
        val m = parts.getOrNull(1)?.takeIf { it in 0..59 } ?: 0
        return h to m
    }

    fun format(hour: Int, minute: Int): String = "%02d:%02d".format(java.util.Locale.ROOT, hour, minute)
}
