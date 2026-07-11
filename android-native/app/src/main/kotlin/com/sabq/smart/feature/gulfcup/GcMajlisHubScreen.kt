package com.sabq.smart.feature.gulfcup

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.core.app.NotificationManagerCompat
import coil.compose.AsyncImage
import com.sabq.smart.ui.theme.IbmPlexSansArabic

@Composable
internal fun GcMajlisHubScreen(
    state: GcPredictionsViewModel.UiState,
    viewModel: GcPredictionsViewModel,
    onRequireLogin: () -> Unit,
    colors: GcMajlisPalette,
) {
    val context = LocalContext.current
    var showCreate by remember { mutableStateOf(false) }
    var showJoin by remember { mutableStateOf(false) }
    var permissionDenied by remember { mutableStateOf(false) }
    val systemPermissionGranted = NotificationManagerCompat.from(context).areNotificationsEnabled() &&
        (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        permissionDenied = !granted
        viewModel.setPreference(granted)
    }

    fun toggleNotifications(enabled: Boolean) {
        permissionDenied = false
        if (!enabled) {
            viewModel.setPreference(false)
        } else if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            permissionDenied = true
            viewModel.setPreference(false)
        } else {
            viewModel.setPreference(true)
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { GcMajlisHero(colors) }
        if (state.user == null) {
            item {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(colors.card)
                        .border(1.dp, colors.line, RoundedCornerShape(18.dp)).padding(18.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(Icons.Filled.PersonAdd, null, tint = colors.sky, modifier = Modifier.size(32.dp))
                    Text("مجلسك ينتظرك", color = colors.ink, fontSize = 18.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic)
                    Text("سجّل الدخول بعضوية سبق لتنشئ مجلسًا أو تنضم إلى دعوة وصلتك.", color = colors.inkDim, fontSize = 12.sp, textAlign = TextAlign.Center, fontFamily = IbmPlexSansArabic)
                    GcActionButton("تسجيل الدخول", colors.skyDeep, onRequireLogin)
                }
            }
        } else {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    GcQuickAction("أنشئ مجلسك", "ابدأ المنافسة", Icons.Filled.Add, colors.emerald, colors, Modifier.weight(1f)) { showCreate = true }
                    GcQuickAction("انضم إلى مجلس", "أدخل رمز الدعوة", Icons.Filled.PersonAdd, colors.skyDeep, colors, Modifier.weight(1f)) { showJoin = true }
                }
            }
            item {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(colors.card)
                        .border(1.dp, colors.line, RoundedCornerShape(18.dp)).padding(13.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(11.dp),
                ) {
                    Icon(Icons.Filled.Notifications, null, tint = colors.sky, modifier = Modifier.size(26.dp))
                    Column(Modifier.weight(1f)) {
                        Text("إشعارات المجلس", color = colors.ink, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
                        Text("قبل الإقفال، وبعد التسوية، وعند انضمام عضو فقط", color = colors.inkDim, fontSize = 10.sp, fontFamily = IbmPlexSansArabic)
                    }
                    Switch(
                        checked = state.notificationEnabled && systemPermissionGranted,
                        onCheckedChange = ::toggleNotifications,
                        enabled = !state.preferenceLoading,
                        modifier = Modifier.semantics { contentDescription = "إشعارات المجلس" },
                    )
                }
            }
            if (permissionDenied) {
                item { Text("الإشعارات غير مسموحة من إعدادات الجهاز", color = colors.crimson, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic) }
            }
            state.notice?.let { notice ->
                item { Text("✓ $notice", color = colors.emeraldDeep, fontSize = 12.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic) }
            }
            state.majalisError?.let { error ->
                item { GcInlineError(error, colors) { viewModel.loadMajalis(force = true) } }
            }
            when {
                state.majalisLoading && !state.majalisLoaded -> item { GcLoadingCard("يتم تحميل مجالسك", colors) }
                state.majalisLoaded && state.majalis.isEmpty() -> item { GcMajlisEmpty(colors) }
                else -> {
                    item {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("مجالسي", color = colors.ink, fontSize = 18.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic, modifier = Modifier.weight(1f))
                            GcPill("${state.majalis.size}", colors.skyDeep, colors)
                        }
                    }
                    items(state.majalis, key = { it.id }) { majlis ->
                        GcMajlisRow(
                            majlis,
                            colors,
                            onOpen = { viewModel.openMajlis(majlis) },
                            onShare = { GcMajlisShare.shareInvite(context, majlis) },
                        )
                    }
                }
            }
        }
    }

    if (showCreate) {
        GcCreateMajlisDialog(
            loading = state.mutationInFlight,
            error = state.mutationError,
            colors = colors,
            onDismiss = { showCreate = false; viewModel.clearMutationError() },
            onSubmit = { viewModel.createMajlis(it) { showCreate = false } },
        )
    }
    if (showJoin) {
        GcJoinMajlisDialog(
            loading = state.mutationInFlight,
            error = state.mutationError,
            colors = colors,
            onDismiss = { showJoin = false; viewModel.clearMutationError() },
            onSubmit = { viewModel.joinMajlis(it) { showJoin = false } },
        )
    }
    (state.pendingTarget as? GcMajlisLocalStore.Target.Invite)?.let { target ->
        GcInviteConsentDialog(
            target = target,
            state = state,
            colors = colors,
            onLogin = onRequireLogin,
            onCancel = viewModel::dismissInvite,
            onJoin = { viewModel.joinMajlis(target.code) },
        )
    }
}

@Composable private fun GcMajlisHero(colors: GcMajlisPalette) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp))
            .background(Brush.linearGradient(listOf(colors.heroTop, colors.heroMid, colors.heroDeep)))
            .border(1.dp, Color.White.copy(.10f), RoundedCornerShape(24.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text("المجالس", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic)
                Text("حوّل التوقعات إلى مسامرة يومية مع ناسك طوال البطولة", color = Color(0xFFB3E0E6), fontSize = 12.sp, fontFamily = IbmPlexSansArabic)
            }
            Icon(Icons.Filled.Group, null, tint = colors.skyLite, modifier = Modifier.size(42.dp).clip(CircleShape).background(Color.White.copy(.08f)).padding(9.dp))
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            GcHeroLabel("خاص بناسك", Icons.Filled.Lock)
            GcHeroLabel("تُكشف بعد الإقفال", Icons.Filled.Check)
            GcHeroLabel("حتى 50 عضوًا", Icons.Filled.Group)
        }
    }
}

@Composable private fun GcHeroLabel(text: String, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Icon(icon, null, tint = Color.White.copy(.72f), modifier = Modifier.size(11.dp))
        Text(text, color = Color.White.copy(.72f), fontSize = 9.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
    }
}

@Composable private fun GcQuickAction(
    title: String,
    subtitle: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
    colors: GcMajlisPalette,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    Row(
        modifier.clip(RoundedCornerShape(16.dp)).background(tint).clickable(onClick = onClick).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(icon, null, tint = Color.White, modifier = Modifier.size(29.dp).clip(CircleShape).background(Color.White.copy(.14f)).padding(7.dp))
        Column {
            Text(title, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic, maxLines = 1)
            Text(subtitle, color = Color.White.copy(.72f), fontSize = 9.sp, fontFamily = IbmPlexSansArabic, maxLines = 1)
        }
    }
}

@Composable private fun GcMajlisRow(majlis: GcMajlisSummary, colors: GcMajlisPalette, onOpen: () -> Unit, onShare: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(colors.card)
            .border(1.dp, colors.line, RoundedCornerShape(18.dp)).padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(Modifier.weight(1f).clickable(onClick = onOpen).padding(5.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(if (majlis.isOwner) Icons.Filled.EmojiEvents else Icons.Filled.Group, null, tint = if (majlis.isOwner) colors.skyDeep else colors.emerald, modifier = Modifier.size(38.dp).clip(CircleShape).background(colors.sky.copy(.11f)).padding(9.dp))
            Column(Modifier.weight(1f)) {
                Text(majlis.name, color = colors.ink, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic, maxLines = 1)
                Text("${majlis.membersCount} عضو${if (majlis.isOwner) " · صاحب المجلس" else ""}", color = colors.inkDim, fontSize = 10.sp, fontFamily = IbmPlexSansArabic)
            }
        }
        IconButton(onClick = onShare, modifier = Modifier.semantics { contentDescription = "ادعُ مجلسك" }) {
            Icon(Icons.Filled.Share, null, tint = colors.skyDeep, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable private fun GcMajlisEmpty(colors: GcMajlisPalette) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(colors.card).border(1.dp, colors.line, RoundedCornerShape(18.dp)).padding(vertical = 28.dp, horizontal = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icons.Filled.Group, null, tint = colors.emerald, modifier = Modifier.size(32.dp))
        Text("لا مجالس بعد", color = colors.ink, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
        Text("أنشئ مجلسك الأول أو انضم إلى رمز وصلك من صديق.", color = colors.inkDim, fontSize = 11.sp, fontFamily = IbmPlexSansArabic, textAlign = TextAlign.Center)
    }
}

@Composable private fun GcLoadingCard(title: String, colors: GcMajlisPalette) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(colors.card).padding(20.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        CircularProgressIndicator(color = colors.sky, strokeWidth = 2.dp, modifier = Modifier.size(22.dp)); Spacer(Modifier.width(9.dp))
        Text(title, color = colors.inkDim, fontFamily = IbmPlexSansArabic)
    }
}

@Composable private fun GcInlineError(message: String, colors: GcMajlisPalette, retry: () -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(colors.crimson.copy(.08f)).padding(13.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text(message, color = colors.crimson, fontSize = 12.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
        TextButton(onClick = retry) { Text("إعادة المحاولة", color = colors.crimson, fontFamily = IbmPlexSansArabic) }
    }
}

@Composable private fun GcCreateMajlisDialog(loading: Boolean, error: String?, colors: GcMajlisPalette, onDismiss: () -> Unit, onSubmit: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("أنشئ مجلسك", fontFamily = IbmPlexSansArabic, fontWeight = FontWeight.Black) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("اختر اسمًا يعرفه أهلك أو زملاؤك؛ ستحصل فورًا على رمز ورابط دعوة.", color = colors.inkDim, fontSize = 12.sp, fontFamily = IbmPlexSansArabic)
                OutlinedTextField(name, { name = it.take(60) }, label = { Text("اسم المجلس", fontFamily = IbmPlexSansArabic) }, placeholder = { Text("مثل: ديوانية الجمعة", fontFamily = IbmPlexSansArabic) }, singleLine = true)
                error?.let { Text(it, color = colors.crimson, fontSize = 11.sp, fontFamily = IbmPlexSansArabic) }
            }
        },
        confirmButton = { Button(onClick = { onSubmit(name) }, enabled = !loading && name.trim().length in 2..60) { if (loading) CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp) else Text("إنشاء المجلس", fontFamily = IbmPlexSansArabic) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("إلغاء", fontFamily = IbmPlexSansArabic) } },
    )
}

@Composable private fun GcJoinMajlisDialog(loading: Boolean, error: String?, colors: GcMajlisPalette, onDismiss: () -> Unit, onSubmit: (String) -> Unit) {
    var code by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("انضم إلى مجلس", fontFamily = IbmPlexSansArabic, fontWeight = FontWeight.Black) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("أدخل الرمز الذي شاركه معك صاحب المجلس.", color = colors.inkDim, fontSize = 12.sp, fontFamily = IbmPlexSansArabic)
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    OutlinedTextField(code, { value -> code = sanitizeGcMajlisInviteInput(value) }, label = { Text("رمز الدعوة") }, textStyle = androidx.compose.ui.text.TextStyle(textAlign = TextAlign.Center, fontSize = 20.sp, fontWeight = FontWeight.Black), singleLine = true)
                }
                error?.let { Text(it, color = colors.crimson, fontSize = 11.sp, fontFamily = IbmPlexSansArabic) }
            }
        },
        confirmButton = { Button(onClick = { onSubmit(code) }, enabled = !loading && code.length in 4..8) { if (loading) CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp) else Text("الانضمام", fontFamily = IbmPlexSansArabic) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("إلغاء", fontFamily = IbmPlexSansArabic) } },
    )
}

@Composable private fun GcInviteConsentDialog(
    target: GcMajlisLocalStore.Target.Invite,
    state: GcPredictionsViewModel.UiState,
    colors: GcMajlisPalette,
    onLogin: () -> Unit,
    onCancel: () -> Unit,
    onJoin: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = {},
        icon = { Icon(Icons.Filled.PersonAdd, null, tint = colors.sky, modifier = Modifier.size(32.dp)) },
        title = { Text(state.invitePreview?.name ?: "وصلتك دعوة إلى مجلس", fontFamily = IbmPlexSansArabic, fontWeight = FontWeight.Black, textAlign = TextAlign.Center) },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Text(target.code, color = colors.skyDeep, fontSize = 20.sp, fontWeight = FontWeight.Black, letterSpacing = 2.sp)
                }
                if (state.inviteLoading) CircularProgressIndicator(color = colors.sky, modifier = Modifier.size(24.dp))
                state.invitePreview?.let { preview ->
                    Text("${preview.membersCount} من ${preview.maxMembers} عضو", color = colors.inkDim, fontSize = 11.sp, fontFamily = IbmPlexSansArabic)
                    if (preview.full) {
                        // Keep the action enabled: an existing member may use the
                        // same link idempotently to return to their council.
                        Text("المجلس مكتمل للأعضاء الجدد؛ إن كنت عضوًا فسيُفتح لك مباشرة.", color = colors.crimson, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic, textAlign = TextAlign.Center)
                    }
                }
                Text(
                    if (state.user == null) "الدعوة محفوظة. سجّل الدخول أولًا ثم وافق على الانضمام مرة واحدة."
                    else "بانضمامك سيظهر اسمك وترتيبك وتوقعاتك لأعضاء المجلس بعد إقفال كل مباراة.",
                    color = colors.inkDim,
                    fontSize = 12.sp,
                    fontFamily = IbmPlexSansArabic,
                    textAlign = TextAlign.Center,
                )
                state.mutationError?.let { Text(it, color = colors.crimson, fontSize = 11.sp, fontFamily = IbmPlexSansArabic) }
            }
        },
        confirmButton = {
            Button(onClick = if (state.user == null) onLogin else onJoin, enabled = !state.mutationInFlight && !state.inviteLoading) {
                if (state.mutationInFlight) CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                else Text(if (state.user == null) "تسجيل الدخول" else "أوافق — انضم الآن", fontFamily = IbmPlexSansArabic)
            }
        },
        dismissButton = { TextButton(onClick = onCancel) { Text("إغلاق", fontFamily = IbmPlexSansArabic) } },
    )
}

@Composable
internal fun GcMajlisOnboardingDialog(
    onFinish: (Boolean) -> Unit,
    onPredictNow: (Boolean) -> Unit,
    colors: GcMajlisPalette,
) {
    val context = LocalContext.current
    val pages = listOf(
        Triple("هنا ترتيبك بين ناسك", "بدل أن تنافس آلاف الغرباء، سترى مركزك مباشرة بين أهلك وأصدقائك.", Icons.Filled.Group),
        Triple("توقّعاتهم تبقى سرًا", "قبل الإقفال يظهر فقط من توقّع. وبعد صافرة البداية تنكشف النتائج ويبدأ النقاش.", Icons.Filled.Lock),
        Triple("كبّر ديوانيتك", "ادعُ حتى 50 عضوًا ببطاقة جاهزة ورابط يفتح المجلس مباشرة.", Icons.AutoMirrored.Filled.Send),
    )
    var page by remember { mutableIntStateOf(0) }
    var alerts by remember { mutableStateOf(true) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        // Denial is an explicit effective opt-out and is persisted as false by
        // finishOnboarding; never leave the server preference enabled by itself.
        onPredictNow(granted)
    }

    fun finishPredictionOnboarding() {
        if (!alerts) {
            onPredictNow(false)
        } else if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            onPredictNow(false)
        } else {
            onPredictNow(true)
        }
    }

    Dialog(onDismissRequest = {}, properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false)) {
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(colors.appBg, colors.appBgMid)))) {
            Column(Modifier.fillMaxSize().padding(20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = { onFinish(false) }) { Text("تخطّي", color = colors.inkDim, fontFamily = IbmPlexSansArabic, fontWeight = FontWeight.Bold) }
                    Spacer(Modifier.weight(1f))
                    Text("خليجي 27", color = colors.skyDeep, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic)
                }
                Column(Modifier.weight(1f).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Box(Modifier.size(150.dp).clip(CircleShape).background(colors.sky.copy(.12f)), contentAlignment = Alignment.Center) {
                        Icon(pages[page].third, null, tint = colors.skyDeep, modifier = Modifier.size(55.dp))
                    }
                    Spacer(Modifier.height(22.dp))
                    Text(pages[page].first, color = colors.ink, fontSize = 25.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(10.dp))
                    Text(pages[page].second, color = colors.inkDim, fontSize = 15.sp, fontFamily = IbmPlexSansArabic, textAlign = TextAlign.Center, lineHeight = 24.sp)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                    pages.indices.forEach { i -> Box(Modifier.padding(3.dp).width(if (i == page) 24.dp else 7.dp).height(7.dp).clip(CircleShape).background(if (i == page) colors.sky else colors.line)) }
                }
                if (page == pages.lastIndex) {
                    Row(Modifier.fillMaxWidth().padding(top = 14.dp).clip(RoundedCornerShape(14.dp)).background(colors.card).border(1.dp, colors.line, RoundedCornerShape(14.dp)).padding(13.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("نبّهني بلحظات المجلس المهمة", color = colors.ink, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
                            Text("ثلاثة أنواع فقط، ويمكن إيقافها في أي وقت.", color = colors.inkDim, fontSize = 10.sp, fontFamily = IbmPlexSansArabic)
                        }
                        Switch(checked = alerts, onCheckedChange = { alerts = it })
                    }
                }
                Spacer(Modifier.height(14.dp))
                GcActionButton(
                    if (page == pages.lastIndex) "توقّع مباراة اليوم الآن" else "التالي",
                    colors.sky,
                    { if (page < pages.lastIndex) page++ else finishPredictionOnboarding() },
                )
            }
        }
    }
}
