package com.sabq.smart

import android.content.Intent
import android.net.Uri
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
import com.sabq.smart.feature.gulfcup.GcMajlisLocalStore
import com.sabq.smart.nav.SabqApp
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var pendingPush: PendingPushDeepLink
    @Inject lateinit var pendingMajlis: GcMajlisLocalStore

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (!captureMajlisLink(intent)) capturePushExtras(intent)
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
        if (!captureMajlisLink(intent)) capturePushExtras(intent)
    }

    private fun captureMajlisLink(intent: Intent?): Boolean {
        if (intent == null) return false
        // Prefer explicit Majlis fields so a fixture carried beside an older
        // deeplink is not discarded when the URI itself omits `fixture`.
        val code = intent.getStringExtra(SabqMessagingService.EXTRA_MAJLIS_CODE)
            ?: intent.getStringExtra("majlisCode")
            ?: intent.getStringExtra("majlis_code")
        val id = intent.getStringExtra(SabqMessagingService.EXTRA_MAJLIS_ID)
            ?: intent.getStringExtra("majlisId")
            ?: intent.getStringExtra("majlis_id")
        val fixtureId = intent.getStringExtra(SabqMessagingService.EXTRA_FIXTURE_ID)
            ?: intent.getStringExtra("fixtureId")
            ?: intent.getStringExtra("fixture_id")
        if (pendingMajlis.captureMajlis(code = code, id = id, fixtureId = fixtureId)) return true
        if (pendingMajlis.capture(intent.data)) return true

        // Defensive compatibility with legacy FCM notification+data taps where
        // Android places the raw data map directly into Activity extras.
        val rawDeepLink = intent.getStringExtra("deeplink")?.takeIf { it.isNotBlank() }
        return pendingMajlis.capture(rawDeepLink?.let(Uri::parse))
    }

    private fun capturePushExtras(intent: Intent?) {
        if (intent == null) return
        // ثلاث شبكات أمان لالتقاط slug الخبر (إصلاح «النقرة لا تفتح الخبر»
        // 2026-08-02): مفتاح الخدمة المُعنون، ثم المفاتيح الخام التي يضعها
        // النظام مباشرة عند نقرة إشعار notification-message والتطبيق في
        // الخلفية (onMessageReceived لا يُستدعى هناك)، ثم اشتقاقه من مسار
        // /article/ في URI أو deeplink الخام.
        val slug = intent.getStringExtra(SabqMessagingService.EXTRA_ARTICLE_SLUG)
            ?: intent.getStringExtra("article_slug")
            ?: intent.data?.getQueryParameter("slug")
            ?: articleSlugFromPath(intent.data?.path)
            ?: articleSlugFromPath(intent.getStringExtra("deeplink"))
        val notifId = intent.getStringExtra(SabqMessagingService.EXTRA_NOTIFICATION_ID)
            ?: intent.getStringExtra("notification_id")
            ?: intent.data?.getQueryParameter("id")
        val kind = intent.getStringExtra(SabqMessagingService.EXTRA_KIND)
            ?: intent.getStringExtra("kind")
            ?: intent.getStringExtra("type")
            ?: intent.data?.getQueryParameter("kind")
        pendingPush.set(
            articleSlug = slug,
            notificationId = notifId,
            kind = kind,
            deepLinkPath = intent.data?.path,
            surveyToken = surveyTokenFrom(intent.data),
            draftArticleId = draftIdFrom(intent.data),
        )
    }

    /** sabq://draft/<id> — إشعار needs_revision يفتح محرر المسودة مباشرة. */
    private fun draftIdFrom(uri: Uri?): String? {
        if (uri == null) return null
        if (uri.scheme == "sabq" && uri.host == "draft") {
            return uri.pathSegments.firstOrNull()
        }
        return null
    }

    /** «/article/{slug}» من مسار أو deeplink بأي صيغة، وإلا null. */
    private fun articleSlugFromPath(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val match = Regex("(?:^|/)article/([^/?#]+)").find(raw) ?: return null
        return Uri.decode(match.groupValues[1]).takeIf { it.isNotBlank() }
    }

    /**
     * دعوات الاستطلاع تصل بصيغتين: `sabq://survey/<token>` (نقرة الإشعار)
     * و`https://sabq.org/survey/<token>` (App Link من إيميل الدعوة).
     */
    private fun surveyTokenFrom(uri: Uri?): String? {
        if (uri == null) return null
        if (uri.scheme == "sabq" && uri.host == "survey") {
            return uri.pathSegments.firstOrNull()
        }
        if (uri.pathSegments.firstOrNull() == "survey") {
            return uri.pathSegments.getOrNull(1)
        }
        return null
    }
}
