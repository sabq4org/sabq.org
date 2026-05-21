package com.sabq.smart.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.AuthException
import com.sabq.smart.data.AuthRepository
import com.sabq.smart.data.PendingActivationException
import com.sabq.smart.data.User
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

sealed interface AuthFormState {
    data object Idle : AuthFormState
    data object Submitting : AuthFormState
    data class Error(val message: String) : AuthFormState
    /**
     * Login failed because the backend signalled
     * `requiresActivation: true`. Carries the (already-localised)
     * server message plus the userId + email so the login screen can
     * surface a resend-activation button targeted at the right account.
     */
    data class PendingActivation(
        val message: String,
        val userId: String?,
        val email: String?,
    ) : AuthFormState
    data class Success(val user: User) : AuthFormState
}

/**
 * Side-channel state for the "resend activation email" affordance.
 * Distinct from [AuthFormState] so the resend action can complete
 * without flipping the form back to idle (we want to keep the
 * PendingActivation banner visible underneath while showing the
 * success/failure of the resend itself).
 */
sealed interface ResendActivationState {
    data object Idle : ResendActivationState
    data object Sending : ResendActivationState
    data class Sent(val message: String) : ResendActivationState
    data class Error(val message: String) : ResendActivationState
}

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val repo: AuthRepository,
) : ViewModel() {

    val currentUser: StateFlow<User?> = repo.user
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val _form = MutableStateFlow<AuthFormState>(AuthFormState.Idle)
    val form: StateFlow<AuthFormState> = _form.asStateFlow()

    private val _resend = MutableStateFlow<ResendActivationState>(ResendActivationState.Idle)
    val resend: StateFlow<ResendActivationState> = _resend.asStateFlow()

    init {
        // Resolve the current user on construction. If a token is
        // already stored from a previous session, this hydrates
        // [currentUser] without requiring login.
        viewModelScope.launch { repo.refreshProfile() }
    }

    fun login(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            _form.value = AuthFormState.Error("الرجاء إدخال البريد وكلمة المرور")
            return
        }
        viewModelScope.launch {
            _form.value = AuthFormState.Submitting
            _resend.value = ResendActivationState.Idle
            runCatching { repo.login(email, password) }
                .onSuccess { _form.value = AuthFormState.Success(it) }
                .onFailure { e ->
                    _form.value = when (e) {
                        is PendingActivationException -> AuthFormState.PendingActivation(
                            message = e.message ?: "الحساب غير مفعل. يرجى تفعيل الحساب أولاً",
                            userId = e.userId,
                            email = e.email,
                        )
                        is AuthException -> AuthFormState.Error(e.message ?: "تعذّر تسجيل الدخول")
                        else -> AuthFormState.Error(e.localizedMessage ?: "حدث خطأ، حاول مجدداً")
                    }
                }
        }
    }

    /**
     * Trigger the activation email resend for the account whose login
     * just failed with `requiresActivation`. The button calling this
     * is only visible while [form] is in [AuthFormState.PendingActivation].
     */
    fun resendActivation() {
        val pending = _form.value as? AuthFormState.PendingActivation ?: return
        viewModelScope.launch {
            _resend.value = ResendActivationState.Sending
            runCatching { repo.resendActivation(userId = pending.userId, email = pending.email) }
                .onSuccess { response ->
                    _resend.value = if (response.success) {
                        ResendActivationState.Sent(
                            response.message ?: "تم إرسال رمز التفعيل إلى بريدك الإلكتروني",
                        )
                    } else {
                        ResendActivationState.Error(
                            response.message ?: "تعذّر إعادة إرسال رمز التفعيل",
                        )
                    }
                }
                .onFailure { e ->
                    val msg = (e as? AuthException)?.message
                        ?: e.localizedMessage
                        ?: "تعذّر إعادة إرسال رمز التفعيل"
                    _resend.value = ResendActivationState.Error(msg)
                }
        }
    }

    fun logout() {
        viewModelScope.launch {
            repo.logout()
            _form.value = AuthFormState.Idle
        }
    }

    fun resetForm() {
        _form.value = AuthFormState.Idle
        _resend.value = ResendActivationState.Idle
    }
}
