package com.sabq.vara

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.vara.ui.VaraApp
import kotlinx.coroutines.flow.MutableStateFlow

class VaraActivity : ComponentActivity() {
    private val incomingLink = MutableStateFlow<Uri?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        incomingLink.value = resolveLink(intent)
        setContent {
            val link by incomingLink.collectAsStateWithLifecycle()
            VaraApp(link = link, onLinkConsumed = { incomingLink.value = null })
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        incomingLink.value = resolveLink(intent)
    }

    private fun resolveLink(intent: Intent?): Uri? = intent?.data
        ?: intent?.getStringExtra("deeplink")?.takeIf(String::isNotBlank)?.let(Uri::parse)
        ?: intent?.getStringExtra("fixtureId")?.let { Uri.parse("sabqsports://match/$it") }
}
