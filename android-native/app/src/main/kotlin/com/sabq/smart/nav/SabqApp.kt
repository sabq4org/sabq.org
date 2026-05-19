package com.sabq.smart.nav

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
import com.sabq.smart.feature.explore.ExploreScreen
import com.sabq.smart.feature.home.HomeFeedScreen
import com.sabq.smart.feature.live.MomentByMomentScreen
import com.sabq.smart.feature.loyalty.LoyaltyAccountScreen
import com.sabq.smart.feature.opinions.OpinionsListScreen
import com.sabq.smart.feature.settings.SettingsScreen
import com.sabq.smart.feature.settings.SettingsViewModel
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
    const val Opinions = "opinions"
    const val MomentByMoment = "live/updates"

    val TabRoutes = setOf(Home, Explore, Bookmarks, Profile)

    fun articleDetail(slug: String): String = "article/${Uri.encode(slug)}"

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
) {
    val settings by settingsViewModel.settings.collectAsStateWithLifecycle()
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
                    )
                }
                composable(SabqRoutes.Explore) {
                    ExploreScreen(
                        onArticleClick = { article ->
                            article.slug?.let { slug ->
                                navController.navigate(SabqRoutes.articleDetail(slug))
                            }
                        },
                        onOpinionsClick = { navController.navigate(SabqRoutes.Opinions) },
                        onMomentByMomentClick = { navController.navigate(SabqRoutes.MomentByMoment) },
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
                    SettingsScreen(
                        onLoginClick = { navController.navigate(SabqRoutes.Login) },
                        onLoyaltyClick = { navController.navigate(SabqRoutes.Loyalty) },
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
                composable(
                    route = SabqRoutes.ArticleDetail,
                    arguments = listOf(navArgument("slug") { type = NavType.StringType }),
                ) { entry ->
                    val slug = entry.arguments?.getString("slug").orEmpty()
                    ArticleDetailScreen(
                        slug = slug,
                        onBack = { navController.popBackStack() },
                        onLoginRequested = { navController.navigate(SabqRoutes.Login) },
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
        }
    }
}
