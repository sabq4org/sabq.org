package com.sabq.smart.data

import com.sabq.smart.data.api.ApiErrorResponse
import com.sabq.smart.data.api.ApiLoginResponse
import com.sabq.smart.data.api.AppleFullName
import com.sabq.smart.data.api.AppleOAuthRequest
import com.sabq.smart.data.api.GoogleOAuthRequest
import com.sabq.smart.data.api.LoginRequest
import com.sabq.smart.data.api.OAuthDeviceInfo
import com.sabq.smart.data.api.PhoneSendRequest
import com.sabq.smart.data.api.PhoneSendResponse
import com.sabq.smart.data.api.PhoneVerifyRequest
import com.sabq.smart.data.api.RegisterRequest
import com.sabq.smart.data.api.ResendActivationRequest
import com.sabq.smart.data.api.ResendActivationResponse
import com.sabq.smart.data.api.SabqApi
import com.sabq.smart.data.api.UpdateMemberInterestsRequest
import com.sabq.smart.data.api.VerifyTwoFactorRequest
import com.sabq.smart.data.auth.AuthTokenStore
import android.os.SystemClock
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import retrofit2.HttpException

/**
 * Single source of truth for authentication state. Wraps the API,
 * persists the bearer token via [AuthTokenStore], and exposes the
 * current [User] as a reactive flow.
 *
 * iOS counterpart: AuthStore (Stores/AuthStore.swift) +
 * APIClient's keychain integration. Android keeps the same
 * surface: the token + the user are the two persisted bits.
 */
@Singleton
class AuthRepository @Inject constructor(
    private val api: SabqApi,
    private val tokenStore: AuthTokenStore,
    private val json: Json,
) {

    private val _user = MutableStateFlow<User?>(null)
    val user: StateFlow<User?> = _user.asStateFlow()

    // Timestamp (elapsedRealtime) of the last successful profile fetch.
    // Used by [ensureProfileFresh] to coalesce the many `init`-time
    // refresh calls that fire when navigating between screens (each
    // screen spins up an AuthViewModel whose init refreshes the profile).
    @Volatile
    private var lastProfileFetchAt = 0L

    /**
     * Refresh the profile only if it's stale. Multiple screens opening
     * within [ttlMs] share the AuthRepository singleton, so the first
     * call hits `/members/profile` and the rest return the cached
     * [user] without a network round-trip. Login/register/interest
     * paths keep calling [refreshProfile] directly (always forced).
     */
    suspend fun ensureProfileFresh(ttlMs: Long = 60_000L): User? {
        val now = SystemClock.elapsedRealtime()
        if (_user.value != null && now - lastProfileFetchAt < ttlMs) {
            return _user.value
        }
        val result = refreshProfile()
        if (result != null) lastProfileFetchAt = now
        return result
    }

    /** True if a bearer token is stored AND we have a resolved user. */
    val isSignedIn: Flow<Boolean> = combine(tokenStore.token, _user) { t, u ->
        !t.isNullOrBlank() && u != null
    }

    /**
     * Refresh the current user from `/api/v1/members/profile`. Called
     * on app start (if a token exists) and after a successful login.
     * Failure (401) clears the token — the session has expired.
     */
    suspend fun refreshProfile(): User? {
        val token = tokenStore.current()
        if (token.isNullOrBlank()) {
            _user.value = null
            return null
        }
        return runCatching {
            val apiUser = api.getProfileEnvelope().user
                ?: error("backend returned no user")
            apiUser.toDomain()
        }
            .onSuccess { _user.value = it }
            .onFailure { e ->
                if (e is HttpException && e.code() == 401) {
                    tokenStore.clear()
                    _user.value = null
                }
            }
            .getOrNull()
    }

    /**
     * Replace the authenticated member's interest categories. Backend
     * wipes prior rows + inserts the supplied ids (priority by index).
     * Refreshes the profile on success so [user] reflects the new list.
     * Mirrors iOS `AuthStore.updateInterests(categoryIds:)`.
     */
    suspend fun updateInterests(categoryIds: List<String>): User? {
        val token = tokenStore.current()
        if (token.isNullOrBlank()) {
            throw AuthException("تسجيل الدخول مطلوب لحفظ الاهتمامات")
        }
        try {
            api.updateMemberInterests(UpdateMemberInterestsRequest(interestIds = categoryIds))
        } catch (e: HttpException) {
            throw AuthException(extractErrorMessage(e) ?: "تعذّر حفظ الاهتمامات")
        }
        return refreshProfile()
    }

    /**
     * Email/password login. Throws an [AuthException] on failure with
     * the server-side Arabic message extracted from the 401/403 body.
     *
     * If the backend signals `requiresActivation: true` (account is
     * pending email verification), this throws the more specific
     * [PendingActivationException] so the login screen can offer the
     * "resend activation email" affordance.
     */
    suspend fun login(email: String, password: String): User =
        loginWithIdentifier(email, password)

    /**
     * دخول بحساب سبق بالبريد أو الجوال + كلمة المرور.
     * يكتشف البريد بوجود «@» ويرسل `email` أو `phone` حسب ذلك.
     */
    suspend fun loginWithIdentifier(identifier: String, password: String): User {
        val trimmed = identifier.trim()
        val isEmail = trimmed.contains("@")
        val response = try {
            api.login(
                LoginRequest(
                    email = if (isEmail) trimmed.lowercase() else null,
                    phone = if (isEmail) null else trimmed,
                    password = password,
                ),
            )
        } catch (e: HttpException) {
            val errorBody = extractErrorBody(e)
            if (errorBody?.requiresActivation == true) {
                throw PendingActivationException(
                    message = errorBody.message ?: "الحساب غير مفعل. يرجى تفعيل الحساب أولاً",
                    userId = errorBody.userId,
                    email = if (isEmail) trimmed else null,
                )
            }
            throw AuthException(errorBody?.message ?: "تعذّر تسجيل الدخول")
        }
        // Account has 2FA enabled: the server replies HTTP 200 (no
        // HttpException) with `requires2FA: true`, no token, and a
        // short-lived challenge. Surface it as a dedicated exception so
        // the ViewModel switches to the code-entry step instead of
        // installing a (non-existent) session. iOS parity:
        // AuthStore.performLogin → pending2FAChallengeToken.
        if (response.requires2FA == true && !response.challengeToken.isNullOrBlank()) {
            throw TwoFactorRequiredException(response.challengeToken)
        }
        return finishCredentialLogin(response)
    }

    /**
     * Complete a 2FA-gated login. Called after [loginWithIdentifier]
     * threw [TwoFactorRequiredException]; pass the challenge it carried
     * plus EITHER a TOTP [code] OR a [backupCode]. On success this
     * installs the session exactly like a normal credential login (same
     * `/members/profile` hydration path). A wrong code / expired
     * challenge surfaces as an [AuthException] with the server message
     * so the caller can keep the challenge alive and let the user retry.
     * iOS parity: AuthStore.verifyTwoFactor.
     */
    suspend fun verifyTwoFactor(
        challengeToken: String,
        code: String?,
        backupCode: String?,
    ): User {
        val response = try {
            api.verifyTwoFactor(
                VerifyTwoFactorRequest(
                    challengeToken = challengeToken,
                    token = code?.trim()?.takeIf { it.isNotEmpty() },
                    backupCode = backupCode?.trim()?.takeIf { it.isNotEmpty() },
                ),
            )
        } catch (e: HttpException) {
            throw AuthException(extractErrorMessage(e) ?: "رمز التحقق غير صحيح")
        }
        return finishCredentialLogin(response)
    }

    /** إرسال رمز تحقّق للجوال. الرقم بأي صيغة سعودية — الخادم يطبّعه. */
    suspend fun sendPhoneCode(phone: String): PhoneSendResponse {
        return try {
            api.sendPhoneCode(PhoneSendRequest(phone = phone))
        } catch (e: HttpException) {
            throw AuthException(extractErrorMessage(e) ?: "تعذّر إرسال رمز التحقق")
        }
    }

    /** التحقق من رمز الجوال وتثبيت الجلسة (ينشئ الحساب إن لزم). */
    suspend fun verifyPhoneCode(phone: String, code: String): User {
        val response = try {
            api.verifyPhoneCode(PhoneVerifyRequest(phone = phone, code = code))
        } catch (e: HttpException) {
            throw AuthException(extractErrorMessage(e) ?: "رمز التحقق غير صحيح")
        }
        return finishCredentialLogin(response)
    }

    /** تثبيت الجلسة بعد دخول بريد/جوال/OTP — نفس مسار OAuth بعد إصدار التوكن. */
    private suspend fun finishCredentialLogin(response: ApiLoginResponse): User {
        if (response.requires2FA == true) {
            val challenge = response.challengeToken?.takeIf { it.isNotBlank() }
                ?: throw AuthException("تعذّر بدء التحقق بخطوتين")
            throw TwoFactorRequiredException(challenge)
        }
        val token = response.token?.takeIf { it.isNotBlank() }
            ?: throw AuthException(response.message ?: "لم يصدر السيرفر رمز دخول")
        tokenStore.set(token)
        // Seed `_user` from the login response so the UI has *something*
        // to render immediately, then ALWAYS refresh from `/members/profile`
        // — the login envelope doesn't carry `interests` or the resolved
        // RBAC role payload, so without this the user lands signed-in but
        // with an empty interests picker. iOS does the same via
        // `AuthStore.fetchFullProfile()` after every login response.
        val seedUser = response.user?.toDomain()
        if (seedUser != null) _user.value = seedUser
        val fullUser = refreshProfile()
            ?: seedUser
            ?: throw AuthException("تم تسجيل الدخول لكن تعذّر تحميل الملف الشخصي")
        return fullUser
    }

    /**
     * Re-send the activation email for an account whose login failed
     * with `requiresActivation: true`. Pass the `userId` returned in
     * [PendingActivationException] when available — falls back to the
     * email the user typed.
     */
    suspend fun resendActivation(userId: String?, email: String?): ResendActivationResponse {
        if (userId.isNullOrBlank() && email.isNullOrBlank()) {
            throw AuthException("لا يوجد بريد لإرسال رمز التفعيل إليه")
        }
        return try {
            api.resendActivation(
                ResendActivationRequest(userId = userId, email = email?.trim()),
            )
        } catch (e: HttpException) {
            throw AuthException(extractErrorMessage(e) ?: "تعذّر إعادة إرسال رمز التفعيل")
        }
    }

    /**
     * Native Google Sign-In. The `idToken` comes from Credential Manager
     * after the user picks an account. Backend verifies the JWT and
     * returns either a brand-new account or a re-authenticated existing
     * one — same envelope as `/auth/login` so we reuse the same handling.
     */
    suspend fun loginWithGoogle(idToken: String, deviceInfo: OAuthDeviceInfo? = null): User {
        val response = try {
            api.loginWithGoogle(GoogleOAuthRequest(idToken = idToken, deviceInfo = deviceInfo))
        } catch (e: HttpException) {
            throw AuthException(extractErrorMessage(e) ?: "تعذّر تسجيل الدخول عبر Google")
        }
        return finishOAuthLogin(response, providerLabel = "Google")
    }

    /**
     * Native Apple Sign-In. The `identityToken` is the JWT from the
     * Apple authorization-code exchange (Custom Tab webview flow on
     * Android). `firstName` / `lastName` / `email` are only present on
     * the FIRST authorization for a given Apple ID — pass null on
     * subsequent attempts; backend matches by Apple `sub`.
     */
    suspend fun loginWithApple(
        identityToken: String,
        firstName: String? = null,
        lastName: String? = null,
        email: String? = null,
        deviceInfo: OAuthDeviceInfo? = null,
    ): User {
        val response = try {
            api.loginWithApple(
                AppleOAuthRequest(
                    identityToken = identityToken,
                    fullName = if (firstName != null || lastName != null) {
                        AppleFullName(firstName = firstName, lastName = lastName)
                    } else null,
                    email = email?.takeIf { it.isNotBlank() },
                    deviceInfo = deviceInfo,
                ),
            )
        } catch (e: HttpException) {
            throw AuthException(extractErrorMessage(e) ?: "تعذّر تسجيل الدخول عبر Apple")
        }
        return finishOAuthLogin(response, providerLabel = "Apple")
    }

    /** Shared OAuth login completion — persist the token, hydrate
     *  [_user], surface a friendly error if the server omitted the token
     *  (shouldn't happen but the type signature allows it). */
    private suspend fun finishOAuthLogin(
        response: com.sabq.smart.data.api.ApiLoginResponse,
        providerLabel: String,
    ): User {
        if (response.requires2FA == true) {
            val challenge = response.challengeToken?.takeIf { it.isNotBlank() }
                ?: throw AuthException("تعذّر بدء التحقق بخطوتين")
            throw TwoFactorRequiredException(challenge)
        }
        val token = response.token?.takeIf { it.isNotBlank() }
            ?: throw AuthException(response.message ?: "لم يصدر السيرفر رمز دخول من $providerLabel")
        tokenStore.set(token)
        // See login(): the OAuth login envelope also omits `interests`,
        // so we seed from the response then always refresh from
        // `/members/profile` to populate the full user object.
        val seedUser = response.user?.toDomain()
        if (seedUser != null) _user.value = seedUser
        return refreshProfile()
            ?: seedUser
            ?: throw AuthException("تم تسجيل الدخول لكن تعذّر تحميل الملف الشخصي")
    }

    suspend fun register(name: String, email: String, password: String): RegisterOutcome {
        val response = try {
            api.register(
                RegisterRequest(
                    name = name.trim(),
                    email = email.trim(),
                    password = password,
                    passwordConfirmation = password,
                ),
            )
        } catch (e: HttpException) {
            throw AuthException(extractErrorMessage(e) ?: "تعذّر إنشاء الحساب")
        }
        // Mirrors iOS `AuthStore.register` branching in AuthStore.swift:158-185.
        // Auto-activated mobile signups return a token + user → instant
        // login. Older flows / opt-out signups only send `emailSent` →
        // surface a "check your email" success card with a resend
        // affordance.
        val token = response.token
        if (!token.isNullOrBlank()) {
            tokenStore.set(token)
            // Same pattern as login(): seed from the register response,
            // then refresh from /members/profile so interests + RBAC
            // role payload land on the cached User.
            val seedUser = response.user?.toDomain()
            if (seedUser != null) _user.value = seedUser
            val fullUser = refreshProfile()
                ?: seedUser
                ?: throw AuthException("تم إنشاء الحساب لكن تعذّر تحميل الملف الشخصي")
            return RegisterOutcome.Authenticated(fullUser)
        }
        // No token — pending email activation. Use the user id from the
        // response if present so resend-activation can target by id.
        return RegisterOutcome.PendingActivation(
            message = response.message
                ?: "تم إنشاء الحساب بنجاح. يرجى التحقق من بريدك الإلكتروني لتفعيل الحساب",
            userId = response.user?.id?.takeIf { it.isNotBlank() },
            email = email.trim(),
        )
    }

    suspend fun logout() {
        runCatching { api.logout() }
        tokenStore.clear()
        _user.value = null
    }

    /** Drop the local session WITHOUT calling the logout endpoint —
     *  used after a successful `deleteAccount` where the server has
     *  already nuked the row. */
    suspend fun clearLocalSession() {
        tokenStore.clear()
        _user.value = null
    }

    /** Replace the cached user with a fresh copy — used after a
     *  successful profile edit so the Settings card refreshes
     *  immediately without re-fetching the profile. */
    fun updateCachedUser(user: User) {
        _user.value = user
    }

    private fun extractErrorMessage(e: HttpException): String? =
        extractErrorBody(e)?.message

    /**
     * Decode the full [ApiErrorResponse] (message + `requiresActivation`
     * flag + `userId`) from the error body so callers can react to the
     * structured contract instead of just the localised message.
     */
    private fun extractErrorBody(e: HttpException): ApiErrorResponse? {
        val raw = e.response()?.errorBody()?.string() ?: return null
        return runCatching {
            json.decodeFromString(ApiErrorResponse.serializer(), raw)
        }.getOrNull()
    }

    @Suppress("unused")
    private val _markers = listOf<Any>(_user.asStateFlow().map { it?.id })
}

open class AuthException(message: String) : Exception(message)

/**
 * Outcome of a successful [AuthRepository.register] call. Mirrors iOS
 * `AuthStore.register` in AuthStore.swift:158-185:
 *  - [Authenticated] — backend returned a session token + user. The
 *    token is already persisted and the cached user updated.
 *  - [PendingActivation] — backend confirmed the account was created
 *    but only sent an activation email; no session yet. The smart
 *    signup screen surfaces a "check your email" + resend affordance.
 */
sealed interface RegisterOutcome {
    data class Authenticated(val user: User) : RegisterOutcome
    data class PendingActivation(
        val message: String,
        val userId: String?,
        val email: String,
    ) : RegisterOutcome
}

/**
 * Specialised [AuthException] thrown when the backend signals that
 * the login failed because the account is still pending email
 * verification. Carries the [userId] echoed by the server (when
 * available) plus the [email] the user typed, so the resend-activation
 * action can target the right account.
 */
class PendingActivationException(
    message: String,
    val userId: String?,
    val email: String?,
) : AuthException(message)

/**
 * Thrown by [AuthRepository.loginWithIdentifier] when the account has
 * 2FA enabled: the credentials were correct but the server returned a
 * [challengeToken] instead of a session. The ViewModel switches to the
 * TOTP / backup-code entry step and calls
 * [AuthRepository.verifyTwoFactor] with this [challengeToken]. Mirrors
 * iOS `AuthStore.pending2FAChallengeToken`.
 */
class TwoFactorRequiredException(
    val challengeToken: String,
) : AuthException("مطلوب رمز المصادقة الثنائية")
