package com.sabq.smart.ui.foldable

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker

/**
 * ترتيب مركز المباراة بحسب وضعية الجهاز القابل للطي — نظير DuoMatchLayout في iOS.
 * - STANDARD: الهاتف العادي واللوحي والقابل للطي مطويًا: التخطيط الحالي كما هو.
 * - COLUMNS: مفتوح مسطّحًا أو بوضع الكتاب: سير المباراة يمينًا وبقية التبويبات يسارًا.
 * - TABLETOP: نصف مطوي بمفصلة أفقية: النتيجة كبيرة فوق المفصلة والتبويبات تحتها.
 */
enum class MatchLayoutMode { STANDARD, COLUMNS, TABLETOP }

/** حالة المفصلة كما يراها التطبيق. حدود المفصلة بإحداثيات النافذة (بكسل). */
data class FoldInfo(
    val isFoldable: Boolean = false,
    val halfOpened: Boolean = false,
    val horizontalHinge: Boolean = false,
    val hingeTopPx: Int? = null,
    val hingeBottomPx: Int? = null,
)

object FoldPosture {
    /** أصغر عرض (dp) يُفتح فيه العمودان على قابل للطي مفتوحًا. */
    const val COLUMNS_MIN_WIDTH_DP = 600

    private const val PREFS = "sabq_foldable"
    private const val KEY_OBSERVED = "observed"

    /**
     * قرار التخطيط: محصور في الأجهزة القابلة للطي فقط (بقرار iOS نفسه: لا أثر
     * على الهاتف العادي أو اللوحي)، وقبل وصول التفاصيل يبقى المعتاد.
     */
    fun matchLayout(info: FoldInfo, widthDp: Int, hasDetail: Boolean): MatchLayoutMode = when {
        !hasDetail || !info.isFoldable -> MatchLayoutMode.STANDARD
        info.halfOpened && info.horizontalHinge && info.hingeTopPx != null -> MatchLayoutMode.TABLETOP
        widthDp >= COLUMNS_MIN_WIDTH_DP -> MatchLayoutMode.COLUMNS
        else -> MatchLayoutMode.STANDARD
    }

    /** ملاحظة مُتعلَّمة: ظهرت مفصلة مرة على هذا الجهاز فهو قابل للطي ولو طُوي لاحقًا. */
    fun wasObserved(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_OBSERVED, false)

    fun markObserved(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_OBSERVED, true).apply()
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

/** يتابع وضعية المفصلة لحظيًا (يتغير عند الطي/الفتح/التدوير). */
@Composable
fun rememberFoldInfo(): FoldInfo {
    val context = LocalContext.current
    val activity = remember(context) { context.findActivity() }
    var info by remember { mutableStateOf(FoldInfo(isFoldable = FoldPosture.wasObserved(context))) }
    LaunchedEffect(activity) {
        val act = activity ?: return@LaunchedEffect
        WindowInfoTracker.getOrCreate(act).windowLayoutInfo(act).collect { layout ->
            val fold = layout.displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull()
            if (fold != null && !FoldPosture.wasObserved(act)) FoldPosture.markObserved(act)
            info = FoldInfo(
                isFoldable = fold != null || FoldPosture.wasObserved(act),
                halfOpened = fold?.state == FoldingFeature.State.HALF_OPENED,
                horizontalHinge = fold?.orientation == FoldingFeature.Orientation.HORIZONTAL,
                hingeTopPx = fold?.bounds?.top,
                hingeBottomPx = fold?.bounds?.bottom,
            )
        }
    }
    return info
}

/** وضعية مركز المباراة الحالية. */
@Composable
fun rememberMatchLayoutMode(hasDetail: Boolean): Pair<MatchLayoutMode, FoldInfo> {
    val info = rememberFoldInfo()
    val widthDp = LocalConfiguration.current.screenWidthDp
    return FoldPosture.matchLayout(info, widthDp, hasDetail) to info
}
