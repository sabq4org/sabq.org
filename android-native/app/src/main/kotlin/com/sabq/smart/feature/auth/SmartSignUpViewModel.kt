package com.sabq.smart.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.ArticleRepository
import com.sabq.smart.data.AuthException
import com.sabq.smart.data.AuthRepository
import com.sabq.smart.data.RegisterOutcome
import com.sabq.smart.data.Section
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * State machine for the conversational signup — ports iOS
 * `SignUpFlowView.swift` step-by-step:
 *
 *   askName → askEmail → askPassword → askInterests → submitting →
 *   building → done.
 *
 * The chat history (AI / user bubbles) is built incrementally by the
 * screen as the user advances; this VM only owns the durable state
 * (which step we're on, what's been collected, what to render in the
 * "build profile" animation, and any error message).
 */
@HiltViewModel
class SmartSignUpViewModel @Inject constructor(
    private val authRepo: AuthRepository,
    private val articleRepo: ArticleRepository,
) : ViewModel() {

    enum class Step {
        AskName, AskEmail, AskPassword, AskInterests, Submitting, Building, Done,
        /** Account created but session not granted — backend sent an
         *  activation email. The screen renders a "check your email"
         *  success card with a "إعادة إرسال رابط التفعيل" button. */
        PendingActivation,
    }

    /** Side-channel state for the resend-activation affordance. Kept
     *  separate from [Step] so the resend can complete without leaving
     *  the PendingActivation card. */
    sealed interface ResendState {
        data object Idle : ResendState
        data object Sending : ResendState
        data class Sent(val message: String) : ResendState
        data class Error(val message: String) : ResendState
    }

    enum class BubbleRole { Ai, User }

    data class Bubble(val id: Long, val role: BubbleRole, val text: String)

    data class UiState(
        val step: Step = Step.AskName,
        val messages: List<Bubble> = emptyList(),
        val name: String = "",
        val email: String = "",
        val password: String = "",
        val categories: List<Section> = emptyList(),
        val selectedInterestIds: Set<String> = emptySet(),
        val errorMessage: String? = null,
        /** Index 0..buildSteps.size of the currently-active build step. */
        val buildProgress: Int = 0,
        /** Server message shown on the "تم إنشاء الحساب" card when the
         *  backend created the account without granting a session. */
        val pendingActivationMessage: String? = null,
        val pendingActivationUserId: String? = null,
        val pendingActivationEmail: String? = null,
        val resend: ResendState = ResendState.Idle,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var nextBubbleId: Long = 0L

    init {
        viewModelScope.launch {
            // Warm the categories cache so the interests step is instant.
            runCatching { articleRepo.getSections() }
                .onSuccess { sections -> _state.update { it.copy(categories = sections) } }
        }
    }

    fun appendUserBubble(text: String) {
        _state.update { it.copy(messages = it.messages + Bubble(nextId(), BubbleRole.User, text)) }
    }

    fun appendAiBubble(text: String) {
        _state.update { it.copy(messages = it.messages + Bubble(nextId(), BubbleRole.Ai, text)) }
    }

    fun setStep(step: Step) {
        _state.update { it.copy(step = step) }
    }

    fun setName(value: String) {
        _state.update { it.copy(name = value) }
    }

    fun setEmail(value: String) {
        _state.update { it.copy(email = value) }
    }

    fun setPassword(value: String) {
        _state.update { it.copy(password = value) }
    }

    fun toggleInterest(id: String) {
        _state.update { current ->
            val set = current.selectedInterestIds.toMutableSet()
            if (id in set) set.remove(id) else set.add(id)
            current.copy(selectedInterestIds = set)
        }
    }

    fun setBuildProgress(progress: Int) {
        _state.update { it.copy(buildProgress = progress) }
    }

    fun clearError() {
        _state.update { it.copy(errorMessage = null) }
    }

    /**
     * Run the actual register call + (if any interests selected and the
     * register call established a session) persist them. Drops the
     * conversation into [Step.Building] on success, [Step.AskName] with
     * an error message on failure.
     */
    fun submitRegistration() {
        val snap = _state.value
        if (snap.step == Step.Submitting) return
        _state.update { it.copy(step = Step.Submitting, errorMessage = null) }
        viewModelScope.launch {
            val ok = runCatching {
                authRepo.register(snap.name.trim(), snap.email.trim(), snap.password)
            }
            ok.onSuccess { outcome ->
                when (outcome) {
                    is RegisterOutcome.Authenticated -> {
                        if (snap.selectedInterestIds.isNotEmpty()) {
                            runCatching {
                                val ordered = snap.categories
                                    .filter { it.id in snap.selectedInterestIds }
                                    .map { it.id }
                                if (ordered.isNotEmpty()) authRepo.updateInterests(ordered)
                            }
                        }
                        _state.update { it.copy(step = Step.Building, buildProgress = 0) }
                    }
                    is RegisterOutcome.PendingActivation -> {
                        // No session yet — surface the "check your email"
                        // success card with a resend affordance. Matches
                        // iOS `registrationPending` branch.
                        _state.update {
                            it.copy(
                                step = Step.PendingActivation,
                                pendingActivationMessage = outcome.message,
                                pendingActivationUserId = outcome.userId,
                                pendingActivationEmail = outcome.email,
                                resend = ResendState.Idle,
                            )
                        }
                    }
                }
            }
            ok.onFailure { e ->
                val msg = if (e is AuthException) e.message ?: "تعذّر إنشاء الحساب"
                else e.localizedMessage ?: "حدث خطأ، حاول مجدداً"
                _state.update {
                    it.copy(
                        step = Step.AskPassword,
                        errorMessage = msg,
                    )
                }
            }
        }
    }

    /**
     * Re-send the activation email for the account that just registered
     * without an auto-granted session. Mirrors iOS
     * `AuthStore.resendActivation()` — uses the userId when available,
     * falls back to the email the user typed.
     */
    fun resendActivation() {
        val snap = _state.value
        if (snap.resend is ResendState.Sending) return
        if (snap.pendingActivationUserId == null && snap.pendingActivationEmail == null) return
        _state.update { it.copy(resend = ResendState.Sending) }
        viewModelScope.launch {
            runCatching {
                authRepo.resendActivation(
                    userId = snap.pendingActivationUserId,
                    email = snap.pendingActivationEmail,
                )
            }
                .onSuccess { response ->
                    _state.update {
                        it.copy(
                            resend = if (response.success) ResendState.Sent(
                                response.message
                                    ?: "تم إرسال رابط التفعيل إلى بريدك الإلكتروني",
                            ) else ResendState.Error(
                                response.message ?: "تعذّر إعادة إرسال رابط التفعيل",
                            ),
                        )
                    }
                }
                .onFailure { e ->
                    val msg = (e as? AuthException)?.message
                        ?: e.localizedMessage
                        ?: "تعذّر إعادة إرسال رابط التفعيل"
                    _state.update { it.copy(resend = ResendState.Error(msg)) }
                }
        }
    }

    fun finish() {
        _state.update { it.copy(step = Step.Done) }
    }

    fun resetToName() {
        _state.update {
            it.copy(
                step = Step.AskName,
                messages = emptyList(),
                name = "",
                email = "",
                password = "",
                selectedInterestIds = emptySet(),
                errorMessage = null,
                buildProgress = 0,
            )
        }
    }

    private fun nextId(): Long {
        nextBubbleId += 1
        return nextBubbleId
    }
}
