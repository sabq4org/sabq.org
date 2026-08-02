package com.sabq.smart.feature.lite

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent

/** وصول Compose إلى [LiteModeManager] بلا ViewModel — نفس نمط
 *  ArticleDetailEntryPoint. أول استدعاء يُنشئ الـ Singleton فيبدأ
 *  مجسّ الشبكة (البدء الكسول من المُنشئ). */
@EntryPoint
@InstallIn(SingletonComponent::class)
interface LiteModeEntryPoint {
    fun liteModeManager(): LiteModeManager
}

@Composable
fun rememberLiteModeManager(): LiteModeManager {
    val context = LocalContext.current
    return remember {
        EntryPointAccessors.fromApplication(
            context.applicationContext,
            LiteModeEntryPoint::class.java,
        ).liteModeManager()
    }
}
