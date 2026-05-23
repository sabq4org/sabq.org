package com.sabq.smart.feature.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import com.sabq.smart.BuildConfig

/**
 * Wrapper around AndroidX Credential Manager that returns either a
 * Google ID token or a [GoogleSignInOutcome] describing why the flow
 * couldn't complete. The screen consumes this, hands the `idToken`
 * back to [AuthViewModel.loginWithGoogle], and the rest of the round
 * trip looks exactly like the email/password path.
 *
 * Why Credential Manager (and not the older `GoogleSignInClient`):
 * - GoogleSignInClient is deprecated as of Android 14.
 * - Credential Manager unifies Google Sign-In + passkeys + saved
 *   passwords behind one API and works with the modern "bottom sheet"
 *   UX users now expect on Android.
 * - The ID tokens issued through Credential Manager are signed against
 *   the **Web** client ID (`BuildConfig.GOOGLE_WEB_CLIENT_ID`), which
 *   matches what our backend's `oauthMobile.ts` already verifies — no
 *   extra audience configuration needed.
 *
 * The Android-package OAuth client still needs to exist in Google Cloud
 * Console with the app's package name + SHA-1; Google uses that to
 * authorise THIS app to issue tokens. But its client ID value never
 * crosses the network — only the Web client ID does.
 */
class GoogleSignInHelper {

    sealed interface GoogleSignInOutcome {
        data class Success(val idToken: String) : GoogleSignInOutcome
        data object Cancelled : GoogleSignInOutcome
        data class Unavailable(val reason: String) : GoogleSignInOutcome
        data class Failed(val reason: String) : GoogleSignInOutcome
    }

    suspend fun signIn(context: Context): GoogleSignInOutcome {
        val webClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID
        if (webClientId.isBlank()) {
            return GoogleSignInOutcome.Unavailable("لم يُهيَّأ GOOGLE_WEB_CLIENT_ID في الإصدار")
        }

        // `setFilterByAuthorizedAccounts(false)` so the bottom sheet
        // shows *any* Google account on the device, including the first
        // sign-in. Authorized-only filter is the right choice for
        // returning users but on first launch it surfaces "no credentials
        // available" — we'd rather offer the picker.
        val googleIdOption = GetGoogleIdOption.Builder()
            .setServerClientId(webClientId)
            .setFilterByAuthorizedAccounts(false)
            .setAutoSelectEnabled(false)
            .build()

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
            .build()

        return try {
            val response = CredentialManager.create(context).getCredential(
                context = context,
                request = request,
            )
            val credential = response.credential
            // Credential Manager can return many credential types
            // (passkey, saved password, ...). We only care about the
            // Google ID-token shape here.
            if (credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                val tokenCredential = GoogleIdTokenCredential.createFrom(credential.data)
                GoogleSignInOutcome.Success(idToken = tokenCredential.idToken)
            } else {
                GoogleSignInOutcome.Failed("نوع الاعتماد غير متوقع: ${credential.type}")
            }
        } catch (_: GetCredentialCancellationException) {
            GoogleSignInOutcome.Cancelled
        } catch (e: NoCredentialException) {
            // First-time users with no Google account configured on the
            // device, or accounts that explicitly opted out of sharing.
            GoogleSignInOutcome.Unavailable(
                e.localizedMessage ?: "لم يُعثر على حساب Google على الجهاز",
            )
        } catch (e: GoogleIdTokenParsingException) {
            GoogleSignInOutcome.Failed(
                e.localizedMessage ?: "تعذّر قراءة رمز Google",
            )
        } catch (e: GetCredentialException) {
            GoogleSignInOutcome.Failed(
                e.localizedMessage ?: "تعذّر تسجيل الدخول عبر Google",
            )
        }
    }
}
