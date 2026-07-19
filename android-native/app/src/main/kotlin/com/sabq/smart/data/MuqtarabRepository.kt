package com.sabq.smart.data

import com.sabq.smart.data.api.SabqApi
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Gateway for the «مُقترب» public reads. Thin wrapper over the seven
 * `/api/muqtarab/…` endpoints — maps DTOs to domain models and swallows
 * the best-effort view ping. Mirrors the iOS `APIClient` extension in
 * `Services/MuqtarabModels.swift`.
 */
@Singleton
class MuqtarabRepository @Inject constructor(
    private val api: SabqApi,
) {
    /** All active angles with stats (topic count + writer). */
    suspend fun getAngles(withStats: Boolean = true): List<MuqAngle> =
        api.getMuqtarabAngles(active = true, withStats = withStats).map { it.toDomain() }

    /** Latest/featured published topics — home strip + landing feed. */
    suspend fun getFeaturedTopics(limit: Int = 8): List<MuqTopic> =
        api.getMuqtarabFeaturedTopics(limit = limit).map { it.toDomain() }

    /** A single angle's header + writer. */
    suspend fun getAngleDetail(slug: String): MuqAngleDetail =
        api.getMuqtarabAngleDetail(slug).toDomain()

    /** A single angle's published topics. */
    suspend fun getAngleTopics(slug: String, limit: Int = 30): List<MuqTopic> =
        api.getMuqtarabAngleTopics(slug, limit = limit).topics.map { it.toDomain() }

    /** A published topic + its angle + writer. */
    suspend fun getTopic(angleSlug: String, topicSlug: String): MuqTopicDetail {
        val res = api.getMuqtarabTopic(angleSlug = angleSlug, topicSlug = topicSlug)
        return MuqTopicDetail(
            topic = res.topic.toDomain(),
            angle = res.angle.toDomain(),
            writer = res.writer?.toDomain(),
        )
    }

    /** Writer profile: bio + angles + published topics. */
    suspend fun getWriter(id: String): MuqWriterProfile =
        api.getMuqtarabWriter(id).toDomain()

    /** Best-effort topic-view registration. Never throws — a failed
     *  ping must not break reading. */
    suspend fun reportTopicView(id: String) {
        runCatching { api.reportMuqtarabTopicView(id) }
    }
}
