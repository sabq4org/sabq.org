package com.sabq.smart.data.push

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Single-instance bridge between [com.sabq.smart.MainActivity] and the
 * Compose nav graph. When a push notification's [PendingIntent] fires
 * (either cold-launching the app or routing into an already-open one
 * via `onNewIntent`), MainActivity records the extras here. The nav
 * layer in `SabqApp` collects the flow, navigates as appropriate, then
 * calls [consume] so the same intent isn't replayed on configuration
 * change.
 *
 * Routing rules (mirror iOS):
 *   - `articleSlug` present → push `article/{slug}` and dismiss the
 *     notifications drawer for the row.
 *   - Only `notificationId` present → push the Notifications screen so
 *     the user lands on the row.
 *   - Neither → no-op (the intent was a generic launch).
 */
@Singleton
class PendingPushDeepLink @Inject constructor() {

    data class Target(
        val articleSlug: String?,
        val notificationId: String?,
        val kind: String?,
        val deepLinkPath: String? = null,
        /** توكن دعوة استطلاع من sabq://survey/<token> أو https://sabq.org/survey/<token> */
        val surveyToken: String? = null,
        /** معرف مسودة من sabq://draft/<id> — إشعار needs_revision يفتح المحرر مباشرة */
        val draftArticleId: String? = null,
    )

    private val _target = MutableStateFlow<Target?>(null)
    val target: StateFlow<Target?> = _target.asStateFlow()

    fun set(
        articleSlug: String?,
        notificationId: String?,
        kind: String?,
        deepLinkPath: String? = null,
        surveyToken: String? = null,
        draftArticleId: String? = null,
    ) {
        val slug = articleSlug?.takeIf { it.isNotBlank() }
        val id = notificationId?.takeIf { it.isNotBlank() }
        // قائمة بيضاء للمسارات المدعومة — فرع التوجيه في SabqApp هو المرجع.
        val path = deepLinkPath?.takeIf {
            it.startsWith("/asian-cup") || it == "/roshn" ||
                it.startsWith("/roshn/") || it.startsWith("/sports/team/") ||
                it == "/kings-cup" || it.startsWith("/kings-cup/")
        }
        val survey = surveyToken?.takeIf { it.isNotBlank() }
        val draft = draftArticleId?.takeIf { it.isNotBlank() }
        if (slug == null && id == null && path == null && survey == null && draft == null) return
        _target.value = Target(
            articleSlug = slug,
            notificationId = id,
            kind = kind?.takeIf { it.isNotBlank() },
            deepLinkPath = path,
            surveyToken = survey,
            draftArticleId = draft,
        )
    }

    fun consume() {
        _target.value = null
    }
}
