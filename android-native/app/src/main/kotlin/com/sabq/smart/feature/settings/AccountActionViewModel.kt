package com.sabq.smart.feature.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.AccountException
import com.sabq.smart.data.AccountRepository
import com.sabq.smart.data.AlreadySubscribedException
import com.sabq.smart.data.AuthRepository
import com.sabq.smart.data.BookmarksStore
import com.sabq.smart.data.User
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Shared ViewModel for the account-action screens (change password,
 * forgot password, delete account, edit profile, contact, newsletter).
 *
 * One VM serves all of them so the form-level state (isLoading,
 * errorMessage, success) is consistent and we don't have to repeat the
 * try/catch wrapper logic per sheet.
 */
@HiltViewModel
class AccountActionViewModel @Inject constructor(
    private val accountRepo: AccountRepository,
    private val authRepo: AuthRepository,
    private val bookmarks: BookmarksStore,
) : ViewModel() {

    data class UiState(
        val isLoading: Boolean = false,
        val errorMessage: String? = null,
        val success: Boolean = false,
        val alreadySubscribed: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    fun reset() {
        _state.value = UiState()
    }

    fun changePassword(currentPassword: String, newPassword: String) {
        if (currentPassword.isBlank() || newPassword.length < 6) return
        runAction {
            accountRepo.changePassword(currentPassword, newPassword)
        }
    }

    fun forgotPassword(email: String) {
        if (email.isBlank()) return
        runAction { accountRepo.forgotPassword(email) }
    }

    fun deleteAccount(password: String, onLogout: () -> Unit) {
        if (password.isBlank()) return
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                accountRepo.deleteAccount(password)
                bookmarks.clearAll()
                authRepo.clearLocalSession()
                _state.update { it.copy(isLoading = false, success = true) }
                onLogout()
            } catch (e: AccountException) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = friendlyMessage(e),
                    )
                }
            } catch (t: Throwable) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = t.localizedMessage ?: "تعذر إكمال العملية",
                    )
                }
            }
        }
    }

    fun updateProfile(
        firstName: String,
        lastName: String,
        bio: String?,
        city: String?,
        gender: String?,
        onSaved: (User) -> Unit,
    ) {
        if (firstName.isBlank() || lastName.isBlank()) return
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val user = accountRepo.updateProfile(
                    firstName = firstName,
                    lastName = lastName,
                    bio = bio,
                    city = city,
                    gender = gender,
                )
                authRepo.updateCachedUser(user)
                _state.update { it.copy(isLoading = false, success = true) }
                onSaved(user)
            } catch (t: Throwable) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = t.localizedMessage ?: "تعذر حفظ التغييرات",
                    )
                }
            }
        }
    }

    fun sendContactMessage(
        name: String,
        phone: String,
        email: String,
        subject: String,
        message: String,
    ) {
        runAction {
            accountRepo.sendContactMessage(name, phone, email, subject, message)
        }
    }

    fun subscribeNewsletter(email: String, firstName: String?) {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null, alreadySubscribed = false) }
            try {
                accountRepo.subscribeNewsletter(email, firstName)
                _state.update { it.copy(isLoading = false, success = true) }
            } catch (_: AlreadySubscribedException) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        alreadySubscribed = true,
                    )
                }
            } catch (t: Throwable) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = t.localizedMessage ?: "تعذر الاشتراك في النشرة",
                    )
                }
            }
        }
    }

    fun unsubscribeNewsletter(email: String, reason: String?) {
        runAction { accountRepo.unsubscribeNewsletter(email, reason) }
    }

    fun uploadAvatar(imageBytes: ByteArray, mimeType: String) {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val user = accountRepo.uploadAvatar(imageBytes, mimeType)
                authRepo.updateCachedUser(user)
                _state.update { it.copy(isLoading = false, success = true) }
            } catch (t: Throwable) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = t.localizedMessage ?: "تعذر رفع الصورة",
                    )
                }
            }
        }
    }

    fun deleteAvatar() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                accountRepo.deleteAvatar()
                authRepo.refreshProfile()
                _state.update { it.copy(isLoading = false, success = true) }
            } catch (t: Throwable) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = t.localizedMessage ?: "تعذر حذف الصورة",
                    )
                }
            }
        }
    }

    fun submitArticle(
        title: String,
        content: String,
        kind: String,
        images: List<Pair<ByteArray, String>>,
        onSubmitted: (com.sabq.smart.data.ApiArticleSubmissionResult) -> Unit = {},
    ) {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val result = accountRepo.submitArticle(title, content, kind, images)
                _state.update { it.copy(isLoading = false, success = true) }
                onSubmitted(result)
            } catch (t: Throwable) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = t.localizedMessage ?: "تعذر إرسال المقالة",
                    )
                }
            }
        }
    }

    private fun runAction(block: suspend () -> Unit) {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null, success = false) }
            try {
                block()
                _state.update { it.copy(isLoading = false, success = true) }
            } catch (e: AccountException) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = friendlyMessage(e),
                    )
                }
            } catch (t: Throwable) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = t.localizedMessage ?: "تعذر إكمال العملية",
                    )
                }
            }
        }
    }

    private fun friendlyMessage(e: AccountException): String = when (e.code) {
        401 -> "كلمة المرور غير صحيحة"
        403 -> "غير مصرح بهذه العملية"
        404 -> "الخدمة غير متوفرة حالياً"
        409 -> "البريد مسجّل مسبقاً"
        422 -> "البيانات غير صحيحة"
        else -> e.rawMessage?.takeIf { it.isNotBlank() } ?: "تعذر إكمال العملية"
    }
}
