package com.sabq.vara.ui

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CropPortrait
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Help
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.SettingsBrightness
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.SportsScore
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.navigation.NavHostController
import coil.compose.AsyncImage
import com.sabq.vara.core.Accent
import com.sabq.vara.core.ApiFailure
import com.sabq.vara.core.FavoriteTeam
import com.sabq.vara.core.Fixture
import com.sabq.vara.core.Follow
import com.sabq.vara.core.Member
import com.sabq.vara.core.Team
import com.sabq.vara.core.ThemeMode
import com.sabq.vara.core.VaraFormat
import com.sabq.vara.core.VaraViewModel
import com.sabq.vara.core.accents
import com.sabq.vara.core.findArray
import com.sabq.vara.core.int
import com.sabq.vara.core.obj
import com.sabq.vara.core.parseFixture
import com.sabq.vara.core.parseTeam
import com.sabq.vara.core.string
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import java.io.File
import java.io.FileOutputStream
import java.time.Instant
import java.util.Locale
import kotlin.math.roundToInt

// ═══════════════════════════════ حسابي (نظير AccountView) ═══════════════════════════════

@Composable
fun AccountScreen(nav: NavHostController, vm: VaraViewModel) {
    val c = LocalVaraColors.current
    val account by vm.account.collectAsState()
    val favorite by vm.favoriteTeam.collectAsState()
    val followedFx by vm.followedFixtures.collectAsState()
    val context = LocalContext.current
    val listState = rememberLazyListState()
    val followedTeams = account.follows.filter { it.kind == "team" }
    val myMatchesCount = remember(followedFx) { vm.visibleFollowedFixtures().size }
    val version = remember { acAppVersion(context) }
    var showSignOutConfirm by remember { mutableStateOf(false) }

    // بعد تسجيل الخروج: نقفز لأعلى الصفحة فتظهر بطاقة الدخول فورًا (نظير scrollTo في iOS).
    LaunchedEffect(account.loggedIn) { if (!account.loggedIn) listState.animateScrollToItem(0) }

    if (showSignOutConfirm) AlertDialog(
        onDismissRequest = { showSignOutConfirm = false },
        containerColor = c.surface,
        titleContentColor = c.text,
        textContentColor = c.textDim,
        title = { Text("تسجيل الخروج", fontWeight = FontWeight.Bold) },
        text = { Text("سيتم إنهاء جلستك على هذا الجهاز. يبقى فريقك المفضّل ومبارياتك المتابَعة كما هي.") },
        confirmButton = { TextButton({ showSignOutConfirm = false; vm.logout() }) { Text("تسجيل الخروج", color = c.live, fontWeight = FontWeight.Bold) } },
        dismissButton = { TextButton({ showSignOutConfirm = false }) { Text("إلغاء", color = c.textDim) } },
    )

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        LazyColumn(
            Modifier.fillMaxSize(),
            state = listState,
            contentPadding = PaddingValues(top = 14.dp, bottom = 26.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                if (account.loggedIn) AcProfileCard(
                    member = account.member,
                    loyaltyLine = acLoyaltyLine(favorite, followedTeams.size),
                    onEdit = { nav.navigate(Routes.EditProfile) },
                ) else AcSignInCard { nav.navigate(Routes.Login) }
            }
            item { AcTeamsSection(nav, vm, favorite, followedTeams, account.loggedIn) }
            item { AcPredictionsSection { nav.navigate(Routes.Predictions) } }
            item { AcLanguageSection(vm, account.language) }
            item { AcAppearanceSection(vm, account.theme, account.accentId) }
            item { AcNotificationsSection(account.loggedIn, followedTeams.size, myMatchesCount) { nav.navigate(Routes.Alerts) } }
            item { AcAboutSection(nav, context, version) }
            if (account.loggedIn) {
                item { AcDangerSection { nav.navigate(Routes.DeleteAccount) } }
                item { AcSignOutButton { showSignOutConfirm = true } }
            }
            item { AcFooter() }
        }
    }
}

/// «مشجّع X» / «تتابع N فريقًا» / «أهلًا بك في VARA» — سطر سلوكي بدل نقاط الولاء (غير موجودة في iOS).
private fun acLoyaltyLine(favorite: FavoriteTeam?, teamsCount: Int): String = when {
    favorite != null -> "مشجّع ${favorite.name}"
    teamsCount > 0 -> "تتابع $teamsCount فريقًا"
    else -> "أهلًا بك في VARA"
}

private fun acAppVersion(context: Context): String = runCatching {
    val info = context.packageManager.getPackageInfo(context.packageName, 0)
    val code = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
    "${info.versionName} ($code)"
}.getOrDefault("1.0")

@Composable
private fun AcProfileCard(member: Member?, loyaltyLine: String, onEdit: () -> Unit) {
    val c = LocalVaraColors.current
    VaraCard(Modifier.padding(horizontal = 16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(60.dp).clip(CircleShape).background(c.accent.copy(.14f)).border(2.dp, c.accent.copy(.45f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                if (!member?.avatar.isNullOrBlank()) AsyncImage(member?.avatar, member?.name, Modifier.fillMaxSize().clip(CircleShape))
                else Icon(Icons.Default.Person, null, tint = c.accent, modifier = Modifier.size(34.dp))
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(member?.name ?: "عضو VARA", color = c.text, fontSize = 18.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                // لا نعرض البريد الاصطناعي @phone.sabq.org — نفضّل الجوال أو البريد الحقيقي.
                val contact = member?.let { m -> m.displayEmail.ifBlank { m.phone } }.orEmpty()
                if (contact.isNotBlank()) Text(contact, color = c.textDim, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(loyaltyLine, color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.height(12.dp))
        // شارة العضوية «عضو سبق» لمسة ذهبية بلا كبسولة + تعديل الملف داخل التطبيق.
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.VerifiedUser, null, tint = c.gold, modifier = Modifier.size(15.dp))
            Spacer(Modifier.width(6.dp))
            Text("عضو سبق", color = c.gold, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            Row(Modifier.clip(VaraChipShape).clickable(onClick = onEdit).padding(horizontal = 4.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("تعديل الملف الشخصي", color = c.accent, fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                Icon(Icons.Default.ChevronLeft, null, tint = c.accent, modifier = Modifier.size(14.dp))
            }
        }
        // حسابات الجوال تُنشأ بلا اسم — نحثّ على إكماله داخل التطبيق.
        if (member?.needsDisplayName == true) {
            Spacer(Modifier.height(10.dp))
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.gold.copy(.10f)).clickable(onClick = onEdit).padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Default.WarningAmber, null, tint = c.gold, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text("أكمل اسمك", color = c.text, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Text("حسابك بلا اسم — أضفه ليظهر في عضويتك", color = c.textDim, fontSize = 11.sp, maxLines = 2)
                }
                Icon(Icons.Default.ChevronLeft, null, tint = c.textFaint, modifier = Modifier.size(14.dp))
            }
        }
    }
}

@Composable
private fun AcSignInCard(login: () -> Unit) {
    val c = LocalVaraColors.current
    VaraCard(Modifier.padding(horizontal = 16.dp)) {
        Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("مرحبًا بك في", color = c.text, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                VaraWordmark(20)
            }
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Text("أحد منتجات", color = c.textFaint, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                Box(Modifier.width(1.dp).height(11.dp).background(c.outline))
                Text("صحيفة سبق", color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(10.dp))
            Text(
                "سجّل دخولك لتحفظ فريقك، وترسل توقّعاتك، وتصلك تنبيهات المباريات على كل أجهزتك.",
                color = c.textDim, fontSize = 13.sp, textAlign = TextAlign.Center, lineHeight = 21.sp,
            )
            Spacer(Modifier.height(14.dp))
            Button(
                login, Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = c.accent),
            ) { Text("تسجيل الدخول", modifier = Modifier.padding(vertical = 6.dp), fontWeight = FontWeight.Bold) }
        }
    }
}

// ─── فِرقي (المفضّل + المتابَعة) ───

@Composable
private fun AcTeamsSection(nav: NavHostController, vm: VaraViewModel, favorite: FavoriteTeam?, followedTeams: List<Follow>, loggedIn: Boolean) {
    val c = LocalVaraColors.current
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        AcSectionTitle("فِرقي")
        Column(Modifier.fillMaxWidth().clip(VaraCardShape).background(c.surface)) {
            // الفريق المفضّل — محلّي بلا دخول: يُضبط من نجمة صفحة النادي ويُمسح هنا.
            Row(
                Modifier.fillMaxWidth().clickable(enabled = favorite != null) { favorite?.let { nav.navigate("team/${it.id}") } }
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AcIconTile(Icons.Default.Star, c.accent)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("الفريق المفضّل", color = c.text, fontSize = 14.5.sp, fontWeight = FontWeight.Bold)
                    Text(
                        favorite?.name ?: "اختره من نجمة صفحة أي نادٍ",
                        color = if (favorite == null) c.textFaint else c.accent,
                        fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1,
                    )
                }
                if (favorite != null) {
                    RemoteLogo(favorite.logo, favorite.name, 30)
                    IconButton({ vm.setFavoriteTeam(null) }) {
                        Icon(Icons.Default.Close, "إزالة الفريق المفضّل", tint = c.textFaint, modifier = Modifier.size(18.dp))
                    }
                }
            }
            if (loggedIn && followedTeams.isNotEmpty()) {
                Box(Modifier.padding(start = 56.dp)) { VaraDivider() }
                Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        AcIconTile(Icons.Default.Favorite, c.accent)
                        Spacer(Modifier.width(12.dp))
                        Text("الفِرق المتابَعة", color = c.text, fontSize = 14.5.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                        Text("${followedTeams.size}", color = c.textFaint, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        followedTeams.forEach { f ->
                            Column(
                                Modifier.width(60.dp).clickable { f.refId.toIntOrNull()?.let { nav.navigate("team/$it") } },
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                RemoteLogo(f.logo, f.name, 46)
                                Text(f.name, color = c.text, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
            }
        }
        if (!loggedIn) AcHint("الفريق المفضّل يعمل بلا تسجيل دخول ويتصدّر صفحتك الرئيسية. سجّل الدخول لمتابعة عدّة فِرق وتلقّي تنبيهاتها.")
    }
}

// ─── التوقّعات (بطاقة بارزة) ───

@Composable
private fun AcPredictionsSection(open: () -> Unit) {
    val c = LocalVaraColors.current
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        AcSectionTitle("التوقّعات")
        Row(
            Modifier.fillMaxWidth().clip(VaraCardShape).background(c.surface).clickable(onClick = open).padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(48.dp).clip(CircleShape).background(c.gold.copy(.14f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Default.EmojiEvents, null, tint = c.gold, modifier = Modifier.size(24.dp))
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text("توقّعات VARA", color = c.text, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Text("توقّع نتائج مباريات البطولات وتنافس على النقاط والجوائز", color = c.textDim, fontSize = 11.5.sp, maxLines = 2, lineHeight = 17.sp)
            }
            Icon(Icons.Default.ChevronLeft, null, tint = c.textFaint, modifier = Modifier.size(18.dp))
        }
    }
}

// ─── اللغة (قسم مستقل ببلاطتي علم) ───

@Composable
private fun AcLanguageSection(vm: VaraViewModel, language: String) {
    val c = LocalVaraColors.current
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        AcSectionTitle("اللغة")
        // بطاقة حاضنة + فراغ داخلي — نفس هوامش بطاقات فِرقي/التوقّعات، بلا لصق على الحواف.
        Row(
            Modifier
                .fillMaxWidth()
                .clip(VaraCardShape)
                .background(c.surface)
                .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), VaraCardShape)
                .padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            listOf(Triple("ar", "🇸🇦", "العربية"), Triple("en", "🇬🇧", "English")).forEach { (code, flag, name) ->
                val active = language == code
                Column(
                    Modifier
                        .weight(1f)
                        .height(72.dp)
                        .clip(VaraTileShape)
                        .background(if (active) c.accent else c.chip)
                        .border(1.dp, if (active) Color.Transparent else c.outline, VaraTileShape)
                        .clickable { vm.setLanguage(code) }
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(flag, fontSize = 20.sp)
                    Spacer(Modifier.height(5.dp))
                    Text(name, color = if (active) Color.White else c.textDim, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        AcHint("اختر لغة الواجهة. قد تبقى بيانات المباريات بالعربية حتى تدعمها البوابة بالإنجليزية.")
    }
}

// ─── المظهر + لون التطبيق ───

@Composable
private fun AcAppearanceSection(vm: VaraViewModel, currentTheme: ThemeMode, accentId: String) {
    val c = LocalVaraColors.current
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        AcSectionTitle("المظهر")
        Row(
            Modifier
                .fillMaxWidth()
                .clip(VaraCardShape)
                .background(c.surface)
                .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), VaraCardShape)
                .padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            listOf(
                Triple(ThemeMode.SYSTEM, Icons.Default.SettingsBrightness, "تلقائي"),
                Triple(ThemeMode.LIGHT, Icons.Default.LightMode, "فاتح"),
                Triple(ThemeMode.DARK, Icons.Default.DarkMode, "داكن"),
            ).forEach { (mode, icon, label) ->
                val active = mode == currentTheme
                Column(
                    Modifier
                        .weight(1f)
                        .height(72.dp)
                        .clip(VaraTileShape)
                        .background(if (active) c.accent else c.chip)
                        .border(1.dp, if (active) Color.Transparent else c.outline, VaraTileShape)
                        .clickable { vm.setTheme(mode) }
                        .padding(horizontal = 8.dp, vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Icon(icon, null, tint = if (active) Color.White else c.textDim, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.height(5.dp))
                    Text(label, color = if (active) Color.White else c.textDim, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        AcHint("«تلقائي» يتبع إعداد جهازك؛ أو اختر الفاتح/الداكن يدويًّا.")
        Spacer(Modifier.height(2.dp))
        // مُنتقي لون التطبيق — شبكة 5 أعمدة بعنوان وحلقة للنشط ولون متكيّف داكن/فاتح.
        Text("لون التطبيق", color = c.textDim, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 5.dp))
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            accents.chunked(5).forEach { rowAccents ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    rowAccents.forEach { a ->
                        Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                            AcColorSwatch(a, a.id == accentId) { vm.setAccent(a.id) }
                        }
                    }
                    repeat(5 - rowAccents.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
        AcHint("اختر لونك المفضل للأزرار والأيقونات والترويسات؛ البطولات تبقى بنفس قالب التطبيق.")
    }
}

@Composable
private fun AcColorSwatch(accent: Accent, active: Boolean, select: () -> Unit) {
    val c = LocalVaraColors.current
    // اللون المتكيّف: درجة الوضع الداكن في الداكن ودرجة الفاتح في الفاتح (نظير SpTheme.dyn).
    val color = Color(if (c.dark) accent.dark else accent.light)
    Box(
        Modifier.size(42.dp).clip(CircleShape).background(color)
            .border(if (active) 2.dp else 0.dp, if (active) Color.White else Color.Transparent, CircleShape)
            .clickable(onClick = select),
        contentAlignment = Alignment.Center,
    ) {
        if (active) Icon(Icons.Default.Check, null, tint = Color.White, modifier = Modifier.size(16.dp))
    }
}

// ─── الإشعارات (مدخل بعنوان فرعي ديناميكي) ───

@Composable
private fun AcNotificationsSection(loggedIn: Boolean, teamsCount: Int, matchesCount: Int, open: () -> Unit) {
    val c = LocalVaraColors.current
    val subtitle = if (!loggedIn) "إذن النظام · مبارياتي · تسجيل الدخول للتنبيهات اللحظية"
    else "$teamsCount فِرق · $matchesCount مباريات · أنواع الأحداث"
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        AcSectionTitle("الإشعارات")
        Row(
            Modifier.fillMaxWidth().clip(VaraCardShape).background(c.surface).clickable(onClick = open)
                .padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AcIconTile(Icons.Default.Notifications, c.accent)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("إدارة الإشعارات", color = c.text, fontSize = 14.5.sp, fontWeight = FontWeight.Bold)
                Text(subtitle, color = c.textFaint, fontSize = 11.5.sp, maxLines = 2)
            }
            Icon(Icons.Default.ChevronLeft, null, tint = c.textFaint, modifier = Modifier.size(16.dp))
        }
        AcHint("تصلك إشعارات الفِرق المتابَعة والمباريات في «مبارياتي».")
    }
}

// ─── عن التطبيق ───

@Composable
private fun AcAboutSection(nav: NavHostController, context: Context, version: String) {
    val c = LocalVaraColors.current
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        AcSectionTitle("عن التطبيق")
        Column(Modifier.fillMaxWidth().clip(VaraCardShape).background(c.surface)) {
            SettingsRow(Icons.Default.Info, "عن التطبيق", null, c.textDim) { nav.navigate(Routes.About) }
            Box(Modifier.padding(start = 56.dp)) { VaraDivider() }
            SettingsRow(Icons.Default.Lock, "سياسة الخصوصية", null, c.textDim) { nav.navigate(Routes.Privacy) }
            Box(Modifier.padding(start = 56.dp)) { VaraDivider() }
            SettingsRow(Icons.Default.VerifiedUser, "سياسة الاستخدام", null, c.textDim) { nav.navigate(Routes.Usage) }
            Box(Modifier.padding(start = 56.dp)) { VaraDivider() }
            SettingsRow(Icons.Default.Description, "شروط الاستخدام", null, c.textDim) { nav.navigate(Routes.Terms) }
            Box(Modifier.padding(start = 56.dp)) { VaraDivider() }
            // الدعم — رابط خارجي يفتح المتصفح (نظير linkRow في iOS).
            Row(
                Modifier.fillMaxWidth().clickable {
                    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://sabq.org/contact"))) }
                }.padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AcIconTile(Icons.Default.Help, c.textDim)
                Spacer(Modifier.width(12.dp))
                Text("الدعم", color = c.text, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Icon(Icons.Default.OpenInNew, null, tint = c.textFaint, modifier = Modifier.size(14.dp))
            }
            Box(Modifier.padding(start = 56.dp)) { VaraDivider() }
            // صف الإصدار — قيمة حقيقية من PackageManager بلا نقر.
            Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                AcIconTile(Icons.Default.Tag, c.textDim)
                Spacer(Modifier.width(12.dp))
                Text("الإصدار", color = c.text, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                ForceLtr { Text(version, color = c.textFaint, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
            }
        }
    }
}

// ─── منطقة الخطر + الخروج + الختم ───

@Composable
private fun AcDangerSection(open: () -> Unit) {
    val c = LocalVaraColors.current
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        AcSectionTitle("منطقة الخطر")
        Column(Modifier.fillMaxWidth().clip(VaraCardShape).background(c.surface)) {
            SettingsRow(Icons.Default.Delete, "حذف الحساب", null, c.live, open)
        }
        AcHint("حذف الحساب يزيل ملفّك وبياناتك نهائيًّا ولا يمكن التراجع عنه.")
    }
}

@Composable
private fun AcSignOutButton(confirm: () -> Unit) {
    val c = LocalVaraColors.current
    Row(
        Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(VaraCardShape).background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), VaraCardShape)
            .clickable(onClick = confirm).padding(vertical = 14.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.AutoMirrored.Filled.Logout, null, tint = c.live, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(7.dp))
        Text("تسجيل الخروج", color = c.live, fontSize = 14.5.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun AcFooter() {
    val c = LocalVaraColors.current
    Row(
        Modifier.fillMaxWidth().padding(top = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(7.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        VaraWordmark(11, color = c.textFaint)
        Text("· دقّة الرياضة", color = c.textFaint, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    }
}

// ─── عناصر مشتركة لقوائم الإعدادات ───

@Composable
private fun AcSectionTitle(title: String) {
    val c = LocalVaraColors.current
    Text(title, color = c.textDim, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 5.dp))
}

@Composable
private fun AcHint(text: String) {
    val c = LocalVaraColors.current
    Text(text, color = c.textFaint, fontSize = 11.5.sp, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 5.dp))
}

@Composable
private fun AcIconTile(icon: ImageVector, tint: Color) {
    Box(Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(tint.copy(.12f)), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = tint, modifier = Modifier.size(16.dp))
    }
}

@Composable
private fun SettingsRow(icon: ImageVector, title: String, subtitle: String?, tint: Color, open: () -> Unit) {
    val c = LocalVaraColors.current
    Row(Modifier.fillMaxWidth().clickable(onClick = open).padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        AcIconTile(icon, tint)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = if (tint == c.live) c.live else c.text, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold)
            if (!subtitle.isNullOrBlank()) Text(subtitle, color = c.textFaint, fontSize = 10.sp)
        }
        Icon(Icons.Default.ChevronLeft, null, tint = c.textFaint, modifier = Modifier.size(16.dp))
    }
}

// ═══════════════════════════════ «لك» (نظير SpForYouView) ═══════════════════════════════

@Composable
fun ForYouScreen(nav: NavHostController, vm: VaraViewModel) {
    val c = LocalVaraColors.current
    val account by vm.account.collectAsState()
    val followedFx by vm.followedFixtures.collectAsState()
    // «مبارياتي» من اللقطات المحلية فورًا — بلا نداء لكل مباراة (نظير SpMatchFollows.visibleItems).
    val myMatches = remember(followedFx) { vm.visibleFollowedFixtures().sortedBy { it.kickoffMs ?: Long.MAX_VALUE } }
    val followedTeams = account.follows.filter { it.kind == "team" }
    var predictions by remember { mutableStateOf<List<JsonObject>?>(null) }
    var refreshTick by remember { mutableIntStateOf(0) }
    var refreshing by remember { mutableStateOf(false) }

    LaunchedEffect(refreshTick, account.loggedIn) {
        refreshing = refreshTick > 0
        coroutineScope {
            // تحديث لقطات المتابعات بالتوازي ثم دفعها للنموذج — العرض لا ينتظر الشبكة.
            val snapshots = async {
                val ids = vm.followedMatchIds
                if (ids.isEmpty()) return@async
                val fresh = ids.map { id ->
                    async {
                        runCatching { vm.api.publicGet("/sports/match/$id/lite", ignoreCache = true) }.getOrNull()
                            ?.let { root -> parseFixture(root) ?: (root as? JsonObject)?.get("fixture")?.let(::parseFixture) }
                    }
                }.mapNotNull { it.await() }
                if (fresh.isNotEmpty()) vm.updateFollowedSnapshots(fresh)
            }
            val mine = async {
                predictions = if (!vm.isLoggedIn) emptyList()
                else runCatching { vm.api.memberGet("/sports/predictions/mine", ignoreCache = true) }.getOrNull()
                    ?.let { findArray(it, "predictions", "items").filterIsInstance<JsonObject>() } ?: emptyList()
            }
            snapshots.await(); mine.await()
        }
        refreshing = false
    }

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        VaraPullRefresh(refreshing = refreshing, onRefresh = { refreshTick++ }) {
            LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
                item { BackHeader(nav, "لك") }
                // بطاقة «مبارياتي» تختفي كليًّا عند الفراغ (نظير SpMyMatchesCard).
                if (myMatches.isNotEmpty()) {
                    item { Box(Modifier.padding(horizontal = 16.dp)) { SectionHeader("مبارياتي", "المباريات التي اخترت متابعتها", myMatches.size, Icons.Default.Star) } }
                    val grouped = myMatches.groupBy { fx -> VaraFormat.instantOf(fx)?.let(VaraFormat::localDate) }
                    grouped.forEach { (day, fixtures) ->
                        item(key = "fy-day-$day") {
                            DateSectionBanner(
                                label = day?.let(VaraFormat::dateLabel) ?: "بدون موعد",
                                count = fixtures.size,
                                modifier = Modifier.padding(horizontal = 16.dp),
                            )
                        }
                        items(fixtures, key = { "fy-fx-${it.id}" }) { fx ->
                            FixtureCard(fx, { nav.navigate("match/${fx.id}") }, Modifier.padding(horizontal = 16.dp))
                        }
                    }
                }
                if (followedTeams.isNotEmpty()) {
                    item { Box(Modifier.padding(horizontal = 16.dp)) { SectionHeader("فِرقك", count = followedTeams.size, icon = Icons.Default.Star) } }
                    item {
                        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            followedTeams.forEach { f ->
                                Column(
                                    Modifier.width(64.dp).clickable { f.refId.toIntOrNull()?.let { nav.navigate("team/$it") } },
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    RemoteLogo(f.logo, f.name, 44)
                                    Text(f.name, color = c.text, fontSize = 10.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                    }
                }
                if (account.loggedIn) {
                    item { Box(Modifier.padding(horizontal = 16.dp)) { SectionHeader("آخر توقّعاتك", icon = Icons.Default.AutoAwesome) } }
                    when (val mine = predictions) {
                        null -> item { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = c.accent) } }
                        else ->
                            if (mine.isEmpty()) item { EmptyState("لم تتوقّع بعد", "ابدأ من تبويب «روشن» ← التوقّعات") }
                            else items(mine.take(6)) { row -> ForYouPredictionRow(row) }
                    }
                } else {
                    item { Box(Modifier.padding(horizontal = 16.dp)) { SectionHeader("آخر توقّعاتك", icon = Icons.Default.AutoAwesome) } }
                    item { LoginRequired(nav, "لتظهر هنا توقّعاتك وفرقك وتنبيهاتك") }
                }
            }
        }
    }
}

/// صف توقّع أغنى: شعارا الفريقين + التوقّع + الحالة + النقاط.
@Composable
private fun ForYouPredictionRow(row: JsonObject) {
    val c = LocalVaraColors.current
    val meta = row.obj("fixture", "match", "metadata")
    val home = parseTeam(meta?.get("home") ?: row["home"], row.string("homeName") ?: "المضيف")
    val away = parseTeam(meta?.get("away") ?: row["away"], row.string("awayName") ?: "الضيف")
    val payload = row.obj("prediction", "payload") ?: row.obj("myEntry")?.obj("payload")
    val predHome = payload?.int("predHome", "home")
    val predAway = payload?.int("predAway", "away")
    val status = row.string("status") ?: ""
    val points = row.int("points", "awardedPoints", "pointsAwarded")
    VaraCard(Modifier.padding(horizontal = 16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            RemoteLogo(home.logo, home.name, 26)
            Spacer(Modifier.width(6.dp))
            Text("${home.name} × ${away.name}", color = c.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(6.dp))
            RemoteLogo(away.logo, away.name, 26)
            Spacer(Modifier.width(10.dp))
            if (predHome != null && predAway != null) {
                ForceLtr { Text("$predAway–$predHome", color = c.accent, fontSize = 18.sp, fontWeight = FontWeight.Bold) }
            } else Text("—", color = c.textFaint, fontSize = 18.sp)
        }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            val (label, tint) = when (status) {
                "open" -> "توقّع مفتوح" to c.accent
                "locked", "ready" -> "بانتظار النتيجة" to c.textDim
                "settled" -> "احتُسبت" to c.gold
                "void" -> "أُلغيت" to c.textFaint
                else -> "" to c.textFaint
            }
            if (label.isNotBlank()) Text(label, color = tint, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            else Spacer(Modifier.weight(1f))
            points?.let {
                Text(if (it > 0) "+$it نقطة" else "دون نقاط", color = if (it > 0) c.gold else c.textFaint, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

// ═══════════════════════════════ تسجيل الدخول (نظير SpMembershipLogin) ═══════════════════════════════

@Composable
fun LoginScreen(nav: NavHostController, vm: VaraViewModel) {
    val c = LocalVaraColors.current
    val account by vm.account.collectAsState()
    // بعد أول دخول ناجح: الحقول تُملأ من المخزون المشفّر على الجهاز.
    val savedCreds = remember { vm.savedMembershipCredentials() }
    var mode by remember { mutableIntStateOf(if (savedCreds != null) 1 else 0) } // 0 = الجوال، 1 = عضوية سبق
    var identifier by remember { mutableStateOf(savedCreds?.identifier.orEmpty()) }
    var password by remember { mutableStateOf(savedCreds?.password.orEmpty()) }
    var phone by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var codeSent by remember { mutableStateOf(false) }
    var resend by remember { mutableIntStateOf(0) }
    var resendKey by remember { mutableIntStateOf(0) }
    var twoFactorCode by remember { mutableStateOf("") }
    var backupCode by remember { mutableStateOf("") }
    var useBackup by remember { mutableStateOf(false) }
    // رسالة الخطأ تظهر فقط تحت الزر الذي أنتجها (نظير errorSource في iOS).
    var errorSource by remember { mutableStateOf("") }

    val phoneValid = phone.length == 9 && phone.startsWith("5")

    // عدّاد إعادة الإرسال 60 ثانية — يُعاد تشغيله مع كل إرسال ناجح.
    LaunchedEffect(resendKey) {
        if (resendKey > 0) {
            resend = 60
            while (resend > 0) { delay(1000); resend-- }
        }
    }

    @Composable
    fun errorText(source: String) {
        if (errorSource == source) account.error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = c.live, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
    }

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
            item { BackHeader(nav, "تسجيل الدخول") }
            item {
                Column(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 2.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("مرحبًا بك في", color = c.text, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        VaraWordmark(20)
                    }
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        Text("أحد منتجات", color = c.textFaint, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                        Box(Modifier.width(1.dp).height(11.dp).background(c.outline))
                        Text("صحيفة سبق", color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "سجّل دخولك لتحفظ فريقك، وترسل توقّعاتك، وتصلك تنبيهات المباريات على كل أجهزتك.",
                        color = c.textDim, fontSize = 13.sp, textAlign = TextAlign.Center, lineHeight = 21.sp,
                        modifier = Modifier.padding(horizontal = 24.dp),
                    )
                }
            }
            item {
                VaraCard(Modifier.padding(horizontal = 16.dp)) {
                    if (account.twoFactorChallenge != null) {
                        // خطوة التحقّق بخطوتين — تحلّ مكان النموذج حتى اكتمال التحدّي أو الرجوع.
                        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.Shield, null, tint = c.accent, modifier = Modifier.size(36.dp))
                            Spacer(Modifier.height(10.dp))
                            Text("التحقّق بخطوتين", color = c.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(6.dp))
                            Text(
                                if (useBackup) "أدخل أحد الرموز الاحتياطية" else "أدخل الرمز المكوّن من ٦ أرقام من تطبيق المصادقة",
                                color = c.textDim, fontSize = 13.sp, textAlign = TextAlign.Center,
                            )
                            Spacer(Modifier.height(12.dp))
                            if (useBackup) {
                                ForceLtr {
                                    OutlinedTextField(
                                        backupCode, { backupCode = it }, Modifier.fillMaxWidth(),
                                        placeholder = { Text("الرمز الاحتياطي", color = c.textFaint) },
                                        textStyle = LocalTextStyle.current.copy(textAlign = TextAlign.Center, fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
                                        singleLine = true,
                                    )
                                }
                            } else {
                                ForceLtr {
                                    OutlinedTextField(
                                        twoFactorCode, { twoFactorCode = it.filter(Char::isDigit).take(6) }, Modifier.fillMaxWidth(),
                                        placeholder = { Text("······", color = c.textFaint) },
                                        textStyle = LocalTextStyle.current.copy(textAlign = TextAlign.Center, fontSize = 22.sp, fontWeight = FontWeight.Bold, letterSpacing = 8.sp),
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                                        singleLine = true,
                                    )
                                }
                            }
                            errorText("2fa")
                            Spacer(Modifier.height(14.dp))
                            val submitEnabled = if (useBackup) backupCode.trim().isNotEmpty() else twoFactorCode.length == 6
                            Button(
                                {
                                    errorSource = "2fa"
                                    vm.verifyTwoFactor(
                                        if (useBackup) "" else twoFactorCode,
                                        backupCode.trim().takeIf { useBackup && it.isNotEmpty() },
                                    ) { ok -> if (ok) nav.popBackStack() else twoFactorCode = "" }
                                },
                                Modifier.fillMaxWidth(), enabled = submitEnabled && !account.busy,
                                shape = RoundedCornerShape(16.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = c.accent),
                            ) { Text(if (account.busy) "جارٍ التحقق…" else "تحقّق", modifier = Modifier.padding(vertical = 6.dp), fontWeight = FontWeight.Bold) }
                            Spacer(Modifier.height(6.dp))
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                TextButton({
                                    useBackup = !useBackup
                                    twoFactorCode = ""; backupCode = ""
                                }) { Text(if (useBackup) "استخدام رمز التطبيق" else "استخدام رمز احتياطي", color = c.accent, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
                                Spacer(Modifier.weight(1f))
                                // زر «رجوع» يلغي التحدّي ويعيد النموذج — بدونه الشاشة محبوسة.
                                TextButton({
                                    twoFactorCode = ""; backupCode = ""; useBackup = false
                                    vm.cancelTwoFactor()
                                }) { Text("رجوع", color = c.textDim, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
                            }
                        }
                    } else {
                        DetailTabs(listOf("الجوال", "عضوية سبق"), mode) { mode = it }
                        Spacer(Modifier.height(12.dp))
                        if (mode == 1) {
                            // عضوية سبق — بريد/جوال + كلمة مرور (محفوظة على الجهاز بعد أول نجاح).
                            OutlinedTextField(identifier, { identifier = it }, Modifier.fillMaxWidth(), label = { Text("البريد الإلكتروني أو الجوال") }, singleLine = true)
                            Spacer(Modifier.height(10.dp))
                            OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text("كلمة المرور") }, visualTransformation = PasswordVisualTransformation(), singleLine = true)
                            if (savedCreds != null) {
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    "بيانات الدخول محفوظة على هذا الجهاز",
                                    color = c.textFaint,
                                    fontSize = 11.sp,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                            Spacer(Modifier.height(14.dp))
                            Button(
                                {
                                    errorSource = "membership"
                                    vm.login(identifier, password) { if (it) nav.popBackStack() }
                                },
                                Modifier.fillMaxWidth(), enabled = identifier.isNotBlank() && password.isNotBlank() && !account.busy,
                                shape = RoundedCornerShape(16.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = c.accent),
                            ) { Text(if (account.busy) "جارٍ الدخول…" else "الدخول بعضوية سبق", modifier = Modifier.padding(vertical = 6.dp), fontWeight = FontWeight.Bold) }
                            errorText("membership")
                        } else if (!codeSent) {
                            // خطوة إدخال الرقم — 9 أرقام تبدأ بـ5 مع بادئة +966 (كالويب).
                            ForceLtr {
                                OutlinedTextField(
                                    phone, { phone = it.filter(Char::isDigit).take(9) }, Modifier.fillMaxWidth(),
                                    prefix = { Text("🇸🇦 +966 ", color = c.text, fontWeight = FontWeight.Bold) },
                                    placeholder = { Text("5XXXXXXXX", color = c.textFaint) },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                                    singleLine = true,
                                )
                            }
                            Spacer(Modifier.height(8.dp))
                            Text("سنرسل رمز تحقّق برسالة نصية إلى جوالك.", color = c.textFaint, fontSize = 11.5.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                            Spacer(Modifier.height(12.dp))
                            Button(
                                {
                                    errorSource = "phone"
                                    vm.sendPhone(phone) { ok -> if (ok) { codeSent = true; code = ""; resendKey++ } }
                                },
                                Modifier.fillMaxWidth(), enabled = phoneValid && !account.busy,
                                shape = RoundedCornerShape(16.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = c.accent),
                            ) { Text(if (account.busy) "جارٍ الإرسال…" else "أرسل رمز التحقق", modifier = Modifier.padding(vertical = 6.dp), fontWeight = FontWeight.Bold) }
                            errorText("phone")
                        } else {
                            // خطوة الرمز — 6 أرقام + عدّاد إعادة إرسال + تعديل الرقم.
                            Text("أدخل رمز التحقق", color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                            Spacer(Modifier.height(4.dp))
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(5.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
                                Text("أُرسل إلى", color = c.textDim, fontSize = 12.sp)
                                ForceLtr { Text("+966 $phone", color = c.textDim, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
                                Text(
                                    "تعديل الرقم", color = c.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold,
                                    modifier = Modifier.clickable { codeSent = false; code = "" },
                                )
                            }
                            Spacer(Modifier.height(12.dp))
                            ForceLtr {
                                OutlinedTextField(
                                    code, { code = it.filter(Char::isDigit).take(6) }, Modifier.fillMaxWidth(),
                                    placeholder = { Text("······", color = c.textFaint) },
                                    textStyle = LocalTextStyle.current.copy(textAlign = TextAlign.Center, fontSize = 22.sp, fontWeight = FontWeight.Bold, letterSpacing = 8.sp),
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                                    singleLine = true,
                                )
                            }
                            Spacer(Modifier.height(10.dp))
                            if (resend > 0) {
                                Text("إعادة الإرسال خلال $resend ثانية", color = c.textFaint, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                            } else {
                                Text(
                                    "إعادة إرسال الرمز", color = c.accent, fontSize = 13.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center,
                                    modifier = Modifier.fillMaxWidth().clickable {
                                        errorSource = "phone"
                                        vm.sendPhone(phone) { ok -> if (ok) resendKey++ }
                                    },
                                )
                            }
                            Spacer(Modifier.height(12.dp))
                            Button(
                                {
                                    errorSource = "phone"
                                    vm.verifyPhone(phone, code) { if (it) nav.popBackStack() }
                                },
                                Modifier.fillMaxWidth(), enabled = code.length == 6 && !account.busy,
                                shape = RoundedCornerShape(16.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = c.accent),
                            ) { Text(if (account.busy) "جارٍ التحقق…" else "تحقّق ودخول", modifier = Modifier.padding(vertical = 6.dp), fontWeight = FontWeight.Bold) }
                            errorText("phone")
                        }
                    }
                }
            }
        }
    }
}

// ═══════════════════════════════ الإشعارات (نظير NotificationsSettingsView) ═══════════════════════════════

@Composable
fun AlertsScreen(nav: NavHostController, vm: VaraViewModel) {
    val c = LocalVaraColors.current
    val account by vm.account.collectAsState()
    val followedFx by vm.followedFixtures.collectAsState()
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val followedTeams = account.follows.filter { it.kind == "team" }
    val followedMatches = remember(followedFx) { vm.visibleFollowedFixtures() }

    // حالة إذن النظام الحية — تُعاد قراءتها عند كل عودة للمقدمة (نظير willEnterForeground).
    var pushEnabled by remember { mutableStateOf(NotificationManagerCompat.from(context).areNotificationsEnabled()) }
    val uiPrefs = remember { context.getSharedPreferences("vara_alerts_ui", Context.MODE_PRIVATE) }
    var asked by remember { mutableStateOf(Build.VERSION.SDK_INT < 33 || uiPrefs.getBoolean("push_requested", false)) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        uiPrefs.edit().putBoolean("push_requested", true).apply()
        asked = true
        pushEnabled = NotificationManagerCompat.from(context).areNotificationsEnabled()
    }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) pushEnabled = NotificationManagerCompat.from(context).areNotificationsEnabled()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val p = account.alerts
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(14.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
            item { BackHeader(nav, "الإشعارات") }
            // كيف تعمل؟
            item {
                VaraCard(Modifier.padding(horizontal = 16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        AcIconTile(Icons.Default.Notifications, c.accent)
                        Spacer(Modifier.width(10.dp))
                        Text("كيف تصلك الإشعارات؟", color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "تصلك إشعارات مباريات الفِرق التي تتابعها، والمباريات في «مبارياتي». فعّل أنواع الأحداث أدناه، وتأكد أن إذن النظام مسموح.",
                        color = c.textDim, fontSize = 13.sp, lineHeight = 21.sp,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text("الفريق المفضّل يخصّص واجهتك فقط ولا يفعّل الإشعارات بمفرده.", color = c.textFaint, fontSize = 12.sp, lineHeight = 19.sp)
                }
            }
            // إذن النظام — بحالة حية وزرّ سياقي.
            item {
                Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    AcSectionTitle("إذن النظام")
                    Row(
                        Modifier.fillMaxWidth().clip(VaraCardShape).background(c.surface).padding(horizontal = 14.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        AcIconTile(Icons.Default.PhoneAndroid, if (pushEnabled) c.accent else c.live)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text("إشعارات الجهاز", color = c.text, fontSize = 14.5.sp, fontWeight = FontWeight.Bold)
                            Text(
                                when {
                                    pushEnabled -> "مسموح"
                                    !asked -> "لم يُطلب بعد"
                                    else -> "مرفوض — افتح إعدادات الجهاز"
                                },
                                color = if (pushEnabled) c.accent else c.live, fontSize = 12.sp,
                            )
                        }
                        when {
                            pushEnabled -> Icon(Icons.Default.Check, null, tint = c.accent, modifier = Modifier.size(18.dp))
                            !asked -> Button(
                                { permissionLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS) },
                                shape = CircleShape,
                                colors = ButtonDefaults.buttonColors(containerColor = c.accent),
                            ) { Text("تفعيل", fontSize = 13.sp, fontWeight = FontWeight.Bold) }
                            else -> Text(
                                "فتح الإعدادات", color = c.accent, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                                modifier = Modifier.clickable { alOpenNotificationSettings(context) },
                            )
                        }
                    }
                    if (!pushEnabled) AcHint("بدون إذن النظام لن تصل الإشعارات حتى لو كانت المفاتيح مفعّلة داخل التطبيق.")
                }
            }
            // من أين تصلك؟ — الفِرق المتابَعة + مبارياتي.
            item {
                Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    AcSectionTitle("من أين تصلك؟")
                    Column(Modifier.fillMaxWidth().clip(VaraCardShape).background(c.surface)) {
                        AlTeamsSourceBlock(nav, account.loggedIn, followedTeams)
                        Box(Modifier.padding(start = 56.dp)) { VaraDivider() }
                        AlMatchesSourceBlock(nav, followedMatches)
                    }
                    AcHint("أضف فريقًا من صفحة النادي («تابع التنبيهات»)، أو أضف مباراة بنجمة ⭐ في جدول المباريات.")
                }
            }
            if (account.loggedIn) {
                // أحداث المباراة — المفاتيح الستة بترتيب iOS + المفتاح المحلي للقطات.
                item {
                    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        AcSectionTitle("أحداث المباراة")
                        Column(Modifier.fillMaxWidth().clip(VaraCardShape).background(c.surface)) {
                            AlToggleRow(Icons.Default.PlayCircle, "بداية المباراة", p.kickoff) { vm.updateAlerts(p.copy(kickoff = it)) }
                            Box(Modifier.padding(start = 56.dp)) { VaraDivider() }
                            AlToggleRow(Icons.Default.SportsSoccer, "الأهداف", p.goals) { vm.updateAlerts(p.copy(goals = it)) }
                            Box(Modifier.padding(start = 56.dp)) { VaraDivider() }
                            AlToggleRow(Icons.Default.CropPortrait, "البطاقات", p.cards) { vm.updateAlerts(p.copy(cards = it)) }
                            Box(Modifier.padding(start = 56.dp)) { VaraDivider() }
                            AlToggleRow(Icons.Default.Tv, "حالات الفار (VAR)", p.varReview) { vm.updateAlerts(p.copy(varReview = it)) }
                            Box(Modifier.padding(start = 56.dp)) { VaraDivider() }
                            AlToggleRow(Icons.Default.SportsScore, "نهاية المباراة", p.fulltime) { vm.updateAlerts(p.copy(fulltime = it)) }
                            Box(Modifier.padding(start = 56.dp)) { VaraDivider() }
                            AlToggleRow(Icons.Default.AutoAwesome, "لقطات ذكية", p.smartSnaps) { vm.updateAlerts(p.copy(smartSnaps = it)) }
                            Box(Modifier.padding(start = 56.dp)) { VaraDivider() }
                            // مفتاح محلي — عرض البطاقات داخل الواجهة، منفصل عن إشعار الدفع.
                            AlToggleRow(
                                Icons.Default.Visibility, "إظهار اللقطات داخل التطبيق", account.smartSnapsVisible,
                                subtitle = "عرض البطاقات داخل الشاشات — منفصل عن إشعار الدفع.",
                                onLabel = "ظاهر", offLabel = "مخفي",
                            ) { vm.setSmartSnapsVisible(it) }
                        }
                        AcHint("هذه المفاتيح عامّة: تنطبق على كل فِرقك المتابَعة وكل مبارياتك في «مبارياتي».")
                    }
                }
                // الانتقالات.
                item {
                    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        AcSectionTitle("تنبيهات الانتقالات")
                        Column(Modifier.fillMaxWidth().clip(VaraCardShape).background(c.surface)) {
                            AlToggleRow(Icons.Default.Flag, "انتقالات سعودية", p.transfersSaudi) { vm.updateAlerts(p.copy(transfersSaudi = it)) }
                            Box(Modifier.padding(start = 56.dp)) { VaraDivider() }
                            AlToggleRow(Icons.Default.Public, "انتقالات عالمية بارزة", p.transfersGlobal) { vm.updateAlerts(p.copy(transfersGlobal = it)) }
                        }
                        AcHint("تصلك الصفقات المؤكّدة فور تأكيدها — تنبيهات سوق عامّة لا تتطلّب متابعة فريق.")
                    }
                }
            } else {
                // الزائر يرى الشاشة كاملة مع بطاقة دخول بدل التحويل القسري.
                item {
                    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        AcSectionTitle("تفعيل التنبيهات")
                        Row(
                            Modifier.fillMaxWidth().clip(VaraCardShape).background(c.surface)
                                .clickable { nav.navigate(Routes.Login) }.padding(horizontal = 14.dp, vertical = 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            AcIconTile(Icons.Default.Person, c.accent)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text("سجّل الدخول لتفعيل التنبيهات", color = c.text, fontSize = 14.5.sp, fontWeight = FontWeight.Bold)
                                Text(
                                    "تذكير «مبارياتي» المحلي يعمل بلا دخول. الإشعارات اللحظية (أهداف وبطاقات) تحتاج عضوية سبق.",
                                    color = c.textFaint, fontSize = 12.sp, lineHeight = 18.sp,
                                )
                            }
                            Icon(Icons.Default.ChevronLeft, null, tint = c.textFaint, modifier = Modifier.size(16.dp))
                        }
                    }
                }
            }
        }
    }
}

private fun alOpenNotificationSettings(context: Context) {
    runCatching {
        context.startActivity(
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}

@Composable
private fun AlTeamsSourceBlock(nav: NavHostController, loggedIn: Boolean, followedTeams: List<Follow>) {
    val c = LocalVaraColors.current
    Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            AcIconTile(Icons.Default.Favorite, c.accent)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("الفِرق المتابَعة", color = c.text, fontSize = 14.5.sp, fontWeight = FontWeight.Bold)
                Text(
                    when {
                        !loggedIn -> "يتطلّب تسجيل الدخول"
                        followedTeams.isEmpty() -> "لا فِرق بعد"
                        else -> "إشعارات كل مباريات هذه الفِرق"
                    },
                    color = c.textFaint, fontSize = 11.5.sp,
                )
            }
            Text("${followedTeams.size}", color = c.textFaint, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
        when {
            loggedIn && followedTeams.isNotEmpty() -> Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                followedTeams.forEach { f ->
                    Column(
                        Modifier.width(56.dp).clickable { f.refId.toIntOrNull()?.let { nav.navigate("team/$it") } },
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        RemoteLogo(f.logo, f.name, 42)
                        Text(f.name, color = c.text, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
            !loggedIn -> Text("سجّل الدخول لمتابعة فِرق وتلقّي تنبيهاتها على كل أجهزتك.", color = c.textFaint, fontSize = 12.sp)
            else -> Text("لا فِرق متابَعة بعد — افتح صفحة نادٍ واضغط «تابع التنبيهات».", color = c.textFaint, fontSize = 12.sp)
        }
    }
}

@Composable
private fun AlMatchesSourceBlock(nav: NavHostController, followedMatches: List<Fixture>) {
    val c = LocalVaraColors.current
    Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            AcIconTile(Icons.Default.Star, c.accent)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("مبارياتي", color = c.text, fontSize = 14.5.sp, fontWeight = FontWeight.Bold)
                Text(
                    if (followedMatches.isEmpty()) "لا مباريات بعد" else "إشعارات هذه المباريات فقط + تذكير قبل 10 دقائق",
                    color = c.textFaint, fontSize = 11.5.sp,
                )
            }
            Text("${followedMatches.size}", color = c.textFaint, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
        if (followedMatches.isEmpty()) {
            Text("لا مباريات في «مبارياتي» — اضغط النجمة ⭐ على أي مباراة في الجدول.", color = c.textFaint, fontSize = 12.sp)
        } else {
            Column {
                followedMatches.take(6).forEachIndexed { idx, fx ->
                    if (idx > 0) VaraDivider()
                    Row(
                        Modifier.fillMaxWidth().clickable { nav.navigate("match/${fx.id}") }.padding(vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RemoteLogo(fx.home.logo, fx.home.name, 22)
                        Spacer(Modifier.width(10.dp))
                        Text("${fx.home.name} × ${fx.away.name}", color = c.text, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        Spacer(Modifier.width(4.dp))
                        Text(
                            when {
                                fx.status.live -> "مباشر"
                                fx.status.finished -> "انتهت"
                                else -> VaraFormat.instantOf(fx)?.let { "${VaraFormat.dayMonthLabel(it)} · ${VaraFormat.time(it)}" } ?: "قادمة"
                            },
                            color = if (fx.status.live) c.live else c.textFaint, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                        )
                        Spacer(Modifier.width(6.dp))
                        Icon(Icons.Default.ChevronLeft, null, tint = c.textFaint, modifier = Modifier.size(14.dp))
                    }
                }
                if (followedMatches.size > 6) {
                    Text(
                        "و${followedMatches.size - 6} مباريات أخرى في الرئيسية",
                        color = c.textFaint, fontSize = 11.5.sp, modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
    }
}

/// صف تبديل بأسلوب iOS: بلاطة أيقونة + عنوان + نقطة حالة و«مفعّل/متوقف».
@Composable
private fun AlToggleRow(
    icon: ImageVector,
    title: String,
    active: Boolean,
    subtitle: String? = null,
    onLabel: String = "مفعّل",
    offLabel: String = "متوقف",
    toggle: (Boolean) -> Unit,
) {
    val c = LocalVaraColors.current
    Row(
        Modifier.fillMaxWidth().clickable { toggle(!active) }.padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AcIconTile(icon, if (active) c.accent else c.textFaint)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = c.text, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold)
            if (!subtitle.isNullOrBlank()) Text(subtitle, color = c.textFaint, fontSize = 11.sp, lineHeight = 16.sp)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.size(7.dp).clip(CircleShape).background(if (active) c.accent else c.textFaint))
            Text(if (active) onLabel else offLabel, color = if (active) c.accent else c.textFaint, fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
        }
    }
}

// ═══════════════════════════════ تعديل الملف الشخصي (نظير EditProfileView) ═══════════════════════════════

@Composable
fun EditProfileScreen(nav: NavHostController, vm: VaraViewModel) {
    val c = LocalVaraColors.current
    val account by vm.account.collectAsState()
    val member = account.member
    val context = LocalContext.current
    // حقول write-once: الاسم بعد تعيينه والبريد الحقيقي مقفلان (نظير hydrate في iOS).
    val hydrated = remember(member) {
        val base = if (member == null || member.needsDisplayName || member.name == "عضو سبق") "" else member.name.trim()
        val parts = base.split(" ", limit = 2)
        Triple(parts.getOrElse(0) { "" }, parts.getOrElse(1) { "" }, member?.displayEmail.orEmpty())
    }
    val (initialFirst, initialLast, initialEmail) = hydrated
    var firstName by remember(member) { mutableStateOf(initialFirst) }
    var lastName by remember(member) { mutableStateOf(initialLast) }
    var email by remember(member) { mutableStateOf(initialEmail) }
    val firstNameLocked = initialFirst.isNotBlank()
    val lastNameLocked = initialLast.isNotBlank()
    val emailLocked = initialEmail.isNotBlank()
    var busy by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }
    var avatarSaved by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val canSave = run {
        val fn = firstName.trim(); val em = email.trim()
        when {
            !firstNameLocked && fn.isEmpty() -> false
            !emailLocked && em.isNotEmpty() && !em.contains("@") -> false
            !firstNameLocked || !lastNameLocked -> true
            !emailLocked -> em.isNotEmpty()
            else -> false
        }
    }

    LaunchedEffect(saved) { if (saved) { delay(1200); nav.popBackStack() } }

    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        busy = true; error = null; avatarSaved = false
        scope.launch {
            // تصغير الصورة قبل الرفع: أطول ضلع 1024 وJPEG 85٪ (نظير byPreparingThumbnail).
            val scaled = withContext(Dispatchers.IO) { epScaleImageToCache(context, uri) }
            if (scaled == null) {
                error = "تعذّر قراءة الصورة"
            } else {
                runCatching { vm.api.uploadAvatar(scaled) }
                    .onSuccess { vm.loadMemberData(); avatarSaved = true }
                    .onFailure { error = it.message ?: "تعذّر رفع الصورة" }
            }
            busy = false
        }
    }

    fun save() {
        error = null
        val fn = if (firstNameLocked) null else firstName.trim().takeIf { it.isNotEmpty() }
        val ln = if (lastNameLocked) null else lastName.trim().takeIf { it.isNotEmpty() }
        val em = if (emailLocked) null else email.trim().takeIf { it.isNotEmpty() }
        if (em != null && !em.contains("@")) { error = "صيغة البريد الإلكتروني غير صحيحة"; return }
        // الحفظ يرسل فقط الحقول غير المقفلة وغير الفارغة — ويرفض «لا تغييرات».
        if (fn == null && ln == null && em == null) { error = "لا تغييرات للحفظ"; return }
        busy = true
        scope.launch {
            runCatching {
                vm.api.memberPut("/members/profile", buildJsonObject {
                    fn?.let { put("firstName", it) }
                    ln?.let { put("lastName", it) }
                    em?.let { put("email", it) }
                })
            }
                .onSuccess { vm.loadMemberData(); saved = true }
                .onFailure { error = it.message ?: "تعذّر حفظ التغييرات" }
            busy = false
        }
    }

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(14.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
            item { BackHeader(nav, "تعديل الملف الشخصي") }
            // الصورة الشخصية — تُحفظ في نفس profileImageUrl لحساب سبق فتظهر على الويب فورًا.
            item {
                Column(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box {
                        Box(
                            Modifier.size(90.dp).clip(CircleShape).background(c.accent.copy(.14f)).border(2.dp, c.accent.copy(.35f), CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            if (!member?.avatar.isNullOrBlank()) AsyncImage(member?.avatar, member?.name, Modifier.fillMaxSize().clip(CircleShape))
                            else Text((member?.name ?: "عضو VARA").take(1), color = c.accent, fontSize = 34.sp, fontWeight = FontWeight.Bold)
                        }
                        Box(
                            Modifier.align(Alignment.BottomEnd).size(30.dp).clip(CircleShape).background(c.accent)
                                .clickable(enabled = !busy) { imagePicker.launch("image/*") },
                            contentAlignment = Alignment.Center,
                        ) { Icon(Icons.Default.CameraAlt, "تغيير الصورة", tint = Color.White, modifier = Modifier.size(14.dp)) }
                    }
                    Text("الصورة تظهر في حسابك على سبق وVARA", color = c.textFaint, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                }
            }
            if (saved || avatarSaved) {
                item {
                    EpStatusBanner(
                        Icons.Default.Check,
                        if (saved) "تم حفظ التغييرات بنجاح" else "تم تحديث الصورة الشخصية",
                        c.accent,
                    )
                }
            }
            item {
                Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    if (firstNameLocked) EpReadOnlyField("الاسم الأول", firstName, Icons.Default.Person)
                    else EpEditField("الاسم الأول", "أدخل الاسم الأول", firstName) { firstName = it }
                    if (lastNameLocked) EpReadOnlyField("اسم العائلة", lastName, Icons.Default.Person)
                    else EpEditField("اسم العائلة", "أدخل اسم العائلة", lastName) { lastName = it }
                    EpHelperRow(
                        if (firstNameLocked || lastNameLocked) "لا يمكن تعديل الاسم بعد تعيينه لاعتبارات أمنية ومصداقية التعليقات"
                        else "أضف اسمك ليظهر في عضويتك على سبق وVARA",
                    )
                    member?.phone?.takeIf { it.isNotBlank() }?.let { EpReadOnlyField("رقم الجوال", it, Icons.Default.Phone) }
                    if (emailLocked) EpReadOnlyField("البريد الإلكتروني", email, Icons.Default.Email)
                    else {
                        EpEditField("البريد الإلكتروني", "أضف بريدك الإلكتروني (اختياري)", email, KeyboardType.Email) { email = it }
                        EpHelperRow("البريد اختياري — رقم الجوال هو وسيلة الدخول الأساسية")
                    }
                }
            }
            error?.let { item { EpStatusBanner(Icons.Default.WarningAmber, it, c.live) } }
            item {
                Button(
                    { save() },
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                    enabled = canSave && !busy,
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = c.accent),
                ) { Text(if (busy) "جارٍ الحفظ…" else "حفظ التغييرات", modifier = Modifier.padding(vertical = 7.dp), fontWeight = FontWeight.Bold, fontSize = 16.sp) }
            }
        }
    }
}

/// تصغير الصورة المختارة إلى أطول ضلع 1024px وJPEG بجودة 85٪ في ملف مؤقت داخل cacheDir.
private fun epScaleImageToCache(context: Context, uri: Uri): Uri? {
    return runCatching {
        val resolver = context.contentResolver
        // قياس الأبعاد أولًا (inJustDecodeBounds يعيد null دائمًا — نقرأ outWidth/outHeight فقط).
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        val boundsStream = resolver.openInputStream(uri) ?: return null
        boundsStream.use { BitmapFactory.decodeStream(it, null, bounds) }
        val longest = maxOf(bounds.outWidth, bounds.outHeight)
        if (longest <= 0) return null
        var sample = 1
        while (longest / (sample * 2) >= 1024) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        val bitmap = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) } ?: return null
        val decodedLongest = maxOf(bitmap.width, bitmap.height)
        val finalBitmap = if (decodedLongest > 1024) {
            val scale = 1024f / decodedLongest
            Bitmap.createScaledBitmap(
                bitmap,
                (bitmap.width * scale).toInt().coerceAtLeast(1),
                (bitmap.height * scale).toInt().coerceAtLeast(1),
                true,
            )
        } else bitmap
        val file = File(context.cacheDir, "vara_avatar_upload.jpg")
        FileOutputStream(file).use { out -> finalBitmap.compress(Bitmap.CompressFormat.JPEG, 85, out) }
        if (finalBitmap !== bitmap) bitmap.recycle()
        Uri.fromFile(file)
    }.getOrNull()
}

@Composable
private fun EpEditField(label: String, placeholder: String, value: String, keyboard: KeyboardType = KeyboardType.Text, update: (String) -> Unit) {
    val c = LocalVaraColors.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, color = c.textDim, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        OutlinedTextField(
            value, update, Modifier.fillMaxWidth(),
            placeholder = { Text(placeholder, color = c.textFaint) },
            keyboardOptions = KeyboardOptions(keyboardType = keyboard),
            singleLine = true,
        )
    }
}

@Composable
private fun EpReadOnlyField(label: String, value: String, icon: ImageVector) {
    val c = LocalVaraColors.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, color = c.textDim, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        Row(
            Modifier.fillMaxWidth().clip(VaraChipShape).background(c.surface.copy(.7f)).border(1.dp, c.outline, VaraChipShape)
                .padding(horizontal = 14.dp, vertical = 13.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, null, tint = c.textFaint, modifier = Modifier.size(15.dp))
            Spacer(Modifier.width(10.dp))
            Text(value, color = c.textDim, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Icon(Icons.Default.Lock, null, tint = c.textFaint, modifier = Modifier.size(13.dp))
        }
    }
}

@Composable
private fun EpHelperRow(text: String) {
    val c = LocalVaraColors.current
    Row(verticalAlignment = Alignment.Top) {
        Icon(Icons.Default.Info, null, tint = c.textFaint, modifier = Modifier.size(13.dp).padding(top = 1.dp))
        Spacer(Modifier.width(6.dp))
        Text(text, color = c.textFaint, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, lineHeight = 16.sp)
    }
}

@Composable
private fun EpStatusBanner(icon: ImageVector, text: String, color: Color) {
    Row(
        Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(color.copy(.12f))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = color, modifier = Modifier.size(15.dp))
        Spacer(Modifier.width(8.dp))
        Text(text, color = color, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun CompleteNameScreen(nav: NavHostController, vm: VaraViewModel) {
    val c = LocalVaraColors.current
    val account by vm.account.collectAsState()
    var firstName by remember { mutableStateOf("") }
    var lastName by remember { mutableStateOf("") }
    // بوابة إلزامية — لا تُتجاوز بزر الرجوع النظامي (نظير interactiveDismissDisabled).
    androidx.activity.compose.BackHandler(enabled = account.member?.needsDisplayName == true) {}
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom))), contentAlignment = Alignment.Center) {
        VaraCard(Modifier.padding(20.dp)) {
            VaraWordmark(26)
            Spacer(Modifier.height(14.dp))
            Text("أكمل اسمك", color = c.text, style = MaterialTheme.typography.headlineSmall)
            Text("نحتاج اسم عرض قبل متابعة استخدام الحساب. لا يمكن تعديل الاسم بعد تعيينه.", color = c.textDim, fontSize = 12.sp)
            Spacer(Modifier.height(14.dp))
            OutlinedTextField(firstName, { firstName = it.take(40) }, Modifier.fillMaxWidth(), label = { Text("الاسم الأول") }, singleLine = true)
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(lastName, { lastName = it.take(40) }, Modifier.fillMaxWidth(), label = { Text("اسم العائلة (اختياري)") }, singleLine = true)
            account.member?.phone?.takeIf { it.isNotBlank() }?.let { Spacer(Modifier.height(8.dp)); Text("جوالك: $it", color = c.textFaint, fontSize = 11.sp) }
            Spacer(Modifier.height(14.dp))
            Button({ vm.completeDisplayName(firstName, lastName) { if (it) nav.popBackStack() } }, Modifier.fillMaxWidth(), enabled = firstName.trim().length >= 2 && !account.busy, colors = ButtonDefaults.buttonColors(containerColor = c.accent)) { Text(if (account.busy) "جارٍ الحفظ…" else "حفظ ومتابعة") }
            account.error?.let { Spacer(Modifier.height(8.dp)); Text(it, color = c.live, fontSize = 12.sp) }
        }
    }
}

// ═══════════════════════════════ الصفحات القانونية (نظير LegalPages) ═══════════════════════════════

private data class LegalSectionSpec(val heading: String, val text: String = "", val bullets: List<String> = emptyList())

@Composable
fun LegalScreen(nav: NavHostController, title: String) {
    val c = LocalVaraColors.current
    val context = LocalContext.current
    // العنوان المعروض «شروط الاستخدام» — مع قبول مفتاح «الشروط والأحكام» القادم من VaraApp.
    val displayTitle = if (title == "الشروط والأحكام") "شروط الاستخدام" else title
    val version = remember { acAppVersion(context) }
    val (icon, intro, sections) = when (displayTitle) {
        "عن التطبيق" -> Triple(
            Icons.Default.Info,
            "تطبيق VARA الرياضي السعودي يجمع المباريات والبطولات والتوقّعات الذكية في مكانٍ واحد — بتصميمٍ نظيف وأرقام حيّة.",
            listOf(
                LegalSectionSpec("من سبق", "تطبيق VARA أحد منتجات صحيفة سبق الإلكترونية. تدخل بعضوية سبق نفسها، وتتابع الرياضة بهوية سعودية من قلب سبق."),
                LegalSectionSpec(
                    "ما الذي يقدّمه VARA؟",
                    bullets = listOf(
                        "جدول المباريات بالتواريخ مع التنقّل الزمني السلس بين الأدوار والأيام.",
                        "مركز مباراة غنيّ: الأحداث، الإحصائيات، التشكيلات، التقييمات، والمواجهات.",
                        "«توقّع VARA» الذكي: خوارزمية ديناميكية تحسب احتمالات النتيجة من الترتيب والفورمة وأفضلية الأرض.",
                        "تنبيهات لحظية لمبارياتك وفِرقك (أهداف، بطاقات، فار، بداية ونهاية).",
                        "متابعة الفِرق والمباريات + بطاقة «مبارياتي» مع عدّاد تنازليّ حيّ.",
                    ),
                ),
                LegalSectionSpec("مصادر البيانات", "تُجمع نتائج المباريات والإحصاءات من مزوّدي بيانات رياضية متخصّصين، وقد تتأخّر أو تختلف قليلًا عن المصادر الرسمية. وتبقى توقّعات التطبيق تقديرية للمتعة والتحليل فقط."),
                LegalSectionSpec("الإصدار", "النسخة الحالية: $version."),
            ),
        )
        // متطلب Google Play: سياسة خصوصية متاحة داخل التطبيق (User Data policy).
        "سياسة الخصوصية" -> Triple(
            Icons.Default.Lock,
            "خصوصيتك أولوية. توضّح هذه السياسة ما نجمعه من بيانات وكيف نستخدمها ونحميها، وحقوقك في حذفها.",
            listOf(
                LegalSectionSpec(
                    "البيانات التي نجمعها",
                    bullets = listOf(
                        "بيانات العضوية عند التسجيل: الاسم، والبريد الإلكتروني أو رقم الجوال، وصورة الملف الاختيارية.",
                        "معرّف الجهاز ورمز الإشعارات لتوصيل التنبيهات إلى جهازك.",
                        "تفضيلاتك داخل التطبيق: الفِرق والمباريات والبطولات المتابَعة وإعدادات التنبيهات.",
                        "نشاط الاستخدام (مثل المباريات التي تفتحها) لتخصيص تجربتك واحتساب نقاط الولاء.",
                    ),
                ),
                LegalSectionSpec("كيف نستخدمها", "تُستخدم بياناتك حصريًا لتقديم الخدمة: الدخول بعضوية سبق، التنبيهات اللحظية، التوقّعات ولوحات المتصدّرين، وتخصيص المحتوى. لا نبيع بياناتك ولا نشاركها مع أطراف ثالثة لأغراض إعلانية، ولا يتضمّن التطبيق أدوات تتبّع إعلانية."),
                LegalSectionSpec("التخزين والأمان", "تنتقل بياناتك مشفّرةً عبر HTTPS، وتُحفظ بيانات جلستك على جهازك مشفّرةً بمخزن مفاتيح النظام. المباريات والفِرق المتابَعة بلا تسجيل دخول تبقى على جهازك فقط."),
                LegalSectionSpec("حقوقك والحذف", "يمكنك تعديل بياناتك أو حذف حسابك وكامل بياناتك نهائيًا في أي وقت من داخل التطبيق (حسابي ← منطقة الخطر ← حذف الحساب)، أو عبر التواصل معنا."),
                LegalSectionSpec("التواصل والنسخة الكاملة", "النسخة الكاملة من سياسة خصوصية سبق على sabq.org/privacy، وللاستفسارات تواصل معنا عبر sabq.org/contact."),
            ),
        )
        "سياسة الاستخدام" -> Triple(
            Icons.Default.VerifiedUser,
            "تنظّم هذه السياسة طريقة استخدامك لتطبيق VARA لضمان تجربة عادلة وآمنة للجميع.",
            listOf(
                LegalSectionSpec("الاستخدام المقبول", "VARA متاحٌ للاستخدام الشخصي غير التجاري. يُمنع إساءة استخدام الخدمة أو محاولة تعطيلها أو استخراج بياناتها آليًّا دون إذن."),
                LegalSectionSpec("التوقّعات للمتعة فقط", "نظام «توقّع VARA» ولوحة المتصدّرين للمنافسة والتسلية فقط — لا رهان ولا مقابل ماديّ، والنقاط رمزية ولا تمثّل قيمة نقدية."),
                LegalSectionSpec("دقّة المحتوى", "نسعى لعرض بيانات دقيقة وحيّة، لكنّنا لا نضمن خلوّها من الأخطاء أو التأخّر. القرارات المبنية على هذه البيانات تقع على مسؤوليتك."),
                LegalSectionSpec("الحساب والخصوصية", "أنت مسؤول عن الحفاظ على سرّية بيانات حسابك. تُستخدم بياناتك لتقديم الخدمة وتخصيص التنبيهات والتوقّعات، ويمكنك حذف حسابك وبياناتك في أي وقت من الإعدادات."),
                LegalSectionSpec("الإشعارات", "بتفعيلك للتنبيهات توافق على استقبال إشعارات عن مبارياتك وفِرقك. يمكنك إيقافها في أي وقت من إعدادات التطبيق أو النظام."),
            ),
        )
        else -> Triple(
            Icons.Default.Description,
            "باستخدامك تطبيق VARA فإنك توافق على الشروط التالية.",
            listOf(
                LegalSectionSpec("قبول الشروط", "يُعدّ تنزيلك أو استخدامك للتطبيق موافقةً على هذه الشروط. إن لم توافق عليها، يُرجى التوقّف عن استخدام التطبيق."),
                LegalSectionSpec("الحساب", "تلتزم بتقديم معلومات صحيحة عند إنشاء الحساب، وبعدم انتحال هويّة الغير. نحتفظ بحقّ تعليق الحسابات المخالفة."),
                LegalSectionSpec("الملكية الفكرية", "علامة VARA وتصميم التطبيق وواجهاته مملوكة لصحيفة سبق الإلكترونية. لا يجوز نسخها أو إعادة نشرها دون إذن. تبقى حقوق بيانات المباريات لمزوّديها."),
                LegalSectionSpec("حدود المسؤولية", "يُقدَّم التطبيق «كما هو» دون ضمانات. لا نتحمّل مسؤولية أي خسارة ناتجة عن انقطاع الخدمة أو أخطاء البيانات أو التوقّعات."),
                LegalSectionSpec("تعديل الشروط", "قد نحدّث هذه الشروط من وقتٍ لآخر، ويسري التعديل فور نشره داخل التطبيق."),
            ),
        )
    }
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(14.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
            item { BackHeader(nav, displayTitle) }
            // ترويسة LegalScaffold: أيقونة دائرية + عنوان + سطر تعريفي.
            item {
                Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(52.dp).clip(CircleShape).background(c.accent.copy(.12f)), contentAlignment = Alignment.Center) {
                        Icon(icon, null, tint = c.accent, modifier = Modifier.size(26.dp))
                    }
                    Text(displayTitle, color = c.text, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                    Text(intro, color = c.textDim, fontSize = 13.sp, lineHeight = 21.sp)
                }
            }
            items(sections) { section ->
                VaraCard(Modifier.padding(horizontal = 16.dp)) {
                    Text(section.heading, color = c.accent, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    if (section.text.isNotBlank()) Text(section.text, color = c.text, fontSize = 13.sp, lineHeight = 22.sp)
                    if (section.bullets.isNotEmpty()) Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        section.bullets.forEach { b ->
                            Row(verticalAlignment = Alignment.Top) {
                                Box(Modifier.padding(top = 7.dp).size(5.dp).clip(CircleShape).background(c.accent))
                                Spacer(Modifier.width(8.dp))
                                Text(b, color = c.text, fontSize = 13.sp, lineHeight = 21.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

// ═══════════════════════════════ حذف الحساب (نظير DeleteAccountView) ═══════════════════════════════

@Composable
fun DeleteAccountScreen(nav: NavHostController, vm: VaraViewModel) {
    val c = LocalVaraColors.current
    val account by vm.account.collectAsState()
    // حسابات Apple/الجوال بلا كلمة مرور تُحذف بالجلسة (امتثال 5.1.1(v)) — null نعامله كـ«يحتاج» احتياطًا.
    val needsPassword = account.member?.hasPassword ?: true
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var confirming by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    // نحدّث الملف لنعرف hasPassword بدقّة.
    LaunchedEffect(Unit) { vm.loadMemberData() }

    fun performDelete() {
        busy = true; error = null
        scope.launch {
            runCatching { vm.api.memberDelete("/members/account", body = buildJsonObject { put("password", if (needsPassword) password else "") }) }
                .onSuccess {
                    vm.clearSavedMembershipCredentials()
                    vm.logout()
                    nav.navigate(Routes.Account) { popUpTo(Routes.Account) { inclusive = true } }
                }
                .onFailure {
                    error = if ((it as? ApiFailure)?.status == 401) "كلمة المرور غير صحيحة" else it.message
                }
            busy = false
        }
    }

    // تأكيد ثانٍ قبل الحذف النهائي (نظير confirmationDialog).
    if (confirming) AlertDialog(
        onDismissRequest = { confirming = false },
        containerColor = c.surface,
        titleContentColor = c.text,
        textContentColor = c.textDim,
        title = { Text("تأكيد حذف الحساب", fontWeight = FontWeight.Bold) },
        text = { Text("سيتمّ حذف حسابك وكل بياناتك نهائيًّا ولا يمكن استرجاعها.") },
        confirmButton = { TextButton({ confirming = false; performDelete() }) { Text("حذف نهائيّ", color = c.live, fontWeight = FontWeight.Bold) } },
        dismissButton = { TextButton({ confirming = false }) { Text("إلغاء", color = c.textDim) } },
    )

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(14.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
            item { BackHeader(nav, "حذف الحساب") }
            item {
                Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(52.dp).clip(CircleShape).background(c.live.copy(.12f)), contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.WarningAmber, null, tint = c.live, modifier = Modifier.size(26.dp))
                    }
                    Text("حذف الحساب", color = c.text, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                    Text("إجراء نهائيّ لا يمكن التراجع عنه.", color = c.live, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
            // ماذا سيُحذف — بطاقة قرمزية بأربعة بنود iOS.
            item {
                Column(
                    Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(VaraCardShape)
                        .background(c.live.copy(.05f)).border(1.dp, c.live.copy(.30f), VaraCardShape).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("عند الحذف سيتمّ:", color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    listOf(
                        "حذف ملفّك الشخصي وبيانات دخولك نهائيًّا.",
                        "حذف فِرقك المتابَعة وتفضيلات التنبيهات.",
                        "حذف توقّعاتك ونقاطك في لوحة المتصدّرين.",
                        "إلغاء تسجيل أجهزتك من الإشعارات.",
                    ).forEach { line ->
                        Row(verticalAlignment = Alignment.Top) {
                            Icon(Icons.Default.Close, null, tint = c.live, modifier = Modifier.size(13.dp).padding(top = 2.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(line, color = c.text, fontSize = 13.sp, lineHeight = 20.sp)
                        }
                    }
                }
            }
            // تأكيد كلمة المرور — لأصحاب كلمة المرور فقط.
            if (needsPassword) {
                item {
                    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("أدخل كلمة المرور للتأكيد", color = c.textDim, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        OutlinedTextField(
                            password, { password = it }, Modifier.fillMaxWidth(),
                            placeholder = { Text("كلمة المرور", color = c.textFaint) },
                            visualTransformation = PasswordVisualTransformation(),
                            singleLine = true,
                        )
                    }
                }
            }
            error?.let { item { Text(it, color = c.live, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 16.dp)) } }
            item {
                Button(
                    { confirming = true },
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                    enabled = !((needsPassword && password.isEmpty()) || busy),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = c.live),
                ) { Text(if (busy) "جارٍ الحذف…" else "حذف حسابي نهائيًّا", modifier = Modifier.padding(vertical = 6.dp), fontWeight = FontWeight.Bold, fontSize = 15.sp) }
            }
        }
    }
}

// ═══════════════════════════════ التوقّعات (نظير PredictionCenterView) ═══════════════════════════════

// نماذج typed مطابقة لعقود المنصة المركزية (PredictionCoreModels في iOS).

private data class PredContest(
    val id: String,
    val contestType: String,
    val status: String,
    val locksAt: String,
    val settledAt: String?,
    val home: Team,
    val away: Team,
    val round: String,
    val venue: String,
    val predHome: Int?,
    val predAway: Int?,
    val finalHome: Int?,
    val finalAway: Int?,
    /** عدد المشاركين النشطين — رقم فقط، بلا أسماء (الأسماء في المتصدرين). */
    val entriesCount: Int = 0,
) {
    // بطاقات النتيجة لمسابقات نتيجة المباراة فقط؛ champion/top_scorer بطاقة عامة بلا عدادات.
    val isMatchScore: Boolean get() = contestType == "match_score"
    val hasEntry: Boolean get() = predHome != null && predAway != null
}

private data class PredCompetitionSummary(
    val slug: String,
    val nameAr: String,
    val seasonKey: String,
    val status: String,
    val openContests: Int,
    val myPoints: Int,
)

private data class PredLeaderRow(val rank: Int, val name: String, val points: Int, val exactCount: Int)
private data class PredBoard(val nameAr: String, val entries: List<PredLeaderRow>, val myRank: Int?, val myPoints: Int?)
private data class PredLedgerRow(val id: String, val label: String, val points: Int, val createdAt: String)

private data class PredAward(
    val points: Int,
    val reasonLabelAr: String,
    val referenceId: String,
    val poolBase: Int?,
    val poolCarriedIn: Int?,
    val tierShare: Double?,
    val tierPoints: Int?,
    val winners: Int?,
    val walletMultiplier: Double?,
    val walletPoints: Int?,
)

private fun JsonObject.predDouble(vararg keys: String): Double? = keys.firstNotNullOfOrNull { key ->
    (this[key] as? JsonPrimitive)?.contentOrNull?.toDoubleOrNull()
}

private fun parsePredContest(e: JsonElement): PredContest? {
    val o = e as? JsonObject ?: return null
    val meta = o.obj("metadata")
    val entry = o.obj("myEntry")?.obj("payload")
    val result = o.obj("result")
    return PredContest(
        id = o.string("id") ?: return null,
        contestType = o.string("contestType") ?: "match_score",
        status = o.string("status") ?: "open",
        locksAt = o.string("locksAt") ?: "",
        settledAt = o.string("settledAt"),
        home = parseTeam(meta?.get("home"), "يُحدد لاحقًا"),
        away = parseTeam(meta?.get("away"), "يُحدد لاحقًا"),
        round = meta?.string("round") ?: "",
        venue = meta?.string("venue") ?: "",
        predHome = entry?.int("predHome"),
        predAway = entry?.int("predAway"),
        finalHome = result?.int("finalHome"),
        finalAway = result?.int("finalAway"),
        entriesCount = o.int("entriesCount") ?: 0,
    )
}

private fun parsePredSummary(e: JsonElement): PredCompetitionSummary? {
    val o = e as? JsonObject ?: return null
    return PredCompetitionSummary(
        slug = o.string("slug") ?: return null,
        nameAr = o.string("nameAr", "name") ?: "بطولة",
        seasonKey = o.string("seasonKey") ?: "",
        status = o.string("status") ?: "active",
        openContests = o.int("openContests") ?: 0,
        myPoints = o.int("myPoints") ?: 0,
    )
}

private fun parsePredBoard(root: JsonElement): PredBoard? {
    val o = root as? JsonObject ?: return null
    val entries = findArray(o, "entries").mapNotNull { e ->
        val row = e as? JsonObject ?: return@mapNotNull null
        PredLeaderRow(
            rank = row.int("rank") ?: 0,
            name = row.string("name") ?: "عضو سبق",
            points = row.int("points") ?: 0,
            exactCount = row.int("exactCount") ?: 0,
        )
    }
    // لا isMe في العقد — ترتيب المستخدم يصل عبر myRank من الرد نفسه.
    val mine = o.obj("myRank")
    return PredBoard(
        nameAr = o.string("nameAr") ?: "",
        entries = entries,
        myRank = mine?.int("rank"),
        myPoints = mine?.int("points"),
    )
}

private fun parsePredLedgerRows(root: JsonElement): List<PredLedgerRow> =
    findArray(root, "items", "ledger").mapNotNull { e ->
        val o = e as? JsonObject ?: return@mapNotNull null
        PredLedgerRow(
            id = o.string("id") ?: return@mapNotNull null,
            label = o.string("reasonLabelAr", "label") ?: "نقاط توقّع",
            points = o.int("points") ?: 0,
            createdAt = o.string("createdAt") ?: "",
        )
    }

private fun parsePredAward(e: JsonElement): PredAward? {
    val o = e as? JsonObject ?: return null
    val pool = o.obj("breakdown")?.obj("pool")
    val wallet = o.obj("wallet")
    return PredAward(
        points = o.int("points") ?: 0,
        reasonLabelAr = o.string("reasonLabelAr") ?: "إصابة توقّع",
        referenceId = o.string("referenceId") ?: "",
        poolBase = pool?.int("base"),
        poolCarriedIn = pool?.int("carriedIn"),
        tierShare = pool?.predDouble("tierShare"),
        tierPoints = pool?.int("tierPoints"),
        winners = pool?.int("winners"),
        walletMultiplier = wallet?.predDouble("multiplier"),
        walletPoints = wallet?.int("walletPoints"),
    )
}

/// نص القاعدة المولّد من ملف الاحتساب الفعّال (نسب الطبقات ×100 وwinCriterion) — لا نص ثابت.
private fun predRuleSummary(rule: JsonObject?): String {
    val strategy = rule?.string("strategyKey") ?: return "تُحتسب النقاط بعد صافرة النهاية"
    val params = rule.obj("params")
    val pool = params?.int("basePool") ?: 0
    val tiers = params?.obj("tiers")
    return when (strategy) {
        "tiered_pool" -> {
            val e = ((tiers?.predDouble("exact") ?: 0.0) * 100).roundToInt()
            val m = ((tiers?.predDouble("signedMargin") ?: 0.0) * 100).roundToInt()
            val o = ((tiers?.predDouble("outcome") ?: 0.0) * 100).roundToInt()
            "جائزة المباراة $pool نقطة: $e٪ للنتيجة الدقيقة، $m٪ للفارق الصحيح، $o٪ للاتجاه — وما لا يُوزَّع يتراكم للمباراة التالية"
        }
        "shared_pool" ->
            if (params?.string("winCriterion") == "exact") "جائزة $pool نقطة تُقسم بالتساوي على أصحاب النتيجة الدقيقة"
            else "جائزة $pool نقطة تُقسم بالتساوي على من أصابوا اتجاه المباراة"
        "skill_weighted" -> "نقاط مهارية: دقة توقّعك × جرأته × سلسلة إصاباتك"
        "fixed_points" -> "نقاط ثابتة حسب دقة التوقّع"
        else -> "تُحتسب النقاط بعد صافرة النهاية"
    }
}

/// ISO → ميلي ثانية محلية (يقبل الكسور والإزاحات — نظير PredDates.parse).
private fun predParseMs(raw: String?): Long? {
    if (raw.isNullOrBlank()) return null
    return runCatching { Instant.parse(raw).toEpochMilli() }.getOrNull()
        ?: runCatching { java.time.OffsetDateTime.parse(raw).toInstant().toEpochMilli() }.getOrNull()
        ?: runCatching { java.time.LocalDateTime.parse(raw).atZone(java.time.ZoneOffset.UTC).toInstant().toEpochMilli() }.getOrNull()
}

/// «يُقفل بعد ٢س ١٤د» — عدّ تنازلي مختصر حتى الإغلاق (nil بعد الفوات).
private fun predCountdown(targetMs: Long?, nowMs: Long = System.currentTimeMillis()): String? {
    targetMs ?: return null
    val seconds = (targetMs - nowMs) / 1000L
    if (seconds <= 0) return null
    val days = seconds / 86_400
    val hours = (seconds % 86_400) / 3_600
    val minutes = (seconds % 3_600) / 60
    return when {
        days > 0 -> "يُقفل بعد ${days}ي ${hours}س"
        hours > 0 -> "يُقفل بعد ${hours}س ${minutes}د"
        else -> "يُقفل بعد ${maxOf(minutes, 1)}د"
    }
}

private fun predFmtMultiplier(value: Double): String = String.format(Locale.US, "%.1f", value)

/// ترجمة أخطاء إرسال التوقّع إلى نصوص ودّية.
private fun predSubmitError(t: Throwable): String {
    val failure = t as? ApiFailure
    val raw = failure?.message.orEmpty()
    return when {
        raw.contains("DRAW_NOT_ALLOWED") -> "التعادل غير متاح لهذه المباراة"
        raw.contains("LOCKED") -> "أُقفل التوقّع"
        failure?.status == 409 -> "تعذّر حفظ التوقّع — حدّث الشاشة وحاول مجددًا"
        else -> raw.ifBlank { "تعذّر حفظ التوقّع" }
    }
}

// ─── مركز التوقّعات: قائمة البطولات ───

@Composable
fun PredictionsScreen(nav: NavHostController, vm: VaraViewModel) {
    val c = LocalVaraColors.current
    var revision by remember { mutableIntStateOf(0) }
    var state by remember { mutableStateOf<LoadState<List<PredCompetitionSummary>>>(LoadState.Loading) }
    LaunchedEffect(revision) {
        state = runCatching {
            findArray(vm.api.memberGet("/predictions/competitions", ignoreCache = true), "competitions").mapNotNull(::parsePredSummary)
        }.fold({ LoadState.Data(it) }, { LoadState.Error(it.message ?: "تعذّر تحميل التوقّعات") })
    }
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
            item { BackHeader(nav, "التوقّعات") }
            item {
                Column(Modifier.fillMaxWidth().background(Brush.verticalGradient(listOf(c.accent, c.accentDeep))).padding(22.dp)) {
                    Icon(Icons.Default.EmojiEvents, null, tint = c.gold, modifier = Modifier.size(42.dp))
                    Text("توقّعات VARA", color = Color.White, style = MaterialTheme.typography.headlineSmall)
                    Text("توقّع نتائج مباريات البطولات وتنافس على النقاط والجوائز", color = Color.White.copy(.72f), fontSize = 11.sp)
                }
            }
            when (val s = state) {
                LoadState.Loading -> item { LoadStateHost(s, { revision++ }) {} }
                is LoadState.Error -> item { LoadStateHost(s, { revision++ }) {} }
                is LoadState.Data ->
                    if (s.value.isEmpty()) item { EmptyState("لا بطولات متاحة حاليًا", "ستظهر بطولات التوقّعات هنا فور انطلاقها") }
                    else items(s.value, key = { it.slug }) { comp ->
                        PredCompetitionCard(comp) { nav.navigate("predictions/${comp.slug}") }
                    }
            }
        }
    }
}

@Composable
private fun PredCompetitionCard(comp: PredCompetitionSummary, open: () -> Unit) {
    val c = LocalVaraColors.current
    VaraCard(Modifier.padding(horizontal = 16.dp).clickable(onClick = open)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(44.dp).background(c.gold.copy(.12f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(Icons.Default.EmojiEvents, null, tint = c.gold)
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(comp.nameAr, color = c.text, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                Text(
                    listOf(comp.seasonKey.takeIf { it.isNotBlank() }, "${comp.openContests} توقّعات مفتوحة").filterNotNull().joinToString(" · "),
                    color = c.textDim, fontSize = 11.sp,
                )
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("${comp.myPoints}", color = c.gold, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                Text("نقاطي", color = c.textFaint, fontSize = 9.sp)
            }
            Icon(Icons.Default.ChevronLeft, null, tint = c.textFaint)
        }
    }
}

// ─── شاشة البطولة: بطاقة PredHero + تبويبات المباريات/سجلّي/المتصدرون ───

private data class PredCompetitionData(
    val name: String,
    val seasonKey: String,
    val myPoints: Int,
    val openContests: Int,
    val contests: List<PredContest>,
    val board: PredBoard?,
    val ledger: List<PredLedgerRow>,
)

@Composable
fun PredictionCompetitionScreen(nav: NavHostController, vm: VaraViewModel, slug: String) {
    val c = LocalVaraColors.current
    var tab by remember { mutableIntStateOf(0) }
    var revision by remember { mutableIntStateOf(0) }
    var state by remember { mutableStateOf<LoadState<PredCompetitionData>>(LoadState.Loading) }
    LaunchedEffect(slug, revision) {
        state = runCatching {
            coroutineScope {
                val detail = async { vm.api.memberGet("/predictions/competitions/$slug", ignoreCache = true) }
                val summary = async { runCatching { vm.api.memberGet("/predictions/competitions", ignoreCache = true) }.getOrNull() }
                val board = async { runCatching { vm.api.memberGet("/predictions/leaderboards", mapOf("competition" to slug), ignoreCache = true) }.getOrNull() }
                val ledger = async { if (vm.isLoggedIn) runCatching { vm.api.memberGet("/predictions/me/ledger", mapOf("competition" to slug), ignoreCache = true) }.getOrNull() else null }
                val d = detail.await().jsonObject
                val comp = d.obj("competition")
                val contests = findArray(d, "contests").mapNotNull(::parsePredContest)
                val sum = summary.await()?.let { findArray(it, "competitions") }?.filterIsInstance<JsonObject>()
                    ?.firstOrNull { it.string("slug") == slug }?.let(::parsePredSummary)
                PredCompetitionData(
                    name = comp?.string("nameAr", "name") ?: sum?.nameAr ?: slug,
                    seasonKey = comp?.string("seasonKey") ?: sum?.seasonKey ?: "",
                    myPoints = sum?.myPoints ?: 0,
                    openContests = sum?.openContests ?: contests.count { it.status == "open" },
                    contests = contests,
                    board = board.await()?.let(::parsePredBoard),
                    ledger = ledger.await()?.let(::parsePredLedgerRows).orEmpty(),
                )
            }
        }.fold({ LoadState.Data(it) }, { LoadState.Error(it.message ?: "تعذّر تحميل البطولة") })
    }
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        when (val s = state) {
            LoadState.Loading -> Column { BackHeader(nav, "التوقّعات"); LoadStateHost(s, { revision++ }) {} }
            is LoadState.Error -> Column { BackHeader(nav, "التوقّعات"); LoadStateHost(s, { revision++ }) {} }
            is LoadState.Data -> LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
                item { BackHeader(nav, s.value.name) }
                item { PredHeroCard(s.value.name, s.value.seasonKey, s.value.myPoints, s.value.board?.myRank, s.value.openContests) }
                item { DetailTabs(listOf("المباريات", "سجلّي", "المتصدرون"), tab) { tab = it } }
                when (tab) {
                    0 -> {
                        // التجميع: مفتوحة ← مقفلة/جاهزة ← «انتهت» بالمسوّاة/الملغاة تنازليًا (10 كحد).
                        val open = s.value.contests.filter { it.status == "open" }
                        val locked = s.value.contests.filter { it.status == "locked" || it.status == "ready" }
                        val finished = s.value.contests.filter { it.status == "settled" || it.status == "void" }
                            .sortedByDescending { it.settledAt ?: "" }.take(10)
                        if (open.isEmpty() && locked.isEmpty() && finished.isEmpty()) {
                            item { EmptyState("لا مباريات متاحة للتوقّع الآن", "تُفتح التوقّعات فور إعلان جدول المباريات") }
                        } else {
                            items(open, key = { "pc-${it.id}" }) { PredContestRow(it) { nav.navigate("prediction-contest/${it.id}") } }
                            items(locked, key = { "pc-${it.id}" }) { PredContestRow(it) { nav.navigate("prediction-contest/${it.id}") } }
                            if (finished.isNotEmpty()) {
                                item {
                                    Text("انتهت", color = c.textFaint, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 21.dp, top = 6.dp))
                                }
                                items(finished, key = { "pc-${it.id}" }) { PredContestRow(it) { nav.navigate("prediction-contest/${it.id}") } }
                            }
                        }
                    }
                    1 ->
                        if (!vm.isLoggedIn) item { LoginRequired(nav, "سجّل الدخول لعرض سجل نقاطك") }
                        else if (s.value.ledger.isEmpty()) item { EmptyState("لا قيود نقاط بعد", "ستظهر نقاطك هنا فور تسوية أول مباراة توقّعتها") }
                        else items(s.value.ledger, key = { "lg-${it.id}" }) { row -> PredLedgerRowView(row) }
                    else -> {
                        val board = s.value.board
                        item {
                            Column(Modifier.padding(horizontal = 18.dp)) {
                                Text(board?.nameAr?.ifBlank { s.value.name } ?: s.value.name, color = c.text, fontSize = 13.5.sp, fontWeight = FontWeight.Bold)
                                Text("توقّعات المباريات · النقاط الأساسية دون مضاعف العضوية", color = c.textFaint, fontSize = 10.5.sp)
                            }
                        }
                        if (board?.myRank != null) item {
                            Row(
                                Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(VaraTileShape)
                                    .background(Brush.horizontalGradient(listOf(c.accent, c.accentDeep)))
                                    .padding(horizontal = 13.dp, vertical = 11.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text("ترتيبك الحالي", color = Color.White, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                                ForceLtr { Text("#${board.myRank} · ${board.myPoints ?: 0}", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold) }
                            }
                        }
                        if (board == null || board.entries.isEmpty()) item { EmptyState("لا ترتيب بعد", "تُبنى اللوحة بعد تسوية أول مباريات البطولة") }
                        else items(board.entries, key = { "lb-${it.rank}-${it.name}" }) { row -> PredLeaderRowView(row) }
                    }
                }
                item { Spacer(Modifier.height(14.dp)) }
            }
        }
    }
}

/// بطاقة البطولة الداخلية: نقاطي ذهبية + ترتيبي (#N من myRank) + المفتوحة.
@Composable
private fun PredHeroCard(name: String, seasonKey: String, myPoints: Int, myRank: Int?, openContests: Int) {
    val c = LocalVaraColors.current
    Column(
        Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(VaraCardShape)
            .background(Brush.verticalGradient(listOf(c.accent, c.accentDeep))).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(13.dp)).background(Color.White.copy(.12f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Default.EmojiEvents, null, tint = c.gold, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.width(10.dp))
            Column {
                Text(name, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                if (seasonKey.isNotBlank()) Text(seasonKey, color = Color.White.copy(.72f), fontSize = 11.5.sp)
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            // widthIn(min=0) يسمح لـweight بتقليص العرض دون فرض التفاف التسمية.
            PredHeroStat("$myPoints", "نقاطي في البطولة", gold = true, modifier = Modifier.weight(1f).widthIn(min = 0.dp))
            PredHeroStat(myRank?.let { "#$it" } ?: "—", "ترتيبي", gold = false, modifier = Modifier.weight(1f).widthIn(min = 0.dp))
            PredHeroStat("$openContests", "توقّعات مفتوحة", gold = false, modifier = Modifier.weight(1f).widthIn(min = 0.dp))
        }
    }
}

@Composable
private fun PredHeroStat(value: String, label: String, gold: Boolean, modifier: Modifier = Modifier) {
    val c = LocalVaraColors.current
    Column(
        modifier
            .clip(VaraTileShape)
            .background(Color.White.copy(.10f))
            .padding(horizontal = 6.dp, vertical = 9.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        ForceLtr {
            Text(
                value,
                color = if (gold) c.gold else Color.White,
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
            )
        }
        Text(
            label,
            color = Color.White.copy(.75f),
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            softWrap = false,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/// صف مباراة التوقّع — عرض فقط (التعديل داخل صفحة التفاصيل، نظير PredMatchRowView).
@Composable
private fun PredContestRow(contest: PredContest, open: () -> Unit) {
    val c = LocalVaraColors.current
    if (!contest.isMatchScore) {
        // مسابقات البطل/الهدّاف: بطاقة عامة تعرض حالتها بلا عدادات نتيجة.
        VaraCard(Modifier.padding(horizontal = 16.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                AcIconTile(Icons.Default.EmojiEvents, c.gold)
                Spacer(Modifier.width(10.dp))
                Text(
                    when (contest.contestType) {
                        "champion" -> "توقّع بطل البطولة"
                        "top_scorer" -> "توقّع هدّاف البطولة"
                        else -> "مسابقة خاصة"
                    },
                    color = c.text, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f),
                )
                PredStatusChip(contest)
            }
        }
        return
    }
    VaraCard(Modifier.padding(horizontal = 16.dp).clickable(onClick = open)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                RemoteLogo(contest.home.logo, contest.home.name, 26)
                Spacer(Modifier.width(7.dp))
                Text(contest.home.name, color = c.text, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            // مركز البطاقة: النتيجة النهائية للمسوّاة أو وقت الانطلاق بتوقيت الرياض للمفتوحة — لا توقّع المستخدم.
            Box(Modifier.padding(horizontal = 8.dp), contentAlignment = Alignment.Center) {
                when {
                    contest.status == "settled" && contest.finalHome != null && contest.finalAway != null ->
                        ForceLtr { Text("${contest.finalAway}–${contest.finalHome}", color = c.text, fontSize = 17.sp, fontWeight = FontWeight.Bold) }
                    predParseMs(contest.locksAt) != null ->
                        ForceLtr { Text(VaraFormat.time(Instant.ofEpochMilli(predParseMs(contest.locksAt)!!)), color = c.textDim, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
                    else -> Text("—", color = c.textFaint)
                }
            }
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.End) {
                Text(contest.away.name, color = c.text, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.width(7.dp))
                RemoteLogo(contest.away.logo, contest.away.name, 26)
            }
        }
        Spacer(Modifier.height(9.dp))
        // يمين (RTL): الجولة/العدّاد + عدد المتوقّعين رقمًا فقط — بلا أسماء أشخاص.
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                val subtitle = buildList {
                    if (contest.round.isNotBlank()) add(contest.round)
                    if (contest.status == "open") predCountdown(predParseMs(contest.locksAt))?.let(::add)
                }.joinToString(" · ")
                if (subtitle.isNotBlank()) {
                    Text(subtitle, color = c.textFaint, fontSize = 10.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Text(
                    if (contest.entriesCount > 0) "${contest.entriesCount} متوقّع" else "كن أول المتوقّعين",
                    color = c.textDim,
                    fontSize = 10.5.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            PredStatusChip(contest)
        }
    }
}

/// شارة الحالة الخمسية الملوّنة (نظير statusChip في iOS).
@Composable
private fun PredStatusChip(contest: PredContest) {
    val c = LocalVaraColors.current
    when (contest.status) {
        "open" ->
            if (contest.hasEntry) PredChip("توقّعتَ \u2066${contest.predAway}–${contest.predHome}\u2069", c.accent)
            else PredChip("توقّع الآن", c.accent, filled = true)
        "locked", "ready" -> PredChip("مقفل — بانتظار النتيجة", c.live)
        "settled" -> PredChip("احتُسبت — التفاصيل", c.gold)
        "void" -> PredChip("أُلغيت", c.textFaint)
    }
}

@Composable
private fun PredChip(text: String, color: Color, filled: Boolean = false) {
    Text(
        text,
        color = if (filled) Color.White else color,
        fontSize = 10.5.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier.clip(CircleShape).background(if (filled) color else color.copy(.14f)).padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
private fun PredLedgerRowView(row: PredLedgerRow) {
    val c = LocalVaraColors.current
    Row(
        Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(VaraTileShape).background(c.surface).padding(horizontal = 13.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(row.label, color = c.text, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
            Text(
                predParseMs(row.createdAt)?.let { VaraFormat.dayMonthLabel(Instant.ofEpochMilli(it)) } ?: row.createdAt.take(10),
                color = c.textFaint, fontSize = 10.5.sp,
            )
        }
        Text(
            if (row.points >= 0) "+${row.points}" else "${row.points}",
            color = if (row.points >= 0) c.accent else c.live, fontSize = 14.sp, fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun PredLeaderRowView(row: PredLeaderRow) {
    val c = LocalVaraColors.current
    Row(
        Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(VaraTileShape).background(c.surface).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("${row.rank}", color = if (row.rank <= 3) c.gold else c.textFaint, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(22.dp))
        Box(Modifier.size(30.dp).clip(CircleShape).background(c.accent.copy(.13f)), contentAlignment = Alignment.Center) {
            Text(row.name.take(1), color = c.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f)) {
            Text(row.name, color = c.text, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${row.exactCount} نتيجة دقيقة", color = c.textFaint, fontSize = 10.sp)
        }
        Text("${row.points}", color = c.accent, fontSize = 13.5.sp, fontWeight = FontWeight.Bold)
    }
}

// ─── تفاصيل مسابقة التوقّع ───

private data class PredContestDetailData(
    val contest: PredContest,
    val ruleSummary: String,
    val awards: List<PredAward>,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PredictionContestDetailScreen(nav: NavHostController, vm: VaraViewModel, contestId: String) {
    val c = LocalVaraColors.current
    val scope = rememberCoroutineScope()
    var revision by remember { mutableIntStateOf(0) }
    var state by remember { mutableStateOf<LoadState<PredContestDetailData>>(LoadState.Loading) }
    var homeScore by remember { mutableIntStateOf(0) }
    var awayScore by remember { mutableIntStateOf(0) }
    var submitting by remember { mutableStateOf(false) }
    var justSaved by remember { mutableStateOf(false) }
    var submitError by remember { mutableStateOf<String?>(null) }
    var showBreakdown by remember { mutableStateOf(false) }

    LaunchedEffect(contestId, revision) {
        state = runCatching {
            val root = vm.api.memberGet("/predictions/contests/$contestId", ignoreCache = true).jsonObject
            val contest = parsePredContest(root) ?: error("تعذّر تحميل المسابقة")
            val awards = if (contest.status == "settled") {
                runCatching { vm.api.memberGet("/predictions/contests/$contestId/settlement", ignoreCache = true).jsonObject }.getOrNull()
                    ?.let { findArray(it, "myAwards", "awards").mapNotNull(::parsePredAward) }.orEmpty()
            } else emptyList()
            PredContestDetailData(contest, predRuleSummary(root.obj("rule")), awards)
        }.fold({ data ->
            homeScore = data.contest.predHome ?: 0
            awayScore = data.contest.predAway ?: 0
            LoadState.Data(data)
        }, { LoadState.Error(it.message ?: "تعذّر تحميل المسابقة") })
    }

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        when (val s = state) {
            LoadState.Loading -> Column { BackHeader(nav, "التوقّع"); LoadStateHost(s, { revision++ }) {} }
            is LoadState.Error -> Column { BackHeader(nav, "التوقّع"); LoadStateHost(s, { revision++ }) {} }
            is LoadState.Data -> {
                val detail = s.value
                val contest = detail.contest
                val award = detail.awards.firstOrNull()
                if (showBreakdown) ModalBottomSheet(onDismissRequest = { showBreakdown = false }, containerColor = c.surface) {
                    PredBreakdownContent(award)
                }
                LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(bottom = 28.dp)) {
                    item { BackHeader(nav, "${contest.home.name} × ${contest.away.name}") }
                    item { PredDetailHero(contest) }
                    when (contest.status) {
                        "open" -> item {
                            VaraCard(Modifier.padding(horizontal = 16.dp)) {
                                // شريط القاعدة المولّد من ملف الاحتساب الفعّال.
                                Text(
                                    detail.ruleSummary, color = c.accent, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, lineHeight = 18.sp,
                                    modifier = Modifier.fillMaxWidth().clip(VaraChipShape).background(c.accent.copy(.10f)).padding(12.dp),
                                )
                                Spacer(Modifier.height(14.dp))
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
                                    PredScoreStepper(contest.home.name, homeScore) { homeScore = it }
                                    Text("-", color = c.textFaint, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                                    PredScoreStepper(contest.away.name, awayScore) { awayScore = it }
                                }
                                Spacer(Modifier.height(14.dp))
                                Button(
                                    {
                                        if (!vm.isLoggedIn) { nav.navigate(Routes.Login); return@Button }
                                        submitting = true; submitError = null
                                        scope.launch {
                                            runCatching {
                                                vm.api.memberPut(
                                                    "/predictions/contests/$contestId/entry",
                                                    buildJsonObject { put("prediction", buildJsonObject { put("predHome", homeScore); put("predAway", awayScore) }) },
                                                )
                                            }
                                                .onSuccess { justSaved = true; scope.launch { delay(1800); justSaved = false } }
                                                .onFailure { submitError = predSubmitError(it) }
                                            submitting = false
                                        }
                                    },
                                    Modifier.fillMaxWidth(), enabled = !submitting,
                                    shape = RoundedCornerShape(16.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = c.accent),
                                ) {
                                    Text(
                                        when {
                                            submitting -> "جارٍ الحفظ…"
                                            justSaved -> "تم الحفظ ✓"
                                            else -> "تأكيد التوقّع \u2066$awayScore–$homeScore\u2069"
                                        },
                                        modifier = Modifier.padding(vertical = 4.dp), fontWeight = FontWeight.Bold,
                                    )
                                }
                                submitError?.let {
                                    Spacer(Modifier.height(8.dp))
                                    Text(it, color = c.live, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
                                }
                                Spacer(Modifier.height(8.dp))
                                Text(
                                    predCountdown(predParseMs(contest.locksAt))?.let { "$it · يمكنك التعديل حتى ضربة البداية" }
                                        ?: "يُقفل التوقّع عند ضربة البداية",
                                    color = c.textFaint, fontSize = 10.5.sp,
                                )
                            }
                        }
                        "locked", "ready" -> item {
                            // مقفلة: تفرقة «توقّعك مقفل» عن «أُقفلت — لم تشارك».
                            Row(
                                Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(VaraTileShape).background(c.surface).padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(Icons.Default.Lock, null, tint = c.textDim, modifier = Modifier.size(15.dp))
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    if (contest.hasEntry) "توقّعك \u2066${contest.predAway}–${contest.predHome}\u2069 مقفل — بانتظار صافرة النهاية"
                                    else "أُقفلت التوقّعات — لم تشارك في هذه المباراة",
                                    color = if (contest.hasEntry) c.text else c.textDim, fontSize = 12.5.sp, fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                        "settled" -> {
                            if (contest.hasEntry) item {
                                Row(Modifier.padding(horizontal = 16.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                    Text("توقّعتَ \u2066${contest.predAway}–${contest.predHome}\u2069", color = c.textDim, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                                    if (award != null) {
                                        Text(
                                            "🎯 ${award.reasonLabelAr}",
                                            color = c.gold, fontSize = 11.5.sp, fontWeight = FontWeight.Bold,
                                            modifier = Modifier.clip(CircleShape).background(c.gold.copy(.15f)).padding(horizontal = 11.dp, vertical = 5.dp),
                                        )
                                    } else {
                                        Text("لم تُصب هذه المرة", color = c.textFaint, fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                            if (award != null) {
                                // البطاقة المزدوجة: نقاط الترتيب مقابل مكافأة المحفظة (×N عضوية).
                                item {
                                    Row(Modifier.padding(horizontal = 16.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        PredPointsHalf("+${award.points}", "نقاط البطولة → الترتيب", c.accent, Modifier.weight(1f))
                                        if (award.walletPoints != null && award.walletMultiplier != null) {
                                            PredPointsHalf("+${award.walletPoints}", "محفظتك (×${predFmtMultiplier(award.walletMultiplier)} عضوية)", c.gold, Modifier.weight(1f))
                                        }
                                    }
                                }
                                item {
                                    Row(
                                        Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(VaraTileShape).background(c.accent.copy(.10f))
                                            .clickable { showBreakdown = true }.padding(14.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Icon(Icons.Default.Help, null, tint = c.accent, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(8.dp))
                                        Text("كيف حُسبت نقاطي؟", color = c.accent, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                                        Icon(Icons.Default.ChevronLeft, null, tint = c.accent, modifier = Modifier.size(14.dp))
                                    }
                                }
                            } else if (!contest.hasEntry) {
                                item { EmptyState("لم تشارك في هذه المباراة", "توقّع المباريات القادمة لتجمع النقاط") }
                            }
                        }
                        "void" -> item { EmptyState("أُلغيت هذه المباراة", "لا نقاط ولا خسارة — توقّعك لم يدخل الاحتساب") }
                        else -> item { EmptyState("حالة التوقّع غير متاحة") }
                    }
                }
            }
        }
    }
}

@Composable
private fun PredDetailHero(contest: PredContest) {
    val c = LocalVaraColors.current
    VaraCard(Modifier.padding(horizontal = 16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                RemoteLogo(contest.home.logo, contest.home.name, 44)
                Text(contest.home.name, color = c.text, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Box(Modifier.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                val lockMs = predParseMs(contest.locksAt)
                when {
                    contest.status == "settled" && contest.finalHome != null && contest.finalAway != null ->
                        ForceLtr { Text("${contest.finalAway}–${contest.finalHome}", color = c.text, fontSize = 26.sp, fontWeight = FontWeight.Bold) }
                    lockMs != null -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        ForceLtr { Text(VaraFormat.time(Instant.ofEpochMilli(lockMs)), color = c.text, fontSize = 18.sp, fontWeight = FontWeight.Bold) }
                        Text(VaraFormat.dayMonthLabel(Instant.ofEpochMilli(lockMs)), color = c.textFaint, fontSize = 10.5.sp)
                    }
                    else -> Text("—", color = c.textFaint)
                }
            }
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                RemoteLogo(contest.away.logo, contest.away.name, 44)
                Text(contest.away.name, color = c.text, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        val caption = listOf(contest.round, contest.venue).filter(String::isNotBlank).joinToString(" · ")
        if (caption.isNotBlank()) {
            Spacer(Modifier.height(8.dp))
            Text(caption, color = c.textFaint, fontSize = 11.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
        }
    }
}

/// عدّاد النتيجة: اسم الفريق فوق بلاطة 62×62 وزرّا ± دائريان (نظير stepper في iOS).
@Composable
private fun PredScoreStepper(team: String, value: Int, update: (Int) -> Unit) {
    val c = LocalVaraColors.current
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(team, color = c.textDim, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        Box(Modifier.size(62.dp).clip(VaraTileShape).background(c.chip), contentAlignment = Alignment.Center) {
            Text("$value", color = c.text, fontSize = 28.sp, fontWeight = FontWeight.Bold)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            // ‏44dp هدف لمس + وصف TalkBack — «−/+» وحدهما لا يوضحان الفعل ولا الفريق.
            Box(
                Modifier.size(44.dp).clip(CircleShape).background(c.accent.copy(.12f))
                    .clickable(onClickLabel = "إنقاص توقّع $team") { if (value > 0) update(value - 1) }
                    .semantics { contentDescription = "إنقاص توقّع $team" },
                contentAlignment = Alignment.Center,
            ) { Text("−", color = c.accent, fontSize = 18.sp, fontWeight = FontWeight.Bold) }
            Box(
                Modifier.size(44.dp).clip(CircleShape).background(c.accent.copy(.12f))
                    .clickable(onClickLabel = "زيادة توقّع $team") { if (value < 20) update(value + 1) }
                    .semantics { contentDescription = "زيادة توقّع $team" },
                contentAlignment = Alignment.Center,
            ) { Text("+", color = c.accent, fontSize = 18.sp, fontWeight = FontWeight.Bold) }
        }
    }
}

@Composable
private fun PredPointsHalf(value: String, label: String, tint: Color, modifier: Modifier = Modifier) {
    Column(modifier.clip(VaraTileShape).background(tint.copy(.11f)).padding(12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        ForceLtr { Text(value, color = tint, fontSize = 19.sp, fontWeight = FontWeight.Bold) }
        Text(label, color = tint.copy(.85f), fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
    }
}

/// «كيف حُسبت نقاطي؟» — أربع خطوات مرقّمة بنفس أرقام سجل الخادم + مرجع الدعم.
@Composable
private fun PredBreakdownContent(award: PredAward?) {
    val c = LocalVaraColors.current
    Column(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("كيف حُسبت نقاطي؟", color = c.text, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        if (award == null) {
            EmptyState("لا نقاط في هذه المباراة", "لم يدخل توقّعك ضمن الفئات الفائزة")
        } else {
            val steps = buildList {
                if (award.poolBase != null) {
                    val carried = award.poolCarriedIn ?: 0
                    add(
                        "جائزة المباراة ${award.poolBase + carried} نقطة" +
                            if (carried > 0) " (${award.poolBase} أساس + $carried مُرحّلة)" else "",
                    )
                    if (award.tierShare != null && award.tierPoints != null) {
                        add("حصة فئة «${award.reasonLabelAr}» ${(award.tierShare * 100).roundToInt()}٪ = ${award.tierPoints * (award.winners ?: 1)} نقطة")
                    }
                    if (award.winners != null) add("تقاسمها ${award.winners} فائزًا → ${award.points} نقطة في ترتيب البطولة")
                } else {
                    add("حصلت على ${award.points} نقطة — ${award.reasonLabelAr}")
                }
                if (award.walletPoints != null && award.walletMultiplier != null) {
                    add("مضاعف عضويتك ×${predFmtMultiplier(award.walletMultiplier)} → ${award.walletPoints} نقطة أُودعت في محفظتك")
                }
            }
            steps.forEachIndexed { i, text ->
                Row(verticalAlignment = Alignment.Top) {
                    Box(Modifier.size(22.dp).clip(CircleShape).background(c.accent.copy(.13f)), contentAlignment = Alignment.Center) {
                        Text("${i + 1}", color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(10.dp))
                    Text(text, color = c.text, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, lineHeight = 19.sp)
                }
            }
            if (award.referenceId.isNotBlank()) {
                Text(
                    "رقم مرجعي للدعم: ${award.referenceId.take(8).uppercase()}",
                    color = c.textFaint, fontSize = 10.5.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun LoginRequired(nav: NavHostController, message: String) {
    val c = LocalVaraColors.current
    VaraCard(Modifier.padding(horizontal = 16.dp)) {
        EmptyState(message)
        Button(
            { nav.navigate(Routes.Login) }, Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.buttonColors(containerColor = c.accent),
        ) { Text("تسجيل الدخول", fontWeight = FontWeight.Bold) }
    }
}
