package com.sabq.smart.data

import com.sabq.smart.data.api.ApiErrorResponse
import com.sabq.smart.data.api.LoginRequest
import com.sabq.smart.data.api.RegisterRequest
import com.sabq.smart.data.api.ResendActivationRequest
import com.sabq.smart.data.api.ResendActivationResponse
import com.sabq.smart.data.api.SabqApi
import com.sabq.smart.data.auth.AuthTokenStore
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
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
    val user: Flow<User?> = _user.asStateFlow()

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
     * Email/password login. Throws an [AuthException] on failure with
     * the server-side Arabic message extracted from the 401/403 body.
     *
     * If the backend signals `requiresActivation: true` (account is
     * pending email verification), this throws the more specific
     * [PendingActivationException] so the login screen can offer the
     * "resend activation email" affordance.
     */
    suspend fun login(email: String, password: String): User {
        val response = try {
            api.login(LoginRequest(email = email.trim(), password = password))
        } catch (e: HttpException) {
            val errorBody = extractErrorBody(e)
            if (errorBody?.requiresActivation == true) {
                throw PendingActivationException(
                    message = errorBody.message ?: "الحساب غير مفعل. يرجى تفعيل الحساب أولاً",
                    userId = errorBody.userId,
                    email = email.trim(),
                )
            }
            throw AuthException(errorBody?.message ?: "تعذّر تسجيل الدخول")
        }
        val token = response.token
            ?: throw AuthException(response.message ?: "لم يصدر السيرفر رمز دخول")
        tokenStore.set(token)
        val user = response.user?.toDomain() ?: refreshProfile()
            ?: throw AuthException("تم تسجيل الدخول لكن تعذّر تحميل الملف الشخصي")
        _user.value = user
        return user
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

    suspend fun register(name: String, email: String, password: String): User {
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
        val token = response.token
            ?: throw AuthException(response.message ?: "لم يصدر السيرفر رمز دخول")
        tokenStore.set(token)
        val user = response.user?.toDomain() ?: refreshProfile()
            ?: throw AuthException("تم إنشاء الحساب لكن تعذّر تحميل الملف الشخصي")
        _user.value = user
        return user
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
