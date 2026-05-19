package com.sabq.smart.feature.article

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.Comment
import com.sabq.smart.data.CommentsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.HttpException

/**
 * Per-article comments state container — Hilt-assisted because each
 * instance is keyed on the article's slug. Ports iOS [CommentsStore]
 * (Stores/CommentsStore.swift) 1:1, including its three submit
 * outcomes (published / awaitingReview / rejected) and the optimistic
 * insertion path when the server happens to auto-approve sync.
 */
@HiltViewModel
class CommentsViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val repo: CommentsRepository,
) : ViewModel() {

    private val slug: String = savedState["slug"] ?: ""

    enum class SubmitOutcome { PUBLISHED, AWAITING_REVIEW, REJECTED }

    sealed interface LoadState {
        data object Idle : LoadState
        data object Loading : LoadState
        data object Loaded : LoadState
        data class Failed(val message: String) : LoadState
    }

    data class UiState(
        val comments: List<Comment> = emptyList(),
        val loadState: LoadState = LoadState.Idle,
        val isSubmitting: Boolean = false,
        val replyingTo: Comment? = null,
        val lastSubmitOutcome: SubmitOutcome? = null,
        val lastError: String? = null,
    ) {
        /** Total comment count including replies (matches iOS commentsSubtitle). */
        val totalCount: Int get() = comments.fold(0) { acc, c -> acc + 1 + c.replies.size }
    }

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        if (_state.value.loadState is LoadState.Loading) return
        _state.update { it.copy(loadState = LoadState.Loading) }
        viewModelScope.launch {
            runCatching { repo.getComments(slug) }
                .onSuccess { items ->
                    _state.update {
                        it.copy(
                            comments = items,
                            loadState = LoadState.Loaded,
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            loadState = LoadState.Failed(
                                e.localizedMessage ?: "تعذر تحميل التعليقات",
                            ),
                        )
                    }
                }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            runCatching { repo.getComments(slug) }
                .onSuccess { items ->
                    _state.update { it.copy(comments = items, loadState = LoadState.Loaded) }
                }
            // Silent on refresh failure — keep stale list visible (matches iOS).
        }
    }

    fun setReplyTarget(target: Comment?) {
        _state.update { it.copy(replyingTo = target) }
    }

    /** Submit a comment / reply. Returns the resolved outcome via
     *  [UiState.lastSubmitOutcome]. Throws [SubmitException] on
     *  network/auth failure so the screen can surface the right banner. */
    suspend fun submit(content: String): SubmitOutcome {
        val trimmed = content.trim()
        if (trimmed.isEmpty()) throw SubmitException("اكتب نص التعليق قبل الإرسال")
        if (trimmed.length > MAX_LENGTH) {
            throw SubmitException("التعليق طويل جداً (الحد الأقصى $MAX_LENGTH حرف)")
        }

        _state.update { it.copy(isSubmitting = true, lastError = null) }

        val parent = _state.value.replyingTo
        try {
            val saved = repo.submit(slug = slug, content = trimmed, parentId = parent?.id)
            val outcome = outcomeFor(saved)
            _state.update { current ->
                val updated = if (outcome == SubmitOutcome.PUBLISHED) {
                    if (parent != null) {
                        // Splice the new reply into its parent's replies list.
                        current.comments.map { c ->
                            if (c.id == parent.id) c.copy(replies = c.replies + saved) else c
                        }
                    } else {
                        listOf(saved) + current.comments
                    }
                } else current.comments
                current.copy(
                    comments = updated,
                    isSubmitting = false,
                    lastSubmitOutcome = outcome,
                    lastError = null,
                    replyingTo = null,
                )
            }
            return outcome
        } catch (e: HttpException) {
            val msg = when (e.code()) {
                401 -> "الرجاء تسجيل الدخول لإرسال التعليق"
                403 -> "غير مصرح بنشر التعليق"
                else -> e.localizedMessage ?: "تعذر إرسال التعليق"
            }
            _state.update { it.copy(isSubmitting = false, lastError = msg) }
            throw SubmitException(msg, unauthorized = e.code() == 401)
        } catch (e: SubmitException) {
            _state.update { it.copy(isSubmitting = false, lastError = e.message) }
            throw e
        } catch (e: Exception) {
            val msg = e.localizedMessage ?: "تعذر إرسال التعليق"
            _state.update { it.copy(isSubmitting = false, lastError = msg) }
            throw SubmitException(msg)
        }
    }

    private fun outcomeFor(comment: Comment): SubmitOutcome = when (comment.status?.lowercase()) {
        "approved" -> SubmitOutcome.PUBLISHED
        "rejected" -> SubmitOutcome.REJECTED
        else -> SubmitOutcome.AWAITING_REVIEW
    }

    companion object {
        /** Max chars accepted client-side. iOS uses the same value. */
        const val MAX_LENGTH = 2000
    }
}

class SubmitException(
    message: String,
    val unauthorized: Boolean = false,
) : RuntimeException(message)
