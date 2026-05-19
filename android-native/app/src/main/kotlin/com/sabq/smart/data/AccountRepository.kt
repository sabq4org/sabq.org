package com.sabq.smart.data

import com.sabq.smart.data.api.ArticleSubmissionRequest
import com.sabq.smart.data.api.AvatarUploadRequest
import com.sabq.smart.data.api.ChangePasswordRequest
import com.sabq.smart.data.api.ContactMessageRequest
import com.sabq.smart.data.api.DeleteAccountRequest
import com.sabq.smart.data.api.ForgotPasswordRequest
import com.sabq.smart.data.api.NewsletterSubscribeRequest
import com.sabq.smart.data.api.NewsletterUnsubscribeRequest
import com.sabq.smart.data.api.ResetPasswordRequest
import com.sabq.smart.data.api.SabqApi
import com.sabq.smart.data.api.UpdateProfileRequest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Wraps the account-management endpoints. Mirrors iOS `APIClient`
 * helpers (`changePassword`, `forgotPassword`, `deleteAccount`,
 * `updateProfile`, `subscribeNewsletter`, `sendContactMessage`).
 *
 * Errors are surfaced as exceptions; ViewModels catch them and
 * translate to user-facing messages.
 */
@Singleton
class AccountRepository @Inject constructor(
    private val api: SabqApi,
) {
    suspend fun changePassword(currentPassword: String, newPassword: String) {
        val resp = api.changePassword(
            ChangePasswordRequest(currentPassword = currentPassword, newPassword = newPassword),
        )
        if (!resp.isSuccessful) {
            throw AccountException(resp.code(), resp.errorBody()?.string())
        }
    }

    suspend fun forgotPassword(email: String) {
        val resp = api.forgotPassword(ForgotPasswordRequest(email = email))
        if (!resp.isSuccessful) {
            throw AccountException(resp.code(), resp.errorBody()?.string())
        }
    }

    suspend fun resetPassword(email: String, code: String, newPassword: String) {
        val resp = api.resetPassword(
            ResetPasswordRequest(email = email, code = code, newPassword = newPassword),
        )
        if (!resp.isSuccessful) {
            throw AccountException(resp.code(), resp.errorBody()?.string())
        }
    }

    suspend fun deleteAccount(password: String) {
        val resp = api.deleteAccount(DeleteAccountRequest(password = password))
        if (!resp.isSuccessful) {
            throw AccountException(resp.code(), resp.errorBody()?.string())
        }
    }

    suspend fun updateProfile(
        firstName: String,
        lastName: String,
        bio: String?,
        city: String?,
        gender: String?,
    ): User {
        val resp = api.updateProfile(
            UpdateProfileRequest(
                firstName = firstName,
                lastName = lastName,
                bio = bio,
                city = city,
                gender = gender,
            ),
        )
        val user = resp.user ?: throw AccountException(0, "missing user")
        return user.toDomain()
    }

    suspend fun subscribeNewsletter(email: String, firstName: String?) {
        val resp = api.subscribeNewsletter(
            NewsletterSubscribeRequest(email = email, firstName = firstName),
        )
        if (!resp.isSuccessful) {
            if (resp.code() == 409) {
                throw AlreadySubscribedException
            }
            throw AccountException(resp.code(), resp.errorBody()?.string())
        }
    }

    suspend fun unsubscribeNewsletter(email: String, reason: String?) {
        val resp = api.unsubscribeNewsletter(
            NewsletterUnsubscribeRequest(email = email, reason = reason),
        )
        if (!resp.isSuccessful) {
            throw AccountException(resp.code(), resp.errorBody()?.string())
        }
    }

    suspend fun checkNewsletterStatus(email: String): Boolean =
        runCatching { api.newsletterStatus(email).subscribed == true }
            .getOrDefault(false)

    suspend fun sendContactMessage(
        name: String,
        phone: String,
        email: String,
        subject: String,
        message: String,
    ) {
        val resp = api.sendContactMessage(
            ContactMessageRequest(
                name = name,
                phone = phone,
                email = email,
                subject = subject,
                message = message,
            ),
        )
        if (!resp.isSuccessful) {
            throw AccountException(resp.code(), resp.errorBody()?.string())
        }
    }

    /** Upload a new avatar. [imageBytes] is the raw picker bytes — we
     *  wrap it in a `data:` URI on the wire (iOS does the same). The
     *  backend returns the refreshed user payload. */
    suspend fun uploadAvatar(imageBytes: ByteArray, mimeType: String): User {
        val base64 = android.util.Base64.encodeToString(imageBytes, android.util.Base64.NO_WRAP)
        val resp = api.uploadAvatar(
            AvatarUploadRequest(image = "data:$mimeType;base64,$base64"),
        )
        return resp.user?.toDomain() ?: throw AccountException(0, "missing user")
    }

    suspend fun deleteAvatar() {
        val resp = api.deleteAvatar()
        if (!resp.isSuccessful) {
            throw AccountException(resp.code(), resp.errorBody()?.string())
        }
    }

    suspend fun submitArticle(
        title: String,
        content: String,
        kind: String,
        images: List<Pair<ByteArray, String>>,
    ): ApiArticleSubmissionResult {
        val dataUris = images.mapNotNull { (bytes, mime) ->
            if (bytes.isEmpty()) return@mapNotNull null
            val base64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
            "data:$mime;base64,$base64"
        }
        val resp = api.submitArticle(
            ArticleSubmissionRequest(
                title = title,
                content = content,
                kind = kind,
                images = dataUris,
            ),
        )
        if (!resp.success) {
            throw AccountException(0, resp.message.ifBlank { "تعذر إرسال المقالة" })
        }
        return ApiArticleSubmissionResult(
            message = resp.message,
            articleId = resp.article?.id,
            articleSlug = resp.article?.slug,
        )
    }
}

data class ApiArticleSubmissionResult(
    val message: String,
    val articleId: String?,
    val articleSlug: String?,
)

class AccountException(val code: Int, val rawMessage: String?) :
    RuntimeException(rawMessage ?: "HTTP $code")

/** Newsletter 409: email already on the active subscriber list. The
 *  UI uses this to switch to "manage subscription" mode instead of
 *  surfacing it as a failure. */
object AlreadySubscribedException :
    RuntimeException("هذا البريد مشترك بالفعل في النشرة")
