package com.sabq.smart.feature.survey

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.api.ApiSurveyPublic
import com.sabq.smart.data.api.ApiSurveyQuestion
import com.sabq.smart.data.api.SabqApi
import com.sabq.smart.data.api.SurveySubmitBody
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** One answer value — mirrors iOS `SurveyAnswer` (number/numbers/text). */
sealed interface SurveyAnswer {
    data class Number(val value: Int) : SurveyAnswer
    data class Numbers(val values: List<Int>) : SurveyAnswer
    data class Text(val value: String) : SurveyAnswer
}

/** Screen stage — mirrors iOS `SurveyView.Stage`. */
sealed interface SurveyStage {
    data object Loading : SurveyStage
    data object Failed : SurveyStage
    data object Closed : SurveyStage
    data object Intro : SurveyStage
    data object Questions : SurveyStage
    data class Done(val title: String, val message: String) : SurveyStage
}

data class SurveyUiState(
    val stage: SurveyStage = SurveyStage.Loading,
    val payload: ApiSurveyPublic? = null,
    val currentIndex: Int = 0,
    val answers: Map<String, SurveyAnswer> = emptyMap(),
    val submitting: Boolean = false,
    val submitError: String? = null,
)

@HiltViewModel
class SurveyViewModel @Inject constructor(
    private val api: SabqApi,
) : ViewModel() {

    companion object {
        /** Question types that advance automatically after a tap. */
        val AUTO_ADVANCE_TYPES = setOf("single", "stars", "scale")
        private const val AUTO_ADVANCE_DELAY_MS = 450L
    }

    private val _state = MutableStateFlow(SurveyUiState())
    val state = _state.asStateFlow()

    private var token: String = ""
    private var startedAtMs: Long? = null
    private var advanceJob: Job? = null

    fun load(token: String) {
        if (this.token == token && _state.value.stage != SurveyStage.Failed) return
        this.token = token
        _state.value = SurveyUiState(stage = SurveyStage.Loading)
        viewModelScope.launch {
            try {
                val payload = api.getSurvey(token)
                val firstName = firstNameOf(payload.recipient.name)
                val stage = when {
                    payload.alreadyCompleted -> SurveyStage.Done(
                        title = payload.survey.thankYouTitle?.replace("{name}", firstName)
                            ?: "وصلت إجاباتك يا $firstName 🌟",
                        message = "سبق أن أكملت هذا الاستطلاع — إجاباتك محفوظة لدينا، ولا حاجة لإعادتها.",
                    )
                    payload.survey.status != "active" -> SurveyStage.Closed
                    else -> SurveyStage.Intro
                }
                _state.value = SurveyUiState(stage = stage, payload = payload)
            } catch (_: Exception) {
                _state.value = SurveyUiState(stage = SurveyStage.Failed)
            }
        }
    }

    fun start() {
        startedAtMs = System.currentTimeMillis()
        _state.value = _state.value.copy(stage = SurveyStage.Questions, currentIndex = 0)
    }

    fun answer(question: ApiSurveyQuestion, value: SurveyAnswer) {
        val current = _state.value
        _state.value = current.copy(
            answers = current.answers + (question.id to value),
            submitError = null,
        )
        val isLast = current.currentIndex == (current.payload?.questions?.size ?: 1) - 1
        if (question.type in AUTO_ADVANCE_TYPES && !isLast) {
            advanceJob?.cancel()
            advanceJob = viewModelScope.launch {
                delay(AUTO_ADVANCE_DELAY_MS)
                goNext()
            }
        }
    }

    fun toggleMultiChoice(question: ApiSurveyQuestion, optionIndex: Int) {
        val existing = (_state.value.answers[question.id] as? SurveyAnswer.Numbers)?.values ?: emptyList()
        val maxChoices = question.settings?.maxChoices ?: question.options?.size ?: 12
        val next = when {
            optionIndex in existing -> existing - optionIndex
            existing.size < maxChoices -> (existing + optionIndex).sorted()
            else -> existing
        }
        _state.value = _state.value.copy(
            answers = _state.value.answers + (question.id to SurveyAnswer.Numbers(next)),
            submitError = null,
        )
    }

    fun canProceed(question: ApiSurveyQuestion): Boolean {
        if (!question.required) return true
        return when (val answer = _state.value.answers[question.id]) {
            is SurveyAnswer.Number -> true
            is SurveyAnswer.Numbers -> answer.values.isNotEmpty()
            is SurveyAnswer.Text -> answer.value.isNotBlank()
            null -> false
        }
    }

    fun goNext() {
        advanceJob?.cancel()
        val current = _state.value
        val questions = current.payload?.questions ?: return
        if (current.currentIndex < questions.size - 1) {
            _state.value = current.copy(currentIndex = current.currentIndex + 1, submitError = null)
        } else {
            submit()
        }
    }

    fun goPrevious() {
        advanceJob?.cancel()
        val current = _state.value
        if (current.currentIndex > 0) {
            _state.value = current.copy(currentIndex = current.currentIndex - 1, submitError = null)
        }
    }

    private fun submit() {
        val current = _state.value
        val payload = current.payload ?: return
        if (current.submitting) return
        _state.value = current.copy(submitting = true, submitError = null)
        viewModelScope.launch {
            try {
                val answersJson = JsonObject(
                    current.answers.mapValues { (_, answer) ->
                        when (answer) {
                            is SurveyAnswer.Number -> JsonPrimitive(answer.value)
                            is SurveyAnswer.Numbers -> JsonArray(answer.values.map(::JsonPrimitive))
                            is SurveyAnswer.Text -> JsonPrimitive(answer.value.trim())
                        }
                    },
                )
                val duration = startedAtMs?.let { ((System.currentTimeMillis() - it) / 1000).toInt() }
                val result = api.submitSurvey(token, SurveySubmitBody(answers = answersJson, durationSeconds = duration))
                val firstName = firstNameOf(payload.recipient.name)
                _state.value = _state.value.copy(
                    submitting = false,
                    stage = SurveyStage.Done(
                        title = (result.thankYouTitle ?: "وصلت إجاباتك يا $firstName 🌟")
                            .replace("{name}", firstName),
                        message = result.thankYouMessage
                            ?: "شكرًا لوقتك وصراحتك. كل إجابة كتبتها ستُقرأ باهتمام، وستكون جزءًا من قرارات التطوير القادمة.",
                    ),
                )
            } catch (_: Exception) {
                _state.value = _state.value.copy(
                    submitting = false,
                    submitError = "تعذر إرسال إجاباتك؛ تحقق من الاتصال وحاول مرة أخرى",
                )
            }
        }
    }

    private fun firstNameOf(name: String): String =
        name.trim().split(" ").firstOrNull()?.takeIf { it.isNotBlank() } ?: name
}
