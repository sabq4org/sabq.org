package com.sabq.smart.feature.presscard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.AuthRepository
import com.sabq.smart.data.User
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import retrofit2.HttpException

data class PressCardUiState(
    val loading: Boolean = true,
    val authorized: Boolean = false,
    val status: PressPassStatusDto? = null,
    val issuing: Boolean = false,
    val issueError: String? = null,
)

@Serializable
private data class PressErrorBody(val message: String? = null)

@HiltViewModel
class PressCardViewModel @Inject constructor(
    private val api: PressCardApi,
    private val json: Json,
    authRepository: AuthRepository,
) : ViewModel() {

    val user: StateFlow<User?> = authRepository.user

    private val _state = MutableStateFlow(PressCardUiState())
    val state: StateFlow<PressCardUiState> = _state.asStateFlow()

    init { refreshStatus() }

    fun refreshStatus() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = _state.value.status == null)
            try {
                val status = api.getStatus()
                _state.value = _state.value.copy(
                    loading = false,
                    authorized = status.authorized,
                    status = status,
                )
            } catch (_: Exception) {
                // أي فشل (شبكة/401/500) = حالة «غير مصرّح» — مطابقة iOS.
                _state.value = _state.value.copy(
                    loading = false,
                    authorized = false,
                    status = null,
                )
            }
        }
    }

    /** إصدار/إعادة إصدار — يُهمل جسم الـ.pkpass ثم تُجلب الحالة الجديدة. */
    fun issue() {
        if (_state.value.issuing) return
        viewModelScope.launch {
            _state.value = _state.value.copy(issuing = true, issueError = null)
            try {
                api.issuePass().close()
                refreshStatus()
                _state.value = _state.value.copy(issuing = false)
            } catch (e: HttpException) {
                if (e.code() == 401) {
                    _state.value = _state.value.copy(
                        issuing = false,
                        authorized = false,
                        status = null,
                    )
                } else {
                    _state.value = _state.value.copy(
                        issuing = false,
                        issueError = serverMessage(e) ?: "تعذّر إصدار البطاقة. حاول مرة أخرى.",
                    )
                }
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    issuing = false,
                    issueError = e.localizedMessage ?: "تعذّر إصدار البطاقة. حاول مرة أخرى.",
                )
            }
        }
    }

    fun dismissIssueError() {
        _state.value = _state.value.copy(issueError = null)
    }

    private fun serverMessage(e: HttpException): String? {
        val raw = e.response()?.errorBody()?.string() ?: return null
        return runCatching {
            json.decodeFromString(PressErrorBody.serializer(), raw).message
        }.getOrNull()?.takeIf { it.isNotBlank() }
    }
}
