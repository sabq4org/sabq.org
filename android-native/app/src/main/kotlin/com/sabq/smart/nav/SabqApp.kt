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
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.sabq.smart.feature.article.ArticleDetailScreen
import com.sabq.smart.feature.auth.LoginScreen
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
    const val Loyalty = "loyalty"
    const val LoyaltyHistory = "loyalty/history"
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
    const val AuthorArticles = "author/{name}"
    const val AudioNewsletters = "audio-newsletters"

    fun notificationDetail(id: String): String = "notifications/${Uri.encode(id)}"

    val TabRoutes = setOf(Home, Explore, Bookmarks, Profile)

    fun articleDetail(slug: String): String = "article/${Uri.encode(slug)}"

    fun keywordArticles(keyword: String): String = "keyword/${Uri.encode(keyword)}"

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
) {
    val settings by settingsViewModel.settings.collectAsStateWithLifecycle()
    val pendingPush by pushNavViewModel.target.collectAsStateWithLifecycle()
    val isDarkTheme = if (settings.followsSystemDark)
        androidx.compose.foundation.isSystemInDarkTheme()
    else settings.isDarkMode

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
                !target.articleSlug.isNullOrBlank() ->
                    navController.navigate(SabqRoutes.articleDetail(target.articleSlug!!))
                !target.notificationId.isNullOrBlank() ->
                    navController.navigate(SabqRoutes.notificationDetail(target.notificationId!!))
            }
            pushNavViewModel.consume()
        }

        // Show the floating tab bar only on top-level tab routes; it
        // hides for ArticleDetail so the reader gets the full screen.
        val showTabBar = currentTab != null

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(SabqTheme.colors.background),
        ) {
            NavHost(
                navController = navController,
                startDestination = SabqRoutes.Home,
                modifier = Modifier.fillMaxSize(),
            ) {
                composable(SabqRoutes.Home) {
                    HomeFeedScreen(
                        onArticleClick = { article ->
                            article.slug?.let { slug ->
                                navController.navigate(SabqRoutes.articleDetail(slug))
                            }
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
                    )
                }
                composable(SabqRoutes.Explore) {
                    ExploreScreen(
                        onArticleClick = { article ->
                            article.slug?.let { slug ->
                                navController.navigate(SabqRoutes.articleDetail(slug))
                            }
                        },
                    )
                }
                composable(SabqRoutes.Bookmarks) {
                    BookmarksScreen(
                        onArticleClick = { article ->
                            article.slug?.let { slug ->
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
                        onLogout = { coroutineScope.launch { authVm.logout() } },
                        onClearLocalData = { /* Surfaced via dialog in a future polish pass. */ },
                    )
                }
                composable(SabqRoutes.Login) {
                    LoginScreen(
                        onBack = { navController.popBackStack() },
                        onAuthenticated = { navController.popBackStack() },
                    )
                }
                composable(SabqRoutes.Loyalty) {
                    LoyaltyAccountScreen(
                        onBack = { navController.popBackStack() },
                        onHistoryClick = { navController.navigate(SabqRoutes.LoyaltyHistory) },
                    )
                }
                composable(SabqRoutes.LoyaltyHistory) {
                    LoyaltyHistoryScreen(
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(SabqRoutes.Opinions) {
                    OpinionsListScreen(
                        onBack = { navController.popBackStack() },
                        onArticleClick = { article ->
                            article.slug?.let { slug ->
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
                        onPickInterests = {
                            navController.navigate(SabqRoutes.InterestsPicker)
                        },
                        onArticleClick = { article ->
                            article.slug?.let { slug ->
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
                    route = SabqRoutes.KeywordArticles,
                    arguments = listOf(navArgument("keyword") { type = NavType.StringType }),
                ) { entry ->
                    KeywordArticlesScreen(
                        onBack = { navController.popBackStack() },
                        onArticleClick = { article ->
                            article.slug?.let { slug ->
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
            }
        }
    }
}
