package com.sabq.smart.feature.auth

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Bridge between MainActivity (which receives the
 * `sabq://auth/apple-callback?...` deep link via its intent filter) and
 * the Compose layer that needs to react to it. Same pattern as
 * [com.sabq.smart.data.push.PendingPushDeepLink] — store the result,
 * let the screen collect it, then [consume] so a configuration change
 * doesn't replay the sign-in.
 *
 * Apple's response shape (after our backend bounces it through
 * `/api/auth/apple/mobile-callback`):
 *  - `idToken` — the JWT we send back up to `/api/v1/auth/apple`.
 *  - `user` — JSON string with `{name: {firstName, lastName}, email}`,
 *    present ONLY on the very first authorization for this Apple ID.
 *  - `state` — the random string the client generated; verified to
 *    match before accepting the callback.
 *  - `error` — set when Apple or the backend signalled a failure.
 */
@Singleton
class PendingAppleSignIn @Inject constructor() {

    data class Result(
        val idToken: String? = null,
        val userJson: String? = null,
        val state: String? = null,
        val error: String? = null,
    )

    private val _result = MutableStateFlow<Result?>(null)
    val result: StateFlow<Result?> = _result.asStateFlow()

    fun set(idToken: String?, userJson: String?, state: String?, error: String?) {
        // Drop blank fields so the screen can branch on null instead of
        // empty string.
        _result.value = Result(
            idToken = idToken?.takeIf { it.isNotBlank() },
            userJson = userJson?.takeIf { it.isNotBlank() },
            state = state?.takeIf { it.isNotBlank() },
            error = error?.takeIf { it.isNotBlank() },
        )
    }

    fun consume() {
        _result.value = null
    }
}
