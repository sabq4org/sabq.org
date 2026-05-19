package com.sabq.smart.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.AuthException
import com.sabq.smart.data.AuthRepository
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
    data class Success(val user: User) : AuthFormState
}

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val repo: AuthRepository,
) : ViewModel() {

    val currentUser: StateFlow<User?> = repo.user
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val _form = MutableStateFlow<AuthFormState>(AuthFormState.Idle)
    val form: StateFlow<AuthFormState> = _form.asStateFlow()

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
            runCatching { repo.login(email, password) }
                .onSuccess { _form.value = AuthFormState.Success(it) }
                .onFailure { e ->
                    val msg = if (e is AuthException) e.message ?: "تعذّر تسجيل الدخول"
                    else e.localizedMessage ?: "حدث خطأ، حاول مجدداً"
                    _form.value = AuthFormState.Error(msg)
                }
        }
    }

    fun register(name: String, email: String, password: String) {
        if (name.isBlank() || email.isBlank() || password.isBlank()) {
            _form.value = AuthFormState.Error("الرجاء تعبئة جميع الحقول")
            return
        }
        if (password.length < 8) {
            _form.value = AuthFormState.Error("يجب أن تكون كلمة المرور 8 خانات على الأقل")
            return
        }
        viewModelScope.launch {
            _form.value = AuthFormState.Submitting
            runCatching { repo.register(name, email, password) }
                .onSuccess { _form.value = AuthFormState.Success(it) }
                .onFailure { e ->
                    val msg = if (e is AuthException) e.message ?: "تعذّر إنشاء الحساب"
                    else e.localizedMessage ?: "حدث خطأ، حاول مجدداً"
                    _form.value = AuthFormState.Error(msg)
                }
        }
    }

    fun logout() {
        viewModelScope.launch {
            repo.logout()
            _form.value = AuthFormState.Idle
        }
    }

    fun resetForm() { _form.value = AuthFormState.Idle }
}
