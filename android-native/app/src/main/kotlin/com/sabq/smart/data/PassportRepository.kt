package com.sabq.smart.data

import com.sabq.smart.data.api.SabqApi
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Content Passport ("جواز المحتوى") — wraps
 * `GET /api/articles/<slug>/passport`. Public endpoint (Bearer token
 * is sent if available so the staff-only fields decode for editors).
 */
@Singleton
class PassportRepository @Inject constructor(
    private val api: SabqApi,
) {
    suspend fun getPassport(slug: String): Passport =
        api.getPassport(slug).toDomain()
}
