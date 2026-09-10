package com.sabq.smart.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.AuthException
import com.sabq.smart.data.AuthRepository
import com.sabq.smart.data.PendingActivationException
import com.sabq.smart.data.TwoFactorRequiredException
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
    /**
     * Credentials were accepted but the account has 2FA enabled, so the
     * server issued a [challengeToken] instead of a session. The login
     * screen shows the TOTP / backup-code entry step. [submitting] drives
     * the inline spinner during a verify attempt; [error] holds the
     * "wrong code" message WITHOUT dropping the still-valid challenge, so
     * the user can retry without re-entering their password. Mirrors iOS
     * `AuthStore.pending2FAChallengeToken` + `errorMessage`.
     */
    data class Requires2FA(
        val challengeToken: String,
        val submitting: Boolean = false,
        val error: String? = null,
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
    private val deviceRegistrationManager: com.sabq.smart.data.push.DeviceRegistrationManager,
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
        // [currentUser] without requiring login. Uses the throttled
        // variant so navigating across screens (each creating an
        // AuthViewModel) doesn't re-hit /members/profile every time.
        viewModelScope.launch { repo.ensureProfileFresh() }
    }

    fun login(email: String, password: String) {
        loginWithCredentials(email, password)
    }

    /** دخول بحساب سبق (بريد أو جوال + كلمة مرور). */
    fun loginWithCredentials(identifier: String, password: String) {
        val id = identifier.trim()
        if (id.isBlank() || password.isBlank()) {
            _form.value = AuthFormState.Error("أدخل البريد الإلكتروني أو الجوال وكلمة المرور")
            return
        }
        viewModelScope.launch {
            _form.value = AuthFormState.Submitting
            _resend.value = ResendActivationState.Idle
            val method = if (id.contains("@")) "email" else "phone_password"
            runCatching { repo.loginWithIdentifier(id, password) }
                .onSuccess {
                    com.sabq.smart.data.analytics.SabqAnalytics.login(method)
                    _form.value = AuthFormState.Success(it)
                }
                .onFailure { e ->
                    _form.value = when (e) {
                        is TwoFactorRequiredException -> AuthFormState.Requires2FA(
                            challengeToken = e.challengeToken,
                        )
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
     * Complete a 2FA-gated login. Only valid while [form] is
     * [AuthFormState.Requires2FA] (the challenge lives inside that
     * state). Pass EITHER a 6-digit TOTP [code] OR a [backupCode]. A
     * wrong code keeps the challenge alive with an inline error so the
     * user retries without re-entering their password; a valid code
     * flips straight to [AuthFormState.Success]. Mirrors iOS
     * `AuthStore.verifyTwoFactor`.
     */
    fun verifyTwoFactor(code: String?, backupCode: String? = null) {
        val state = _form.value as? AuthFormState.Requires2FA ?: return
        if (code.isNullOrBlank() && backupCode.isNullOrBlank()) {
            _form.value = state.copy(error = "أدخل رمز التحقق")
            return
        }
        viewModelScope.launch {
            _form.value = state.copy(submitting = true, error = null)
            _resend.value = ResendActivationState.Idle
            runCatching { repo.verifyTwoFactor(state.challengeToken, code, backupCode) }
                .onSuccess {
                    com.sabq.smart.data.analytics.SabqAnalytics.login("2fa")
                    _form.value = AuthFormState.Success(it)
                }
                .onFailure { e ->
                    _form.value = state.copy(
                        submitting = false,
                        error = (e as? AuthException)?.message
                            ?: e.localizedMessage
                            ?: "رمز التحقق غير صحيح",
                    )
                }
        }
    }

    /** إلغاء خطوة المصادقة الثنائية والرجوع لنموذج الدخول. */
    fun cancelTwoFactor() {
        if (_form.value is AuthFormState.Requires2FA) {
            _form.value = AuthFormState.Idle
        }
    }

    /**
     * إرسال رمز OTP للجوال. يرجع نجاح/رسالة للواجهة (عدّاد إعادة الإرسال).
     */
    fun sendPhoneCode(phone: String, onResult: (ok: Boolean, message: String) -> Unit) {
        viewModelScope.launch {
            _form.value = AuthFormState.Submitting
            _resend.value = ResendActivationState.Idle
            runCatching { repo.sendPhoneCode(phone) }
                .onSuccess { resp ->
                    val msg = resp.message
                        ?: if (resp.success) "تم إرسال رمز التحقق" else "تعذّر إرسال رمز التحقق"
                    if (resp.success) {
                        _form.value = AuthFormState.Idle
                        onResult(true, msg)
                    } else {
                        _form.value = AuthFormState.Error(msg)
                        onResult(false, msg)
                    }
                }
                .onFailure { e ->
                    val msg = (e as? AuthException)?.message
                        ?: e.localizedMessage
                        ?: "تعذّر إرسال رمز التحقق"
                    _form.value = AuthFormState.Error(msg)
                    onResult(false, msg)
                }
        }
    }

    /** التحقق من رمز الجوال وتثبيت الجلسة. */
    fun verifyPhoneCode(phone: String, code: String) {
        if (code.length < 4) {
            _form.value = AuthFormState.Error("رمز التحقق غير صحيح")
            return
        }
        viewModelScope.launch {
            _form.value = AuthFormState.Submitting
            _resend.value = ResendActivationState.Idle
            runCatching { repo.verifyPhoneCode(phone, code) }
                .onSuccess {
                    com.sabq.smart.data.analytics.SabqAnalytics.login("phone")
                    _form.value = AuthFormState.Success(it)
                }
                .onFailure { e ->
                    if (e is TwoFactorRequiredException) {
                        _form.value = AuthFormState.Requires2FA(e.challengeToken)
                        return@onFailure
                    }
                    _form.value = AuthFormState.Error(
                        (e as? AuthException)?.message
                            ?: e.localizedMessage
                            ?: "رمز التحقق غير صحيح",
                    )
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

    /**
     * Sign in with Google via Credential Manager. The screen runs the
     * Credential Manager request, extracts the `idToken` from the
     * returned `GoogleIdTokenCredential`, and passes it here. The VM
     * forwards to the backend and propagates the same form-state
     * transitions as the email/password path.
     */
    fun loginWithGoogle(idToken: String) {
        viewModelScope.launch {
            _form.value = AuthFormState.Submitting
            _resend.value = ResendActivationState.Idle
            runCatching { repo.loginWithGoogle(idToken) }
                .onSuccess {
                    com.sabq.smart.data.analytics.SabqAnalytics.login("google")
                    _form.value = AuthFormState.Success(it)
                }
                .onFailure { e ->
                    if (e is TwoFactorRequiredException) {
                        _form.value = AuthFormState.Requires2FA(e.challengeToken)
                        return@onFailure
                    }
                    _form.value = AuthFormState.Error(
                        (e as? AuthException)?.message
                            ?: e.localizedMessage
                            ?: "تعذّر تسجيل الدخول عبر Google",
                    )
                }
        }
    }

    /**
     * Sign in with Apple via the Custom-Tab OAuth flow. The screen
     * orchestrates the Apple authorize URL + redirect intercept, then
     * passes the resulting `identityToken` here. `firstName` / `lastName`
     * / `email` come from Apple's `user` JSON ON FIRST AUTH ONLY — pass
     * null on subsequent attempts.
     */
    fun loginWithApple(
        identityToken: String,
        firstName: String?,
        lastName: String?,
        email: String?,
    ) {
        viewModelScope.launch {
            _form.value = AuthFormState.Submitting
            _resend.value = ResendActivationState.Idle
            runCatching {
                repo.loginWithApple(
                    identityToken = identityToken,
                    firstName = firstName,
                    lastName = lastName,
                    email = email,
                )
            }
                .onSuccess {
                    com.sabq.smart.data.analytics.SabqAnalytics.login("apple")
                    _form.value = AuthFormState.Success(it)
                }
                .onFailure { e ->
                    if (e is TwoFactorRequiredException) {
                        _form.value = AuthFormState.Requires2FA(e.challengeToken)
                        return@onFailure
                    }
                    _form.value = AuthFormState.Error(
                        (e as? AuthException)?.message
                            ?: e.localizedMessage
                            ?: "تعذّر تسجيل الدخول عبر Apple",
                    )
                }
        }
    }

    /** Set a user-facing error from the OAuth UI BEFORE the network
     *  call (cancelled flow, missing Play Services, blocked Custom Tab,
     *  etc.). Mirrors iOS `AuthStore.setExternalAuthError`. */
    fun setExternalAuthError(message: String) {
        _form.value = AuthFormState.Error(message)
    }

    fun logout() {
        viewModelScope.launch {
            // Deactivate the account-bound FCM row while the Bearer session is
            // still valid; otherwise Majlis pushes could reach the next user.
            runCatching { deviceRegistrationManager.unregister() }
            repo.logout()
            _form.value = AuthFormState.Idle
        }
    }

    fun resetForm() {
        _form.value = AuthFormState.Idle
        _resend.value = ResendActivationState.Idle
    }
}
