package com.sabq.smart.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.sabq.smart.ui.theme.SabqAccent
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.settingsDataStore by preferencesDataStore(name = "settings_prefs")

private val DARK_MODE_KEY = booleanPreferencesKey("is_dark_mode")
private val DARK_MODE_AUTO_KEY = booleanPreferencesKey("dark_mode_follows_system")
private val ACCENT_KEY = stringPreferencesKey("app_accent")
private val FONT_SIZE_KEY = floatPreferencesKey("article_font_size")
private val LINE_SPACING_KEY = floatPreferencesKey("article_line_spacing")
private val READER_SERIF_KEY = booleanPreferencesKey("article_use_reader_font")

/** Onboarding completion flag — kept under the same key name iOS uses
 *  (`sabqHasCompletedOnboardingV2`) so future cross-platform telemetry
 *  / debugging stays symmetric. Bump the version suffix when a
 *  redesigned onboarding ships. */
private val ONBOARDED_V2_KEY = booleanPreferencesKey("sabqHasCompletedOnboardingV2")

private val BROWSING_MODE_KEY = stringPreferencesKey("sabq_browsing_mode")

/**
 * وضع التصفح — يقابل iOS `LiteModeManager` بنفس المفاتيح الثلاثة:
 * كامل / Lite يدوي / تلقائي حسب سرعة الاتصال.
 */
enum class SabqBrowsingMode(val key: String, val arabicLabel: String, val arabicSubtitle: String) {
    Full(key = "full", arabicLabel = "التصفح الكامل", arabicSubtitle = "كل الميزات والبلوكات"),
    Lite(key = "lite", arabicLabel = "سبق Lite", arabicSubtitle = "أخبار فقط — أسرع وأخف"),
    Auto(key = "auto", arabicLabel = "تلقائي", arabicSubtitle = "يتبدّل حسب سرعة الاتصال");

    companion object {
        fun fromKey(raw: String?): SabqBrowsingMode =
            entries.firstOrNull { it.key == raw } ?: Full
    }
}

/**
 * User preferences — mirrors iOS @AppStorage keys 1:1:
 *   - `isDarkMode` (Bool, default false)
 *   - `appAccent` (String, default "blue")
 *   - `articleFontSize` (Double, default 17)
 *   - `articleLineSpacing` (Double, default 6)
 *   - `articleUseReaderFont` (Bool, default false) — switches the
 *     article body to a serif design when true. iOS uses
 *     `.font(... design: .serif)`; on Compose we resolve this to
 *     `FontFamily.Serif`.
 *
 * Plus an Android-only `darkModeFollowsSystem` flag because Android
 * has a stronger expectation that apps honour the system dark-mode
 * preference unless overridden. When this is true the explicit
 * `isDarkMode` setting is ignored and the OS value wins.
 */
data class AppSettings(
    val followsSystemDark: Boolean = true,
    val isDarkMode: Boolean = false,
    val accent: SabqAccent = SabqAccent.Blue,
    val articleFontSize: Float = 17f,
    val articleLineSpacing: Float = 6f,
    val articleUseReaderFont: Boolean = false,
    /** True once the user has either finished the 4-slide welcome flow
     *  or tapped "تخطّي". Default false → onboarding is shown on first
     *  launch of every fresh install. */
    val hasCompletedOnboardingV2: Boolean = false,
    /** وضع التصفح (كامل / Lite / تلقائي). */
    val browsingMode: SabqBrowsingMode = SabqBrowsingMode.Full,
)

@Singleton
class SettingsStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    val settings: Flow<AppSettings> = context.settingsDataStore.data.map { prefs ->
        AppSettings(
            followsSystemDark = prefs[DARK_MODE_AUTO_KEY] ?: true,
            isDarkMode = prefs[DARK_MODE_KEY] ?: false,
            accent = SabqAccent.fromKey(prefs[ACCENT_KEY]),
            articleFontSize = prefs[FONT_SIZE_KEY] ?: 17f,
            articleLineSpacing = prefs[LINE_SPACING_KEY] ?: 6f,
            articleUseReaderFont = prefs[READER_SERIF_KEY] ?: false,
            hasCompletedOnboardingV2 = prefs[ONBOARDED_V2_KEY] ?: false,
            browsingMode = SabqBrowsingMode.fromKey(prefs[BROWSING_MODE_KEY]),
        )
    }

    suspend fun setFollowsSystemDark(value: Boolean) {
        context.settingsDataStore.edit { it[DARK_MODE_AUTO_KEY] = value }
    }

    suspend fun setDarkMode(value: Boolean) {
        context.settingsDataStore.edit {
            it[DARK_MODE_KEY] = value
            it[DARK_MODE_AUTO_KEY] = false // explicit choice overrides system
        }
    }

    suspend fun setAccent(accent: SabqAccent) {
        context.settingsDataStore.edit { it[ACCENT_KEY] = accent.key }
    }

    suspend fun setArticleFontSize(value: Float) {
        // iOS clamps to 13...22; we keep 14...24 here for parity with the
        // existing Settings screen slider which exposes the wider range.
        context.settingsDataStore.edit {
            it[FONT_SIZE_KEY] = value.coerceIn(13f, 24f)
        }
    }

    suspend fun setArticleLineSpacing(value: Float) {
        context.settingsDataStore.edit {
            it[LINE_SPACING_KEY] = value.coerceIn(2f, 12f)
        }
    }

    suspend fun setArticleUseReaderFont(value: Boolean) {
        context.settingsDataStore.edit { it[READER_SERIF_KEY] = value }
    }

    suspend fun setOnboardingCompleted(value: Boolean) {
        context.settingsDataStore.edit { it[ONBOARDED_V2_KEY] = value }
    }

    suspend fun setBrowsingMode(mode: SabqBrowsingMode) {
        context.settingsDataStore.edit { it[BROWSING_MODE_KEY] = mode.key }
    }
}
