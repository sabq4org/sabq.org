package com.sabq.vara.ui

import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material.icons.filled.Stadium
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.LayoutDirection
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.sabq.vara.core.VaraViewModel
import kotlinx.coroutines.launch

object Routes {
    const val Matches = "matches"
    const val Roshn = "roshn"
    const val Competitions = "competitions"
    const val World = "world"
    const val Account = "account"
    const val Match = "match/{id}"
    const val Competition = "competition/{slug}"
    const val CompetitionMatches = "competition/{slug}/matches"
    const val Team = "team/{id}"
    const val Player = "player/{id}"
    const val Transfers = "transfers"
    const val TransferStory = "transfer-story/{id}"
    const val Search = "search"
    const val ForYou = "for-you"
    const val Predictions = "predictions"
    const val PredictionCompetition = "predictions/{slug}"
    const val PredictionContest = "prediction-contest/{id}"
    const val Login = "login"
    const val Alerts = "alerts"
    const val EditProfile = "edit-profile"
    const val About = "about"
    const val Terms = "terms"
    const val Usage = "usage"
    const val DeleteAccount = "delete-account"
    const val CompleteName = "complete-name"
}

private data class Tab(val route: String, val label: String, val icon: ImageVector)
private val tabs = listOf(
    Tab(Routes.Matches, "المباريات", Icons.Default.SportsSoccer),
    Tab(Routes.Roshn, "فريقي", Icons.Default.Shield),
    Tab(Routes.Competitions, "البطولات", Icons.Default.Stadium),
    Tab(Routes.World, "عالمية", Icons.Default.Public),
    Tab(Routes.Account, "حسابي", Icons.Default.AccountCircle),
)

@Composable
fun VaraApp(link: Uri?, onLinkConsumed: () -> Unit, vm: VaraViewModel = viewModel()) {
    val account by vm.account.collectAsState()
    // طلب إذن الإشعارات تلقائيًا بعد الدخول (نظير enablePushNotifications بعد
    // loadUserData في iOS) — لا ينتظر فتح شاشة التنبيهات.
    val context = androidx.compose.ui.platform.LocalContext.current
    val wantsPermission by vm.wantsNotificationPermission.collectAsState()
    val permissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission(),
    ) { vm.notificationPermissionRequested() }
    LaunchedEffect(wantsPermission, account.onboardingSeen) {
        if (wantsPermission && account.onboardingSeen) {
            val needsRuntime = android.os.Build.VERSION.SDK_INT >= 33 &&
                androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
            if (needsRuntime) permissionLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
            else vm.notificationPermissionRequested()
        }
    }
    VaraTheme(account.theme, account.accentId) {
        CompositionLocalProvider(LocalLayoutDirection provides if (account.language == "ar") LayoutDirection.Rtl else LayoutDirection.Ltr) {
            if (!account.onboardingSeen) {
                Onboarding(onFinish = vm::completeOnboarding)
                return@CompositionLocalProvider
            }
            val nav = rememberNavController()
            LaunchedEffect(link) {
                link?.let { resolveDeepLink(it)?.let(nav::navigate); onLinkConsumed() }
            }
            VaraNavigation(nav, vm)
        }
    }
}

@Composable
private fun VaraNavigation(nav: NavHostController, vm: VaraViewModel) {
    val account by vm.account.collectAsState()
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val isRoot = tabs.any { it.route == route }
    val c = LocalVaraColors.current
    // إخفاء شريط التبويب عند التمرير للقراءة (نظير SpTabBarVisibility / autoHideTabBar في iOS).
    var bottomBarVisible by remember { mutableStateOf(true) }
    LaunchedEffect(route) { if (isRoot) bottomBarVisible = true }
    LaunchedEffect(account.member?.needsDisplayName) {
        if (account.member?.needsDisplayName == true && route != Routes.CompleteName) nav.navigate(Routes.CompleteName) { launchSingleTop = true }
    }
    val tabBarScroll = remember(isRoot) {
        object : NestedScrollConnection {
            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                if (!isRoot) return Offset.Zero
                // available.y < 0 → المستخدم يمرّر للأعلى (قراءة) → أخفِ
                // available.y > 0 → يمرّر للأسفل → أظهِر
                when {
                    available.y > 8f -> bottomBarVisible = true
                    available.y < -8f -> bottomBarVisible = false
                }
                return Offset.Zero
            }
        }
    }
    Scaffold(
        containerColor = c.screenBottom,
        bottomBar = {
            AnimatedVisibility(
                visible = isRoot && bottomBarVisible,
                enter = slideInVertically(animationSpec = tween(250)) { it } + fadeIn(tween(250)),
                exit = slideOutVertically(animationSpec = tween(250)) { it } + fadeOut(tween(250)),
            ) {
                // شريط تنقّل واضح عن محتوى الصفحة: ظل خفيف + خط علوي بلون المحور + سطح مرتفع.
                Column(
                    Modifier
                        .shadow(elevation = 14.dp, spotColor = Color.Black.copy(alpha = 0.18f), ambientColor = Color.Black.copy(alpha = 0.10f))
                        .background(c.surfaceRaised),
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(3.dp)
                            .background(
                                Brush.horizontalGradient(
                                    listOf(c.accent.copy(alpha = 0.25f), c.accent.copy(alpha = 0.85f), c.accent.copy(alpha = 0.25f)),
                                ),
                            ),
                    )
                    NavigationBar(containerColor = c.surfaceRaised, tonalElevation = 0.dp) {
                        tabs.forEach { tab ->
                            val selected = route == tab.route
                            NavigationBarItem(
                                selected = selected,
                                onClick = {
                                    bottomBarVisible = true
                                    nav.navigate(tab.route) {
                                        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                        launchSingleTop = true; restoreState = true
                                    }
                                },
                                icon = { Icon(tab.icon, tab.label) },
                                label = { Text(tab.label, fontSize = 10.sp) },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = c.accent,
                                    selectedTextColor = c.accent,
                                    indicatorColor = c.accent.copy(alpha = .16f),
                                    unselectedIconColor = c.textDim,
                                    unselectedTextColor = c.textDim,
                                ),
                            )
                        }
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            nav,
            startDestination = Routes.Matches,
            modifier = Modifier
                .padding(padding)
                .then(if (isRoot) Modifier.nestedScroll(tabBarScroll) else Modifier),
        ) {
            composable(Routes.Matches) { MatchesScreen(nav, vm) }
            composable(Routes.Roshn) { RoshnScreen(nav, vm) }
            composable(Routes.Competitions) { CompetitionsScreen(nav, vm) }
            composable(Routes.World) { WorldLiveScreen(nav, vm) }
            composable(Routes.Account) { AccountScreen(nav, vm) }
            composable(Routes.Match) { MatchScreen(nav, vm, it.arguments?.getString("id")?.toIntOrNull() ?: 0) }
            composable(Routes.Competition) { CompetitionScreen(nav, vm, it.arguments?.getString("slug").orEmpty()) }
            // «بقية المباريات (N)» من مركز المباريات — يفتح البطولة على تبويب المباريات.
            composable(Routes.CompetitionMatches) { CompetitionScreen(nav, vm, it.arguments?.getString("slug").orEmpty(), initialTab = 1) }
            composable(Routes.Team) { TeamScreen(nav, vm, it.arguments?.getString("id")?.toIntOrNull() ?: 0) }
            composable(Routes.Player) { PlayerScreen(nav, vm, it.arguments?.getString("id")?.toIntOrNull() ?: 0) }
            composable(Routes.Transfers) { TransfersScreen(nav, vm) }
            composable(Routes.TransferStory) { TransferStoryScreen(nav, vm, it.arguments?.getString("id")?.toIntOrNull() ?: 0) }
            composable(Routes.Search) { SearchScreen(nav, vm) }
            composable(Routes.ForYou) { ForYouScreen(nav, vm) }
            composable(Routes.Predictions) { PredictionsScreen(nav, vm) }
            composable(Routes.PredictionCompetition) { PredictionCompetitionScreen(nav, vm, it.arguments?.getString("slug").orEmpty()) }
            composable(Routes.PredictionContest) { PredictionContestDetailScreen(nav, vm, it.arguments?.getString("id").orEmpty()) }
            composable(Routes.Login) { LoginScreen(nav, vm) }
            composable(Routes.Alerts) { AlertsScreen(nav, vm) }
            composable(Routes.EditProfile) { EditProfileScreen(nav, vm) }
            composable(Routes.About) { LegalScreen(nav, "عن التطبيق") }
            composable(Routes.Terms) { LegalScreen(nav, "الشروط والأحكام") }
            composable(Routes.Usage) { LegalScreen(nav, "سياسة الاستخدام") }
            composable(Routes.DeleteAccount) { DeleteAccountScreen(nav, vm) }
            composable(Routes.CompleteName) { CompleteNameScreen(nav, vm) }
            // صفحتا «الكل» من شاشة روشن: الترتيب الكامل والهدّافون/الصنّاع.
            composable(RoshnStandingsRoute) { RoshnStandingsScreen(nav, vm) }
            composable(RoshnScorersRoute) { RoshnScorersScreen(nav, vm) }
        }
    }
}

private fun resolveDeepLink(uri: Uri): String? {
    val segments = uri.pathSegments
    return when {
        uri.host == "roshn" -> Routes.Roshn
        uri.host == "account" -> Routes.Account
        uri.host == "predictions" -> Routes.Predictions
        uri.host == "match" || segments.firstOrNull() == "match" -> segments.lastOrNull()?.toIntOrNull()?.let { "match/$it" }
        uri.host == "team" || segments.take(2) == listOf("sports", "team") -> segments.lastOrNull()?.toIntOrNull()?.let { "team/$it" }
        uri.host == "player" || segments.take(2) == listOf("sports", "player") -> segments.lastOrNull()?.toIntOrNull()?.let { "player/$it" }
        segments.firstOrNull() == "roshn" -> Routes.Roshn
        segments.take(2) == listOf("sports", "match") -> segments.getOrNull(2)?.toIntOrNull()?.let { "match/$it" }
        else -> null
    }
}

@Composable
private fun Onboarding(onFinish: () -> Unit) {
    val c = LocalVaraColors.current
    // الأيقونات مكافئات Material لرموز iOS: soccerball / sparkles / bell.badge.fill.
    val pages = listOf(
        Triple(Icons.Default.SportsSoccer, "كل المباريات في مكان واحد", "جدول موحّد لكل البطولات، ومركز مباراة غنيّ بالأحداث والإحصائيات والتشكيلات والتقييمات."),
        Triple(Icons.Default.AutoAwesome, "توقّع VARA الذكي", "خوارزمية ديناميكية تحسب احتمالات النتيجة من الترتيب والفورمة وأفضلية الأرض — ونافس على لوحة المتصدّرين."),
        Triple(Icons.Default.NotificationsActive, "تابع فريقك ولا تفوّت لحظة", "تنبيهات فورية للأهداف والبطاقات وحالات الفار، وبطاقة «مبارياتي» بعدّاد تنازليّ حيّ."),
    )
    val pager = rememberPagerState(pageCount = { pages.size + 1 })
    val scope = rememberCoroutineScope()
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        Column(Modifier.fillMaxSize().padding(top = 34.dp, bottom = 24.dp)) {
            Text(
                "تخطّي",
                color = c.textDim,
                modifier = Modifier
                    .padding(horizontal = 20.dp)
                    .align(Alignment.Start)
                    .clickable(onClick = onFinish)
                    .padding(vertical = 10.dp),
                fontWeight = FontWeight.SemiBold,
            )
            HorizontalPager(pager, modifier = Modifier.weight(1f)) { page ->
                Column(Modifier.fillMaxSize().padding(horizontal = 30.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Box(Modifier.size(178.dp).border(2.dp, c.accent.copy(.25f), CircleShape), contentAlignment = Alignment.Center) {
                        Box(Modifier.size(150.dp).background(c.accent.copy(.12f), CircleShape), contentAlignment = Alignment.Center) {
                            if (page == 0) VaraWordmark(44) else Icon(pages[page - 1].first, null, tint = c.accent, modifier = Modifier.size(64.dp))
                        }
                    }
                    Spacer(Modifier.size(24.dp))
                    Text(if (page == 0) "مرحبًا بك في VARA" else pages[page - 1].second, color = c.text, fontSize = 26.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                    Spacer(Modifier.size(10.dp))
                    Text(if (page == 0) "دقّة الرياضة في راحة يدك — مباريات، بطولات، وتوقّعات ذكية في تطبيق واحد." else pages[page - 1].third, color = c.textDim, textAlign = TextAlign.Center, fontSize = 15.sp, lineHeight = 24.sp)
                    if (page == 0) {
                        Spacer(Modifier.size(18.dp))
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            Text("أحد منتجات", color = c.textFaint, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Box(Modifier.width(1.dp).height(12.dp).background(c.outline))
                            Text("صحيفة سبق", color = c.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                repeat(pages.size + 1) { i -> Box(Modifier.padding(3.dp).size(if (i == pager.currentPage) 22.dp else 7.dp, 7.dp).background(if (i == pager.currentPage) c.accent else c.outline, CircleShape)) }
            }
            Spacer(Modifier.size(18.dp))
            Button(
                onClick = { if (pager.currentPage == pages.size) onFinish() else scope.launch { pager.animateScrollToPage(pager.currentPage + 1) } },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                colors = ButtonDefaults.buttonColors(containerColor = c.accent),
            ) { Text(if (pager.currentPage == pages.size) "ابدأ الآن" else "التالي", modifier = Modifier.padding(vertical = 7.dp)) }
        }
    }
}
