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
            if (credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                val tokenCredential = GoogleIdTokenCredential.createFrom(credential.data)
                GoogleSignInOutcome.Success(idToken = tokenCredential.idToken)
            } else {
                GoogleSignInOutcome.Failed("نوع الاعتماد غير متوقع: ${credential.type}")
            }
        } catch (_: GetCredentialCancellationException) {
            GoogleSignInOutcome.Cancelled
        } catch (e: NoCredentialException) {
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
