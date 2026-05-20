package com.sabq.smart

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.sabq.smart.data.push.PendingPushDeepLink
import com.sabq.smart.data.push.SabqMessagingService
import com.sabq.smart.nav.SabqApp
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var pendingPush: PendingPushDeepLink

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        capturePushExtras(intent)
        setContent {
            // The whole app runs RTL. We force LayoutDirection.Rtl
            // unconditionally so iOS parity holds even if the device's
            // primary locale isn't Arabic (e.g. a tester running in
            // English). FocalCachedAsyncImage temporarily flips back to
            // Ltr internally — its math assumes a top-left origin.
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                // SabqApp owns the theme — it reads user settings from
                // DataStore and applies dark mode / accent / font size.
                SabqApp()
            }
        }
    }

    /**
     * Push-deep-link case: the system delivers the intent here without
     * recreating the Activity (because `singleTop` flags are set on the
     * PendingIntent). Forward the extras to [pendingPush] so the Compose
     * nav graph picks them up on the next state collection.
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        capturePushExtras(intent)
    }

    private fun capturePushExtras(intent: Intent?) {
        if (intent == null) return
        val slug = intent.getStringExtra(SabqMessagingService.EXTRA_ARTICLE_SLUG)
            ?: intent.data?.getQueryParameter("slug")
        val notifId = intent.getStringExtra(SabqMessagingService.EXTRA_NOTIFICATION_ID)
            ?: intent.data?.getQueryParameter("id")
        val kind = intent.getStringExtra(SabqMessagingService.EXTRA_KIND)
            ?: intent.data?.getQueryParameter("kind")
        pendingPush.set(articleSlug = slug, notificationId = notifId, kind = kind)
    }
}
