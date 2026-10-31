package com.sabq.smart.feature.comments

import com.sabq.smart.data.AuthRepository
import com.sabq.smart.data.Comment
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** أسباب البلاغ — نفس قيم الخادم `COMMENT_REPORT_REASONS` ونفس نصوص iOS. */
enum class CommentReportReason(val wire: String, val label: String) {
    OFFENSIVE("offensive", "محتوى مسيء أو غير لائق"),
    HARASSMENT("harassment", "إساءة أو تحرش بشخص"),
    SPAM("spam", "رسائل مزعجة أو إعلان"),
    MISINFORMATION("misinformation", "معلومة مضللة"),
    OTHER("other", "سبب آخر"),
}

/**
 * الإبلاغ والحظر (سياسة Google Play للمحتوى الذي ينشره المستخدمون، وبند أبل 1.2).
 * مرآة iOS `CommentSafetyStore`: قائمة الحظر محفوظة في الخادم وتعود على أي جهاز،
 * وتعليقات المحظورين وما أبلغ عنه القارئ تُخفى محليًا فورًا.
 */
@Singleton
class CommentSafetyStore @Inject constructor(
    private val api: CommentSafetyApi,
    auth: AuthRepository,
) {
    data class State(
        val blockedUsers: List<ApiBlockedUser> = emptyList(),
        val reportedCommentIds: Set<String> = emptySet(),
    ) {
        val blockedIds: Set<String> get() = blockedUsers.mapTo(HashSet()) { it.id }
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    init {
        scope.launch {
            auth.user.map { it?.id }.distinctUntilChanged().collect { userId ->
                _state.value = State()
                if (userId != null) reloadBlocked()
            }
        }
    }

    suspend fun reloadBlocked() {
        val users = runCatching { api.blockedUsers().users }.getOrNull() ?: return
        _state.update { it.copy(blockedUsers = users) }
    }

    suspend fun report(commentId: String, reason: CommentReportReason) {
        api.report(commentId, CommentReportBody(reason = reason.wire))
        _state.update { it.copy(reportedCommentIds = it.reportedCommentIds + commentId) }
    }

    suspend fun block(userId: String, name: String?) {
        api.block(BlockUserBody(userId))
        _state.update { current ->
            if (current.blockedUsers.any { it.id == userId }) current
            else current.copy(blockedUsers = listOf(ApiBlockedUser(id = userId, name = name)) + current.blockedUsers)
        }
    }

    suspend fun unblock(userId: String) {
        api.unblock(userId)
        _state.update { current -> current.copy(blockedUsers = current.blockedUsers.filterNot { it.id == userId }) }
    }
}

/** التعليقات بعد إخفاء المحظورين وما أبلغ عنه القارئ، بما فيها الردود. */
fun visibleComments(comments: List<Comment>, state: CommentSafetyStore.State): List<Comment> {
    val blocked = state.blockedIds
    fun hidden(c: Comment) = c.id in state.reportedCommentIds || (c.userId != null && c.userId in blocked)
    return comments.mapNotNull { c ->
        if (hidden(c)) null else c.copy(replies = c.replies.filterNot(::hidden))
    }
}
