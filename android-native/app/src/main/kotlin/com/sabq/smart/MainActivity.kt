package com.sabq.smart

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.sabq.smart.nav.SabqApp
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
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
}
