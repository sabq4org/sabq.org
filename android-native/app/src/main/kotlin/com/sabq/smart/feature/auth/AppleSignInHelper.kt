package com.sabq.smart.feature.auth

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import java.security.SecureRandom

/**
 * Launches the Apple Sign-In web flow inside a Chrome Custom Tab.
 * Apple has no native Android SDK and the official guidance is to use
 * the standard Sign in with Apple JS / web flow over a browser tab.
 *
 * Flow:
 *   1. Generate a random `state` (CSRF guard) — caller persists it via
 *      [PendingAppleSignIn] before the launch and verifies it on the
 *      callback.
 *   2. Open `appleid.apple.com/auth/authorize` with our Service ID
 *      (`org.sabq.client`) as the client_id and the backend's mobile
 *      callback as the redirect_uri.
 *   3. Apple posts the result back to `/api/auth/apple/mobile-callback`,
 *      which bounces to `sabq://auth/apple-callback?id_token=...` —
 *      MainActivity's intent filter catches that and dispatches via
 *      [PendingAppleSignIn].
 *
 * Important Apple gotchas:
 *  - `client_id` is the Apple **Service ID** (`org.sabq.client`), NOT
 *    the iOS Bundle ID. The web flow only authenticates against Service
 *    IDs; Bundle IDs are reserved for the native iOS button.
 *  - `response_mode=form_post` is required when `scope=name email` is
 *    requested — Apple won't ship name/email in a query-string response.
 *  - The redirect_uri MUST be present in the Apple Service ID's
 *    "Return URLs" allowlist. Mismatch surfaces as Apple's generic
 *    "invalid_request" error.
 */
object AppleSignInHelper {

    /** Service ID configured in Apple Developer Console for the web flow. */
    const val APPLE_SERVICE_ID = "org.sabq.client"

    /** Backend endpoint that receives Apple's POST form_post + bounces
     *  to the `sabq://` deep link. See `server/routes.ts` —
     *  `/api/auth/apple/mobile-callback`. */
    const val MOBILE_CALLBACK_URL = "https://sabq.org/api/auth/apple/mobile-callback"

    private const val AUTHORIZE_BASE = "https://appleid.apple.com/auth/authorize"

    /** Generate a URL-safe random string used as the OAuth `state`. The
     *  caller persists this and verifies it equals the value Apple
     *  echoes in the redirect — prevents callback replay across users. */
    fun generateState(): String {
        val bytes = ByteArray(24)
        SecureRandom().nextBytes(bytes)
        return android.util.Base64.encodeToString(
            bytes,
            android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING,
        )
    }

    /** Open the Apple authorize URL in a Custom Tab. The user
     *  completes sign-in in the tab, Apple posts to our backend, the
     *  backend redirects to `sabq://...`, the OS routes it to
     *  MainActivity. The Custom Tab closes automatically when the
     *  scheme handler activates. */
    fun launchSignIn(context: Context, state: String) {
        val authorizeUri = Uri.parse(AUTHORIZE_BASE).buildUpon()
            .appendQueryParameter("client_id", APPLE_SERVICE_ID)
            .appendQueryParameter("redirect_uri", MOBILE_CALLBACK_URL)
            .appendQueryParameter("response_type", "code id_token")
            .appendQueryParameter("response_mode", "form_post")
            .appendQueryParameter("scope", "name email")
            .appendQueryParameter("state", state)
            .build()

        val intent = CustomTabsIntent.Builder()
            .setShowTitle(true)
            .build()
        intent.launchUrl(context, authorizeUri)
    }

    /**
     * Apple's `user` JSON (sent only on the FIRST authorization for a
     * given Apple ID) looks like:
     *   {"name":{"firstName":"علي","lastName":"الحازمي"},"email":"..."}
     * Decode it loosely — if the shape is unexpected, return nulls so
     * the backend matches by Apple `sub` and falls back gracefully.
     */
    data class ParsedAppleUser(
        val firstName: String?,
        val lastName: String?,
        val email: String?,
    )

    fun parseUserJson(raw: String?): ParsedAppleUser {
        if (raw.isNullOrBlank()) return ParsedAppleUser(null, null, null)
        return runCatching {
            val element = kotlinx.serialization.json.Json.parseToJsonElement(raw)
            val obj = element as? kotlinx.serialization.json.JsonObject
                ?: return@runCatching ParsedAppleUser(null, null, null)
            val name = obj["name"] as? kotlinx.serialization.json.JsonObject
            val firstName = (name?.get("firstName") as? kotlinx.serialization.json.JsonPrimitive)
                ?.contentOrNull()
            val lastName = (name?.get("lastName") as? kotlinx.serialization.json.JsonPrimitive)
                ?.contentOrNull()
            val email = (obj["email"] as? kotlinx.serialization.json.JsonPrimitive)
                ?.contentOrNull()
            ParsedAppleUser(
                firstName = firstName?.takeIf { it.isNotBlank() },
                lastName = lastName?.takeIf { it.isNotBlank() },
                email = email?.takeIf { it.isNotBlank() },
            )
        }.getOrElse {
            ParsedAppleUser(null, null, null)
        }
    }

    private fun kotlinx.serialization.json.JsonPrimitive.contentOrNull(): String? =
        if (isString) content else null
}
