package com.sabq.smart.nav

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.sabq.smart.feature.article.ArticleDetailScreen
import com.sabq.smart.feature.auth.LoginScreen
import com.sabq.smart.feature.auth.CompleteNameScreen
import com.sabq.smart.feature.auth.SmartSignUpScreen
import com.sabq.smart.feature.auth.AuthViewModel
import com.sabq.smart.feature.bookmarks.BookmarksScreen
import com.sabq.smart.feature.brief.DailyBriefScreen
import com.sabq.smart.feature.brief.InterestsPickerScreen
import com.sabq.smart.feature.calendar.CalendarScreen
import com.sabq.smart.feature.explore.ExploreScreen
import com.sabq.smart.feature.keyword.KeywordArticlesScreen
import com.sabq.smart.feature.author.AuthorArticlesScreen
import com.sabq.smart.feature.home.HomeFeedScreen
import com.sabq.smart.feature.live.MomentByMomentScreen
import com.sabq.smart.feature.livecoverage.LiveCoverageScreen
import com.sabq.smart.feature.loyalty.LoyaltyAccountScreen
import com.sabq.smart.feature.loyalty.LoyaltyHistoryScreen
import com.sabq.smart.feature.loyalty.LoyaltyRewardsScreen
import com.sabq.smart.feature.notifications.EditorialNotificationDetailScreen
import com.sabq.smart.feature.notifications.EditorialNotificationsScreen
import com.sabq.smart.feature.notifications.NotificationPreferencesScreen
import com.sabq.smart.feature.onboarding.OnboardingScreen
import com.sabq.smart.feature.opinions.OpinionsListScreen
import com.sabq.smart.feature.trending.TrendingScreen
import com.sabq.smart.feature.settings.ArticleSubmissionKind
import com.sabq.smart.feature.settings.ArticleSubmissionScreen
import com.sabq.smart.feature.settings.ChangePasswordScreen
import com.sabq.smart.feature.settings.ContactScreen
import com.sabq.smart.feature.settings.DeleteAccountScreen
import com.sabq.smart.feature.settings.EditProfileScreen
import com.sabq.smart.feature.settings.ForgotPasswordScreen
import com.sabq.smart.feature.settings.NewsletterScreen
import com.sabq.smart.feature.settings.PrivacyPolicyScreen
import com.sabq.smart.feature.settings.SettingsScreen
import com.sabq.smart.feature.settings.SettingsViewModel
import com.sabq.smart.feature.settings.TermsOfUseScreen
import com.sabq.smart.ui.components.SabqTabBar
import com.sabq.smart.ui.theme.SabqTheme

/**
 * App routes — one per visible tab plus the inner article detail.
 * Tab routes (Home/Explore/Bookmarks/Profile) are sibling top-level
 * destinations; ArticleDetail is a child route reachable from any
 * tab and hides the floating tab bar while active (full-screen
 * reading), matching iOS behaviour.
 */
object SabqRoutes {
    const val Home = "home"
    const val Explore = "explore"
    const val Bookmarks = "bookmarks"
    const val Profile = "profile"
    const val ArticleDetail = "article/{slug}"
    const val Login = "auth/login"
    const val SmartSignUp = "auth/signup-smart"
    const val Loyalty = "loyalty"
    const val LoyaltyHistory = "loyalty/history"
    const val LoyaltyRewards = "loyalty/rewards"
    // «سبق بلس» — معاينة داخلية لمسؤول المنصة، و«بطاقتي الصحفية».
    const val SabqPlus = "plus"
    const val PressCard = "press-card"
    // مسودات الكاتب — قائمة المراجعات ومحرر إعادة الإرسال
    const val Revisions = "revisions"
    const val RevisionEditor = "revisions/{id}"
    fun revisionEditor(id: String): String = "revisions/${android.net.Uri.encode(id)}"
    const val Opinions = "opinions"
    const val Trending = "trending"
    const val DailyBrief = "brief"
    const val InterestsPicker = "interests/picker"
    const val MomentByMoment = "live/updates"
    const val LiveCoverage = "live/coverage"
    const val Calendar = "calendar"
    const val Notifications = "notifications"
    const val NotificationDetail = "notifications/{id}"
    const val NotificationPreferences = "notifications/preferences"
    const val Survey = "survey/{token}"
    const val EditProfile = "account/edit"
    const val ChangePassword = "account/change-password"
    const val ForgotPassword = "account/forgot-password"
    const val DeleteAccount = "account/delete"
    const val Contact = "support/contact"
    const val Newsletter = "support/newsletter"
    const val PrivacyPolicy = "legal/privacy"
    const val TermsOfUse = "legal/terms"
    const val SubmitOpinion = "submit/opinion"
    const val SubmitNews = "submit/news"
    const val KeywordArticles = "keyword/{keyword}"
    const val CategoryArticles = "category/{slug}/{name}"
    const val AuthorArticles = "author/{name}"
    const val AudioNewsletters = "audio-newsletters"
    // Phase 5 routes — dedicated iOS-equivalent destinations that
    // weren't previously reachable from Android nav.
    const val Search = "search"
    const val Sections = "sections"
    const val ContributorDashboard = "dashboard/contributor"
    const val WorldCup = "world-cup"
    const val WorldCupMatch = "world-cup/match/{id}"
    const val WorldCupTeam = "world-cup/team/{id}?name={name}&logo={logo}"
    const val WorldCupPredictions = "world-cup/predictions"
    const val Predictions = "predictions"
    const val GulfCup = "gulf-cup"
    const val GulfCupMatch = "gulf-cup/match/{id}"
    const val GulfCupTeam = "gulf-cup/team/{id}?name={name}&logo={logo}"
    const val AsianCup = "asian-cup"
    const val AsianCupMatch = "asian-cup/match/{id}"
    const val AsianCupTeam = "asian-cup/team/{id}"
    const val Roshn = "roshn"
    const val RoshnPredictions = "roshn/predictions"
    const val KingsCup = "kings-cup"
    const val KingsCupPredictions = "kings-cup/predictions"
    const val KingsCupMatch = "kings-cup/match/{id}"
    const val KingsCupTeam = "kings-cup/team/{id}?name={name}&logo={logo}"
    const val RoshnMatch = "roshn/match/{id}"
    const val RoshnTeam = "roshn/team/{id}?name={name}&logo={logo}"
    // مُقترب — analytical-angles surface (landing + angle + topic + writer).
    const val Muqtarab = "muqtarab"
    const val MuqtarabAngle = "muqtarab/angle/{slug}"
    const val MuqtarabTopic = "muqtarab/topic/{angleSlug}/{topicSlug}"
    const val MuqtarabWriter = "muqtarab/writer/{id}"

    fun worldCupMatch(id: Int): String = "world-cup/match/$id"

    fun worldCupTeam(id: Int, name: String, logo: String): String =
        "world-cup/team/$id?name=${Uri.encode(name)}&logo=${Uri.encode(logo)}"

    fun gulfCupMatch(id: Int): String = "gulf-cup/match/$id"

    fun gulfCupTeam(id: Int, name: String, logo: String): String =
        "gulf-cup/team/$id?name=${Uri.encode(name)}&logo=${Uri.encode(logo)}"

    fun asianCupMatch(id: Int): String = "asian-cup/match/$id"
    fun asianCupTeam(id: Int): String = "asian-cup/team/$id"

    fun roshnMatch(id: Int): String = "roshn/match/$id"

    fun roshnTeam(id: Int, name: String, logo: String): String =
        "roshn/team/$id?name=${Uri.encode(name)}&logo=${Uri.encode(logo)}"

    fun kingsCupMatch(id: Int): String = "kings-cup/match/$id"

    fun kingsCupTeam(id: Int, name: String, logo: String): String =
        "kings-cup/team/$id?name=${Uri.encode(name)}&logo=${Uri.encode(logo)}"

    fun muqtarabAngle(slug: String): String = "muqtarab/angle/${Uri.encode(slug)}"

    fun muqtarabTopic(angleSlug: String, topicSlug: String): String =
        "muqtarab/topic/${Uri.encode(angleSlug)}/${Uri.encode(topicSlug)}"

    fun muqtarabWriter(id: String): String = "muqtarab/writer/${Uri.encode(id)}"

    fun notificationDetail(id: String): String = "notifications/${Uri.encode(id)}"

    fun survey(token: String): String = "survey/${Uri.encode(token)}"

    val TabRoutes = setOf(Home, Explore, Bookmarks, Profile)

    fun articleDetail(slug: String): String = "article/${Uri.encode(slug)}"

    fun keywordArticles(keyword: String): String = "keyword/${Uri.encode(keyword)}"

    fun categoryArticles(slug: String, name: String): String =
        "category/${Uri.encode(slug)}/${Uri.encode(name)}"

    fun authorArticles(name: String): String = "author/${Uri.encode(name)}"

    fun routeFor(tab: AppTab): String = when (tab) {
        AppTab.Home -> Home
        AppTab.Explore -> Explore
        AppTab.Bookmarks -> Bookmarks
        AppTab.Profile -> Profile
    }

    fun tabFor(route: String?): AppTab? = when (route) {
        Home -> AppTab.Home
        Explore -> AppTab.Explore
        Bookmarks -> AppTab.Bookmarks
        Profile -> AppTab.Profile
        else -> null
    }
}

/**
 * Top-level app shell. Owns the NavController, hosts the floating
 * TabBar, and reads user settings to drive the theme.
 */
@Composable
fun SabqApp(
    settingsViewModel: SettingsViewModel = hiltViewModel(),
    pushNavViewModel: com.sabq.smart.data.push.PushNavViewModel = hiltViewModel(),
    authViewModel: AuthViewModel = hiltViewModel(),
    majlisLinkViewModel: com.sabq.smart.feature.gulfcup.GcMajlisLinkViewModel = hiltViewModel(),
) {
    val settings by settingsViewModel.settings.collectAsStateWithLifecycle()
    val pendingPush by pushNavViewModel.target.collectAsStateWithLifecycle()
    val currentUser by authViewModel.currentUser.collectAsStateWithLifecycle()
    val pendingMajlisLink by majlisLinkViewModel.target.collectAsStateWithLifecycle()
    val isDarkTheme = if (settings.followsSystemDark)
        androidx.compose.foundation.isSystemInDarkTheme()
    else settings.isDarkMode

    // تحديث مسودات الكاتب عند الدخول وعند عودة التطبيق للواجهة —
    // المخزن يمسح نفسه عند الخروج بمراقبة AuthRepository داخليًا.
    val appContext = androidx.compose.ui.platform.LocalContext.current.applicationContext
    val revisionsStore = androidx.compose.runtime.remember {
        dagger.hilt.android.EntryPointAccessors.fromApplication(
            appContext,
            com.sabq.smart.feature.revisions.RevisionsStoreEntryPoint::class.java,
        ).revisionsStore()
    }
    androidx.compose.runtime.LaunchedEffect(currentUser?.id) {
        if (currentUser != null) revisionsStore.refresh()
    }

    SabqTheme(
        darkTheme = isDarkTheme,
        accent = settings.accent,
        articleFontSize = settings.articleFontSize,
    ) {
        val navController = rememberNavController()
        val currentEntry by navController.currentBackStackEntryAsState()
        val currentRoute = currentEntry?.destination?.route
        val currentTab = SabqRoutes.tabFor(currentRoute)

        // Push-notification deep link. When a notification tap fires
        // MainActivity → PendingPushDeepLink → this VM, navigate to the
        // most specific destination (article > notification row) and
        // mark the target consumed so configuration changes don't
        // replay the same nav.
        androidx.compose.runtime.LaunchedEffect(pendingPush) {
            val target = pendingPush ?: return@LaunchedEffect
            when {
                // إشعار needs_revision يفتح محرر المسودة مباشرة
                !target.draftArticleId.isNullOrBlank() ->
                    navController.navigate(SabqRoutes.revisionEditor(target.draftArticleId!!))
                // دعوة استطلاع — الأعلى أولوية: توكن شخصي يفتح شاشته مباشرة
                !target.surveyToken.isNullOrBlank() ->
                    navController.navigate(SabqRoutes.survey(target.surveyToken!!))
                target.deepLinkPath == "/asian-cup" ->
                    navController.navigate(SabqRoutes.AsianCup)
                target.deepLinkPath?.startsWith("/asian-cup/match/") == true ->
                    target.deepLinkPath.substringAfterLast('/').toIntOrNull()?.let {
                        navController.navigate(SabqRoutes.asianCupMatch(it))
                    }
                target.deepLinkPath?.startsWith("/asian-cup/team/") == true ->
                    target.deepLinkPath.substringAfterLast('/').toIntOrNull()?.let {
                        navController.navigate(SabqRoutes.asianCupTeam(it))
                    }
                // روشن — نفس مسارات iOS العامة: /roshn و/roshn/match/:id
                // و/sports/team/:id (رابط صفحة النادي على الويب).
                target.deepLinkPath == "/roshn" ->
                    navController.navigate(SabqRoutes.Roshn)
                target.deepLinkPath?.startsWith("/roshn/match/") == true ->
                    target.deepLinkPath.substringAfterLast('/').toIntOrNull()?.let {
                        navController.navigate(SabqRoutes.roshnMatch(it))
                    }
                target.deepLinkPath?.startsWith("/sports/team/") == true ->
                    target.deepLinkPath.substringAfterLast('/').toIntOrNull()?.let {
                        navController.navigate(SabqRoutes.roshnTeam(it, "", ""))
                    }
                // كأس الملك — /kings-cup و/kings-cup/match/:id و/kings-cup/team/:id
                target.deepLinkPath == "/kings-cup" ->
                    navController.navigate(SabqRoutes.KingsCup)
                target.deepLinkPath?.startsWith("/kings-cup/match/") == true ->
                    target.deepLinkPath.substringAfterLast('/').toIntOrNull()?.let {
                        navController.navigate(SabqRoutes.kingsCupMatch(it))
                    }
                target.deepLinkPath?.startsWith("/kings-cup/team/") == true ->
                    target.deepLinkPath.substringAfterLast('/').toIntOrNull()?.let {
                        navController.navigate(SabqRoutes.kingsCupTeam(it, "", ""))
                    }
                !target.articleSlug.isNullOrBlank() ->
                    navController.navigate(SabqRoutes.articleDetail(target.articleSlug!!))
                !target.notificationId.isNullOrBlank() ->
                    navController.navigate(SabqRoutes.notificationDetail(target.notificationId!!))
            }
            pushNavViewModel.consume()
        }

        // Universal/custom links and Majlis push taps always land in the Gulf
        // Cup predictions hub. The target remains persisted until the invite
        // is accepted/cancelled or the addressed council is actually opened.
        androidx.compose.runtime.LaunchedEffect(pendingMajlisLink) {
            if (pendingMajlisLink != null && currentRoute != SabqRoutes.GulfCup) {
                navController.navigate(SabqRoutes.GulfCup) { launchSingleTop = true }
            }
        }

        // Show the floating tab bar only on top-level tab routes; it
        // hides for ArticleDetail so the reader gets the full screen.
        val showTabBar = currentTab != null

        // جلسات قديمة بلا اسم — غطاء إلزامي (شاشة الدخول تتولى الإكمال بعد OTP).
        val showCompleteName = currentUser?.needsDisplayName == true &&
            currentRoute != SabqRoutes.Login &&
            settings.hasCompletedOnboardingV2

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(SabqTheme.colors.background),
        ) {
            NavHost(
                navController = navController,
                startDestination = SabqRoutes.Home,
                modifier = Modifier.fillMaxSize(),
                // navigation-compose 2.8 يجعل الافتراضي fade بمدة 700ms — كان
                // يجعل كل تنقّل يبدو ثقيلًا (تدقيق الأداء 2026-08-02). ‏120ms
                // هي وتيرة المنصة المعتادة.
                enterTransition = { fadeIn(animationSpec = tween(120)) },
                exitTransition = { fadeOut(animationSpec = tween(90)) },
                popEnterTransition = { fadeIn(animationSpec = tween(120)) },
                popExitTransition = { fadeOut(animationSpec = tween(90)) },
            ) {
                composable(SabqRoutes.Home) {
                    HomeFeedScreen(
                        onArticleClick = { article ->
                            article.slug?.let { slug ->
                                com.sabq.smart.data.ArticleHandoff.put(article)
                                navController.navigate(SabqRoutes.articleDetail(slug))
                            }
                        },
                        onSearchClick = {
                            navController.navigate(SabqRoutes.Search)
                        },
                        onMomentByMomentClick = {
                            navController.navigate(SabqRoutes.MomentByMoment)
                        },
                        onNotificationsClick = {
                            navController.navigate(SabqRoutes.Notifications)
                        },
                        onOpinionsAllClick = {
                            navController.navigate(SabqRoutes.Opinions)
                        },
                        onTrendingAllClick = {
                            navController.navigate(SabqRoutes.Trending)
                        },
                        onWorldCupClick = {
                            navController.navigate(SabqRoutes.WorldCup)
                        },
                        onGulfCupClick = {
                            navController.navigate(SabqRoutes.GulfCup)
                        },
                        onAsianCupClick = {
                            navController.navigate(SabqRoutes.AsianCup)
                        },
                        onKingsCupClick = {
                            navController.navigate(SabqRoutes.KingsCup)
                        },
                        onRoshnClick = {
                            navController.navigate(SabqRoutes.Roshn)
                        },
                        onCalendarAllClick = {
                            navController.navigate(SabqRoutes.Calendar)
                        },
                        onGreetingClick = {
                            navController.navigate(SabqRoutes.DailyBrief)
                        },
                        onLoyaltyClick = {
                            navController.navigate(SabqRoutes.Loyalty)
                        },
                        onStoryClick = { story ->
                            // Stories on Sabq wrap a `rootArticle`.
                            // Tapping the bubble opens that article in
                            // ArticleDetail — same UX as the web
                            // `/story/...` deep link which redirects to
                            // the article.
                            story.rootArticleSlug?.let { slug ->
                                navController.navigate(SabqRoutes.articleDetail(slug))
                            }
                        },
                        onAudioNewslettersClick = {
                            navController.navigate(SabqRoutes.AudioNewsletters)
                        },
                        onHajjArticleClick = { hArticle ->
                            // Hajj articles only carry the slug, not a
                            // full Article payload — open the standard
                            // article detail by slug. The detail screen
                            // re-fetches the full row.
                            hArticle.slug?.let { slug ->
                                navController.navigate(SabqRoutes.articleDetail(slug))
                            }
                        },
                        onMuqtarabAllClick = {
                            navController.navigate(SabqRoutes.Muqtarab)
                        },
                        onMuqtarabTopicClick = { angleSlug, topicSlug ->
                            navController.navigate(SabqRoutes.muqtarabTopic(angleSlug, topicSlug))
                        },
                    )
                }
                composable(SabqRoutes.Explore) {
                    ExploreScreen(
                        onArticleClick = { article ->
                            article.slug?.let { slug ->
                                com.sabq.smart.data.ArticleHandoff.put(article)
                                navController.navigate(SabqRoutes.articleDetail(slug))
                            }
                        },
                        onCategoryClick = { section ->
                            navController.navigate(SabqRoutes.categoryArticles(section.slug, section.name))
                        },
                        onKeywordClick = { keyword ->
                            navController.navigate(SabqRoutes.keywordArticles(keyword))
                        },
                    )
                }
                composable(SabqRoutes.Search) {
                    com.sabq.smart.feature.search.SearchScreen(
                        onBack = { navController.popBackStack() },
                        onArticleClick = { article ->
                            article.slug?.let { slug ->
                                com.sabq.smart.data.ArticleHandoff.put(article)
                                navController.navigate(SabqRoutes.articleDetail(slug))
                            }
                        },
                        onTagClick = { tag ->
                            navController.navigate(SabqRoutes.keywordArticles(tag))
                        },
                    )
                }
                composable(SabqRoutes.Sections) {
                    com.sabq.smart.feature.sections.SectionsScreen(
                        onBack = { navController.popBackStack() },
                        onCategoryClick = { _ ->
                            // TODO: route to a category-filtered article list.
                            // iOS opens `CategoryArticlesSheet`; Android currently
                            // has no equivalent route — wiring deferred.
                        },
                        onTagClick = { tag ->
                            navController.navigate(SabqRoutes.keywordArticles(tag))
                        },
                    )
                }
                composable(SabqRoutes.Bookmarks) {
                    BookmarksScreen(
                        onArticleClick = { article ->
                            article.slug?.let { slug ->
                                com.sabq.smart.data.ArticleHandoff.put(article)
                                navController.navigate(SabqRoutes.articleDetail(slug))
                            }
                        },
                    )
                }
                composable(SabqRoutes.Profile) {
                    val authVm: com.sabq.smart.feature.auth.AuthViewModel = androidx.hilt.navigation.compose.hiltViewModel()
                    val coroutineScope = androidx.compose.runtime.rememberCoroutineScope()
                    val context = LocalContext.current
                    val openUrl: (String) -> Unit = { url ->
                        runCatching {
                            context.startActivity(
                                Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                },
                            )
                        }
                    }
                    SettingsScreen(
                        onLoginClick = { navController.navigate(SabqRoutes.Login) },
                        onLoyaltyClick = { navController.navigate(SabqRoutes.Loyalty) },
                        onPredictionsClick = { navController.navigate(SabqRoutes.Predictions) },
                        onEditProfileClick = { navController.navigate(SabqRoutes.EditProfile) },
                        onChangePasswordClick = { navController.navigate(SabqRoutes.ChangePassword) },
                        onDeleteAccountClick = { navController.navigate(SabqRoutes.DeleteAccount) },
                        onForgotPasswordClick = { navController.navigate(SabqRoutes.ForgotPassword) },
                        onNotificationsClick = { navController.navigate(SabqRoutes.Notifications) },
                        onContactClick = { navController.navigate(SabqRoutes.Contact) },
                        onNewsletterClick = { navController.navigate(SabqRoutes.Newsletter) },
                        onPrivacyClick = { navController.navigate(SabqRoutes.PrivacyPolicy) },
                        onTermsClick = { navController.navigate(SabqRoutes.TermsOfUse) },
                        onOpenWebsite = { openUrl("https://sabq.org") },
                        onOpenTwitter = { openUrl("https://x.com/sabqorg") },
                        onSubmitOpinionClick = { navController.navigate(SabqRoutes.SubmitOpinion) },
                        onSubmitNewsClick = { navController.navigate(SabqRoutes.SubmitNews) },
                        onPickInterestsClick = { navController.navigate(SabqRoutes.InterestsPicker) },
                        onDashboardClick = { navController.navigate(SabqRoutes.ContributorDashboard) },
                        onSabqPlusClick = { navController.navigate(SabqRoutes.SabqPlus) },
                        onPressCardClick = { navController.navigate(SabqRoutes.PressCard) },
                        onLogout = { coroutineScope.launch { authVm.logout() } },
                    )
                }
                composable(SabqRoutes.SabqPlus) {
                    com.sabq.smart.feature.plus.SabqPlusScreen(
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(SabqRoutes.PressCard) {
                    com.sabq.smart.feature.presscard.PressCardScreen(
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(SabqRoutes.Login) {
                    LoginScreen(
                        onBack = { navController.popBackStack() },
                        onAuthenticated = { navController.popBackStack() },
                        onForgotPasswordClick = { navController.navigate(SabqRoutes.ForgotPassword) },
                        onSmartSignUpClick = { navController.navigate(SabqRoutes.SmartSignUp) },
                    )
                }
                composable(SabqRoutes.SmartSignUp) {
                    SmartSignUpScreen(
                        onClose = { navController.popBackStack() },
                        onDone = {
                            // Pop the smart signup AND the underlying login screen if present,
                            // otherwise just pop the smart signup screen.
                            val poppedLogin = navController.popBackStack(SabqRoutes.Login, inclusive = true)
                            if (!poppedLogin) {
                                navController.popBackStack()
                            }
                        },
                    )
                }
                composable(SabqRoutes.Loyalty) {
                    LoyaltyAccountScreen(
                        onBack = { navController.popBackStack() },
                        onHistoryClick = { navController.navigate(SabqRoutes.LoyaltyHistory) },
                        onRewardsClick = { navController.navigate(SabqRoutes.LoyaltyRewards) },
                    )
                }
                composable(SabqRoutes.LoyaltyHistory) {
                    LoyaltyHistoryScreen(
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(SabqRoutes.LoyaltyRewards) {
                    LoyaltyRewardsScreen(
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(SabqRoutes.ContributorDashboard) {
                    // «لوحة الكاتب»: كاتب الرأي يرى مساحة الكاتب بأربعة تبويبات،
                    // وغيره لوحة الأداء وحدها — مطابقة لسلوك iOS.
                    com.sabq.smart.feature.settings.WriterWorkspaceScreen(
                        onBack = { navController.popBackStack() },
                        onOpenSurvey = { surveyToken ->
                            navController.navigate(SabqRoutes.survey(surveyToken))
                        },
                        onOpenNotifications = {
                            navController.navigate(SabqRoutes.Notifications)
                        },
                        onOpenRevisions = {
                            navController.navigate(SabqRoutes.Revisions)
                        },
                    )
                }
                composable(SabqRoutes.Revisions) {
                    com.sabq.smart.feature.revisions.RevisionsListScreen(
                        onBack = { navController.popBackStack() },
                        onOpenEditor = { id -> navController.navigate(SabqRoutes.revisionEditor(id)) },
                    )
                }
                composable(
                    route = SabqRoutes.RevisionEditor,
                    arguments = listOf(navArgument("id") { type = NavType.StringType }),
                ) {
                    com.sabq.smart.feature.revisions.RevisionEditorScreen(
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(SabqRoutes.Opinions) {
                    OpinionsListScreen(
                        onBack = { navController.popBackStack() },
                        onArticleClick = { article ->
                            article.slug?.let { slug ->
                                com.sabq.smart.data.ArticleHandoff.put(article)
                                navController.navigate(SabqRoutes.articleDetail(slug))
                            }
                        },
                    )
                }
                composable(SabqRoutes.Trending) {
                    TrendingScreen(
                        onBack = { navController.popBackStack() },
                        onArticleClick = { article ->
                            article.slug?.let { slug ->
                                com.sabq.smart.data.ArticleHandoff.put(article)
                                navController.navigate(SabqRoutes.articleDetail(slug))
                            }
                        },
                        onTagClick = { tag ->
                            navController.navigate(SabqRoutes.keywordArticles(tag))
                        },
                    )
                }
                composable(SabqRoutes.DailyBrief) {
                    DailyBriefScreen(
                        onBack = { navController.popBackStack() },
                        onLogin = { navController.navigate(SabqRoutes.Login) },
                        onSignUp = { navController.navigate(SabqRoutes.SmartSignUp) },
                        onPickInterests = {
                            navController.navigate(SabqRoutes.InterestsPicker)
                        },
                        onArticleClick = { article ->
                            article.slug?.let { slug ->
                                com.sabq.smart.data.ArticleHandoff.put(article)
                                navController.navigate(SabqRoutes.articleDetail(slug))
                            }
                        },
                    )
                }
                composable(SabqRoutes.InterestsPicker) {
                    InterestsPickerScreen(
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(SabqRoutes.MomentByMoment) {
                    MomentByMomentScreen(
                        onBack = { navController.popBackStack() },
                        onArticleClick = { article ->
                            article.slug?.let { slug ->
                                com.sabq.smart.data.ArticleHandoff.put(article)
                                navController.navigate(SabqRoutes.articleDetail(slug))
                            }
                        },
                    )
                }
                composable(SabqRoutes.AudioNewsletters) {
                    com.sabq.smart.feature.audio.AudioNewslettersScreen(
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(SabqRoutes.Calendar) {
                    CalendarScreen(
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(SabqRoutes.LiveCoverage) {
                    LiveCoverageScreen(
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(SabqRoutes.WorldCup) {
                    com.sabq.smart.feature.worldcup.WorldCupScreen(
                        onBack = { navController.popBackStack() },
                        onOpenMatch = { id -> navController.navigate(SabqRoutes.worldCupMatch(id)) },
                        onOpenArticle = { slug -> navController.navigate(SabqRoutes.articleDetail(slug)) },
                        onOpenTeam = { team -> navController.navigate(SabqRoutes.worldCupTeam(team.id, team.name, team.logo)) },
                        onOpenPredictions = { navController.navigate(SabqRoutes.WorldCupPredictions) },
                    )
                }
                composable(SabqRoutes.WorldCupPredictions) {
                    com.sabq.smart.feature.worldcup.WorldCupPredictionsScreen(
                        onBack = { navController.popBackStack() },
                        onRequireLogin = { navController.navigate(SabqRoutes.Login) },
                    )
                }
                // المنصة المركزية للتوقّعات — كل البطولات ما عدا المونديال
                composable(SabqRoutes.Predictions) {
                    com.sabq.smart.feature.predictions.PredictionCenterScreen(
                        onBack = { navController.popBackStack() },
                        onRequireLogin = { navController.navigate(SabqRoutes.Login) },
                    )
                }
                composable(
                    route = SabqRoutes.WorldCupMatch,
                    arguments = listOf(navArgument("id") { type = NavType.StringType }),
                ) {
                    com.sabq.smart.feature.worldcup.WorldCupMatchCenterScreen(
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(
                    route = SabqRoutes.WorldCupTeam,
                    arguments = listOf(
                        navArgument("id") { type = NavType.StringType },
                        navArgument("name") { type = NavType.StringType; defaultValue = "" },
                        navArgument("logo") { type = NavType.StringType; defaultValue = "" },
                    ),
                ) {
                    com.sabq.smart.feature.worldcup.WorldCupTeamScreen(
                        onBack = { navController.popBackStack() },
                        onOpenMatch = { id -> navController.navigate(SabqRoutes.worldCupMatch(id)) },
                        onRequireLogin = { navController.navigate(SabqRoutes.Login) },
                    )
                }
                composable(SabqRoutes.GulfCup) {
                    com.sabq.smart.feature.gulfcup.GulfCupScreen(
                        onBack = { navController.popBackStack() },
                        onOpenMatch = { id -> navController.navigate(SabqRoutes.gulfCupMatch(id)) },
                        onOpenTeam = { team -> navController.navigate(SabqRoutes.gulfCupTeam(team.id, team.name, team.logo)) },
                        onRequireLogin = { navController.navigate(SabqRoutes.Login) },
                    )
                }
                composable(SabqRoutes.AsianCup) {
                    com.sabq.smart.feature.asiancup.AsianCupScreen(
                        onBack = { navController.popBackStack() },
                        onOpenMatch = { id -> navController.navigate(SabqRoutes.asianCupMatch(id)) },
                        onOpenTeam = { team -> navController.navigate(SabqRoutes.asianCupTeam(team.id)) },
                        onRequireLogin = { navController.navigate(SabqRoutes.Login) },
                    )
                }
                composable(
                    route = SabqRoutes.AsianCupMatch,
                    arguments = listOf(navArgument("id") { type = NavType.StringType }),
                ) { entry ->
                    val fixtureId = entry.arguments?.getString("id")?.toIntOrNull() ?: 0
                    com.sabq.smart.feature.asiancup.AsianCupMatchScreen(
                        fixtureId = fixtureId,
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(
                    route = SabqRoutes.AsianCupTeam,
                    arguments = listOf(navArgument("id") { type = NavType.StringType }),
                ) { entry ->
                    val teamId = entry.arguments?.getString("id")?.toIntOrNull() ?: 0
                    com.sabq.smart.feature.asiancup.AsianCupTeamScreen(
                        teamId = teamId,
                        onBack = { navController.popBackStack() },
                        onOpenMatch = { id -> navController.navigate(SabqRoutes.asianCupMatch(id)) },
                    )
                }
                composable(SabqRoutes.Roshn) {
                    com.sabq.smart.feature.roshn.RoshnScreen(
                        onBack = { navController.popBackStack() },
                        onOpenMatch = { id -> navController.navigate(SabqRoutes.roshnMatch(id)) },
                        onOpenTeam = { team -> navController.navigate(SabqRoutes.roshnTeam(team.id, team.name, team.logo)) },
                        onOpenPredictions = { navController.navigate(SabqRoutes.RoshnPredictions) },
                    )
                }
                composable(SabqRoutes.RoshnPredictions) {
                    com.sabq.smart.feature.roshn.RoshnPredictionsScreen(
                        onBack = { navController.popBackStack() },
                        onRequireLogin = { navController.navigate(SabqRoutes.Login) },
                    )
                }
                composable(
                    route = SabqRoutes.RoshnMatch,
                    arguments = listOf(navArgument("id") { type = NavType.StringType }),
                ) { entry ->
                    val fixtureId = entry.arguments?.getString("id")?.toIntOrNull() ?: 0
                    com.sabq.smart.feature.roshn.RoshnMatchScreen(
                        fixtureId = fixtureId,
                        onBack = { navController.popBackStack() },
                        onOpenTeam = { team -> navController.navigate(SabqRoutes.roshnTeam(team.id, team.name, team.logo)) },
                    )
                }
                composable(
                    route = SabqRoutes.RoshnTeam,
                    arguments = listOf(
                        navArgument("id") { type = NavType.StringType },
                        navArgument("name") { type = NavType.StringType; defaultValue = "" },
                        navArgument("logo") { type = NavType.StringType; defaultValue = "" },
                    ),
                ) { entry ->
                    val teamId = entry.arguments?.getString("id")?.toIntOrNull() ?: 0
                    com.sabq.smart.feature.roshn.RoshnTeamScreen(
                        teamId = teamId,
                        previewName = entry.arguments?.getString("name").orEmpty(),
                        previewLogo = entry.arguments?.getString("logo").orEmpty(),
                        onBack = { navController.popBackStack() },
                        onOpenMatch = { id -> navController.navigate(SabqRoutes.roshnMatch(id)) },
                    )
                }
                composable(SabqRoutes.KingsCup) {
                    com.sabq.smart.feature.kingscup.KingsCupScreen(
                        onBack = { navController.popBackStack() },
                        onOpenMatch = { id -> navController.navigate(SabqRoutes.kingsCupMatch(id)) },
                        onOpenTeam = { team -> navController.navigate(SabqRoutes.kingsCupTeam(team.id, team.name, team.logo)) },
                        onOpenPredictions = { navController.navigate(SabqRoutes.KingsCupPredictions) },
                    )
                }
                composable(SabqRoutes.KingsCupPredictions) {
                    com.sabq.smart.feature.kingscup.KingsCupPredictionsScreen(
                        onBack = { navController.popBackStack() },
                        onRequireLogin = { navController.navigate(SabqRoutes.Login) },
                    )
                }
                composable(
                    route = SabqRoutes.KingsCupMatch,
                    arguments = listOf(navArgument("id") { type = NavType.StringType }),
                ) { entry ->
                    val fixtureId = entry.arguments?.getString("id")?.toIntOrNull() ?: 0
                    com.sabq.smart.feature.kingscup.KingsCupMatchScreen(
                        fixtureId = fixtureId,
                        onBack = { navController.popBackStack() },
                        onOpenTeam = { team -> navController.navigate(SabqRoutes.kingsCupTeam(team.id, team.name, team.logo)) },
                    )
                }
                composable(
                    route = SabqRoutes.KingsCupTeam,
                    arguments = listOf(
                        navArgument("id") { type = NavType.StringType },
                        navArgument("name") { type = NavType.StringType; defaultValue = "" },
                        navArgument("logo") { type = NavType.StringType; defaultValue = "" },
                    ),
                ) { entry ->
                    val teamId = entry.arguments?.getString("id")?.toIntOrNull() ?: 0
                    com.sabq.smart.feature.kingscup.KingsCupTeamScreen(
                        teamId = teamId,
                        previewName = entry.arguments?.getString("name").orEmpty(),
                        previewLogo = entry.arguments?.getString("logo").orEmpty(),
                        onBack = { navController.popBackStack() },
                        onOpenMatch = { id -> navController.navigate(SabqRoutes.kingsCupMatch(id)) },
                    )
                }
                composable(
                    route = SabqRoutes.GulfCupMatch,
                    arguments = listOf(navArgument("id") { type = NavType.StringType }),
                ) { entry ->
                    val fixtureId = entry.arguments?.getString("id")?.toIntOrNull() ?: 0
                    com.sabq.smart.feature.gulfcup.GulfCupMatchScreen(
                        fixtureId = fixtureId,
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(
                    route = SabqRoutes.GulfCupTeam,
                    arguments = listOf(
                        navArgument("id") { type = NavType.StringType },
                        navArgument("name") { type = NavType.StringType; defaultValue = "" },
                        navArgument("logo") { type = NavType.StringType; defaultValue = "" },
                    ),
                ) { entry ->
                    val teamId = entry.arguments?.getString("id")?.toIntOrNull() ?: 0
                    com.sabq.smart.feature.gulfcup.GulfCupTeamScreen(
                        teamId = teamId,
                        onBack = { navController.popBackStack() },
                        onOpenMatch = { id -> navController.navigate(SabqRoutes.gulfCupMatch(id)) },
                    )
                }
                composable(SabqRoutes.Muqtarab) {
                    com.sabq.smart.feature.muqtarab.MuqtarabLandingScreen(
                        onBack = { navController.popBackStack() },
                        onAngleClick = { slug ->
                            navController.navigate(SabqRoutes.muqtarabAngle(slug))
                        },
                        onTopicClick = { angleSlug, topicSlug ->
                            navController.navigate(SabqRoutes.muqtarabTopic(angleSlug, topicSlug))
                        },
                    )
                }
                composable(
                    route = SabqRoutes.MuqtarabAngle,
                    arguments = listOf(navArgument("slug") { type = NavType.StringType }),
                ) {
                    com.sabq.smart.feature.muqtarab.MuqtarabAngleScreen(
                        onBack = { navController.popBackStack() },
                        onTopicClick = { angleSlug, topicSlug ->
                            navController.navigate(SabqRoutes.muqtarabTopic(angleSlug, topicSlug))
                        },
                        onWriterClick = { id ->
                            navController.navigate(SabqRoutes.muqtarabWriter(id))
                        },
                    )
                }
                composable(
                    route = SabqRoutes.MuqtarabTopic,
                    arguments = listOf(
                        navArgument("angleSlug") { type = NavType.StringType },
                        navArgument("topicSlug") { type = NavType.StringType },
                    ),
                ) {
                    com.sabq.smart.feature.muqtarab.MuqtarabTopicScreen(
                        onBack = { navController.popBackStack() },
                        onAngleClick = { slug ->
                            navController.navigate(SabqRoutes.muqtarabAngle(slug))
                        },
                        onWriterClick = { id ->
                            navController.navigate(SabqRoutes.muqtarabWriter(id))
                        },
                        onTopicClick = { angleSlug, topicSlug ->
                            navController.navigate(SabqRoutes.muqtarabTopic(angleSlug, topicSlug))
                        },
                    )
                }
                composable(
                    route = SabqRoutes.MuqtarabWriter,
                    arguments = listOf(navArgument("id") { type = NavType.StringType }),
                ) {
                    com.sabq.smart.feature.muqtarab.MuqtarabWriterScreen(
                        onBack = { navController.popBackStack() },
                        onAngleClick = { slug ->
                            navController.navigate(SabqRoutes.muqtarabAngle(slug))
                        },
                        onTopicClick = { angleSlug, topicSlug ->
                            navController.navigate(SabqRoutes.muqtarabTopic(angleSlug, topicSlug))
                        },
                    )
                }
                composable(SabqRoutes.Notifications) {
                    EditorialNotificationsScreen(
                        onBack = { navController.popBackStack() },
                        onOpenDetail = { id ->
                            navController.navigate(SabqRoutes.notificationDetail(id))
                        },
                        onOpenPreferences = {
                            navController.navigate(SabqRoutes.NotificationPreferences)
                        },
                    )
                }
                composable(
                    route = SabqRoutes.NotificationDetail,
                    arguments = listOf(navArgument("id") { type = NavType.StringType }),
                ) {
                    EditorialNotificationDetailScreen(
                        onBack = { navController.popBackStack() },
                        onOpenArticle = { slug ->
                            navController.navigate(SabqRoutes.articleDetail(slug))
                        },
                        onOpenSurvey = { surveyToken ->
                            navController.navigate(SabqRoutes.survey(surveyToken))
                        },
                    )
                }
                composable(
                    route = SabqRoutes.Survey,
                    arguments = listOf(navArgument("token") { type = NavType.StringType }),
                ) { entry ->
                    com.sabq.smart.feature.survey.SurveyScreen(
                        token = entry.arguments?.getString("token").orEmpty(),
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(SabqRoutes.NotificationPreferences) {
                    NotificationPreferencesScreen(
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(SabqRoutes.EditProfile) {
                    EditProfileScreen(onBack = { navController.popBackStack() })
                }
                composable(SabqRoutes.ChangePassword) {
                    ChangePasswordScreen(onBack = { navController.popBackStack() })
                }
                composable(SabqRoutes.ForgotPassword) {
                    ForgotPasswordScreen(onBack = { navController.popBackStack() })
                }
                composable(SabqRoutes.DeleteAccount) {
                    DeleteAccountScreen(
                        onBack = { navController.popBackStack() },
                        onAccountDeleted = {
                            navController.popBackStack(SabqRoutes.Profile, inclusive = false)
                        },
                    )
                }
                composable(SabqRoutes.Contact) {
                    ContactScreen(onBack = { navController.popBackStack() })
                }
                composable(SabqRoutes.Newsletter) {
                    NewsletterScreen(onBack = { navController.popBackStack() })
                }
                composable(SabqRoutes.PrivacyPolicy) {
                    PrivacyPolicyScreen(onBack = { navController.popBackStack() })
                }
                composable(SabqRoutes.TermsOfUse) {
                    TermsOfUseScreen(onBack = { navController.popBackStack() })
                }
                composable(SabqRoutes.SubmitOpinion) {
                    ArticleSubmissionScreen(
                        kind = ArticleSubmissionKind.Opinion,
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(SabqRoutes.SubmitNews) {
                    ArticleSubmissionScreen(
                        kind = ArticleSubmissionKind.News,
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(
                    route = SabqRoutes.ArticleDetail,
                    arguments = listOf(navArgument("slug") { type = NavType.StringType }),
                ) { entry ->
                    val slug = entry.arguments?.getString("slug").orEmpty()
                    ArticleDetailScreen(
                        slug = slug,
                        onBack = { navController.popBackStack() },
                        onLoginRequested = { navController.navigate(SabqRoutes.Login) },
                        onRelatedClick = { related ->
                            related.slug?.let { s ->
                                navController.navigate(SabqRoutes.articleDetail(s))
                            }
                        },
                        onTagClick = { tag ->
                            navController.navigate(SabqRoutes.keywordArticles(tag))
                        },
                        onAuthorClick = { name ->
                            navController.navigate(SabqRoutes.authorArticles(name))
                        },
                    )
                }
                composable(
                    route = SabqRoutes.CategoryArticles,
                    arguments = listOf(
                        navArgument("slug") { type = NavType.StringType },
                        navArgument("name") { type = NavType.StringType },
                    ),
                ) {
                    com.sabq.smart.feature.category.CategoryArticlesScreen(
                        onBack = { navController.popBackStack() },
                        onArticleClick = { article ->
                            article.slug?.let { slug ->
                                com.sabq.smart.data.ArticleHandoff.put(article)
                                navController.navigate(SabqRoutes.articleDetail(slug))
                            }
                        },
                    )
                }
                composable(
                    route = SabqRoutes.KeywordArticles,
                    arguments = listOf(navArgument("keyword") { type = NavType.StringType }),
                ) { entry ->
                    KeywordArticlesScreen(
                        onSearchClick = {
                            navController.navigate(SabqRoutes.Search) {
                                popUpTo(SabqRoutes.KeywordArticles) { inclusive = true }
                                launchSingleTop = true
                            }
                        },
                        onBack = { navController.popBackStack() },
                        onArticleClick = { article ->
                            article.slug?.let { slug ->
                                com.sabq.smart.data.ArticleHandoff.put(article)
                                navController.navigate(SabqRoutes.articleDetail(slug))
                            }
                        }
                    )
                }
                composable(
                    route = SabqRoutes.AuthorArticles,
                    arguments = listOf(navArgument("name") { type = NavType.StringType }),
                ) { entry ->
                    AuthorArticlesScreen(
                        onBack = { navController.popBackStack() },
                        onArticleClick = { article ->
                            article.slug?.let { slug ->
                                com.sabq.smart.data.ArticleHandoff.put(article)
                                navController.navigate(SabqRoutes.articleDetail(slug))
                            }
                        }
                    )
                }
            }

            if (showTabBar && currentTab != null) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .navigationBarsPadding()
                        .padding(bottom = 12.dp),
                ) {
                    SabqTabBar(
                        selectedTab = currentTab,
                        onSelect = { tab ->
                            val target = SabqRoutes.routeFor(tab)
                            if (target != currentRoute) {
                                navController.navigate(target) {
                                    // Same-tab single-instance + restore
                                    // state — Compose-Nav idiom for
                                    // bottom-bar navigation.
                                    popUpTo(SabqRoutes.Home) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            } else if (tab == AppTab.Home) {
                                // Re-tap on the already-active Home tab:
                                // scroll the feed back to the top + pull
                                // a fresh refresh. Mirrors iOS behaviour.
                                TabReselectBus.emitHome()
                            }
                        },
                    )
                }
            }

            // 4-slide welcome flow — gates the app on first launch.
            // Ports iOS sabqApp.swift's `.fullScreenCover(isPresented:
            // .constant(!hasOnboarded))` pattern. Sits on top of the
            // NavHost so the underlying nav stack is preserved while
            // the cover is visible (matches the iOS UX) and dismisses
            // the moment `setOnboardingCompleted(true)` flips the flag.
            if (!settings.hasCompletedOnboardingV2) {
                OnboardingScreen(
                    onComplete = { settingsViewModel.completeOnboarding() },
                )
            } else if (showCompleteName) {
                CompleteNameScreen(
                    onDone = { /* AuthRepository cache updates → needsDisplayName flips */ },
                    phoneHint = currentUser?.phone,
                )
            }
        }
    }
}
