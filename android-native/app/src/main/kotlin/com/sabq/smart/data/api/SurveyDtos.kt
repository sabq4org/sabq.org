package com.sabq.smart.data.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * DTOs for the internal surveys platform (منصة استطلاعات الرأي).
 * Mirrors iOS `APISurveyPublic` in `Screens/SurveyView.swift` — the
 * personal token-gated payload of `GET api/public/surveys/{token}`.
 * The token IS the credential: no login/session required, so the
 * survey opens straight from a push tap even before sign-in.
 */
@Serializable
data class ApiSurveyInfo(
    val title: String = "",
    val purpose: String? = null,
    val welcomeTitle: String? = null,
    val welcomeMessage: String? = null,
    val thankYouTitle: String? = null,
    val thankYouMessage: String? = null,
    val status: String = "active",
)

@Serializable
data class ApiSurveySettings(
    val maxChoices: Int? = null,
    val scaleMin: Int? = null,
    val scaleMax: Int? = null,
    val minLabel: String? = null,
    val maxLabel: String? = null,
)

@Serializable
data class ApiSurveyQuestion(
    val id: String = "",
    /** single | multi | short_text | long_text | stars | scale */
    val type: String = "single",
    val text: String = "",
    val hint: String? = null,
    val required: Boolean = true,
    val options: List<String>? = null,
    val settings: ApiSurveySettings? = null,
)

@Serializable
data class ApiSurveyStats(
    val publishedCount: Int = 0,
    val totalViews: Int = 0,
    val sinceYear: Int? = null,
)

@Serializable
data class ApiSurveyRecipient(
    val name: String = "",
    val stats: ApiSurveyStats? = null,
)

@Serializable
data class ApiSurveyPublic(
    val survey: ApiSurveyInfo = ApiSurveyInfo(),
    val questions: List<ApiSurveyQuestion> = emptyList(),
    val recipient: ApiSurveyRecipient = ApiSurveyRecipient(),
    val alreadyCompleted: Boolean = false,
)

/** `answers` maps questionId → index | indices[] | free text — encoded
 *  exactly like the web client (`JsonObject` keeps the mixed types). */
@Serializable
data class SurveySubmitBody(
    val answers: JsonObject,
    val durationSeconds: Int? = null,
)

@Serializable
data class ApiSurveySubmitResult(
    val success: Boolean = false,
    val thankYouTitle: String? = null,
    val thankYouMessage: String? = null,
)

/** Row of `GET api/v1/surveys/mine` — open invitations for the
 *  signed-in member; drives the pending-survey card in the
 *  contributor dashboard (same as iOS `PendingSurveysCard`). */
@Serializable
data class ApiMySurveyInvite(
    val token: String = "",
    val title: String = "",
    val purpose: String? = null,
    val questionsCount: Int = 0,
    val opened: Boolean = false,
)

@Serializable
data class ApiMySurveysResponse(
    val success: Boolean = true,
    val items: List<ApiMySurveyInvite> = emptyList(),
)
