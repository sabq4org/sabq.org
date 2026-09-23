package com.sabq.smart.data

import java.net.SocketTimeoutException
import kotlinx.serialization.SerializationException
import org.junit.Assert.*
import org.junit.Test

/** نصوص فشل التسجيل بحسب الحالة (#1530) — نظير اختبارات iOS للدفعة 5. */
class RegistrationErrorTest {
    @Test fun copyByStatus() {
        assertEquals(RegistrationErrorMessage.TOO_LARGE, RegistrationErrorMessage.message(AuthHttpException(413, "")))
        assertEquals(RegistrationErrorMessage.TOO_MANY, RegistrationErrorMessage.message(AuthHttpException(429, "")))
        assertEquals(RegistrationErrorMessage.FORBIDDEN, RegistrationErrorMessage.message(AuthHttpException(403, "")))
        assertEquals(RegistrationErrorMessage.CONNECTION, RegistrationErrorMessage.message(AuthHttpException(502, "")))
        assertEquals(RegistrationErrorMessage.CONNECTION, RegistrationErrorMessage.message(AuthHttpException(408, "")))
        assertEquals(RegistrationErrorMessage.CONNECTION, RegistrationErrorMessage.message(SocketTimeoutException()))
        assertEquals(RegistrationErrorMessage.CONNECTION, RegistrationErrorMessage.message(SerializationException("bad")))
        assertEquals(RegistrationErrorMessage.UNCONFIRMED, RegistrationErrorMessage.message(AuthHttpException(400, "")))
    }

    @Test fun keepsServerMessagesAndPromisesDataIsKept() {
        assertEquals("البريد مستخدم من قبل", RegistrationErrorMessage.message(AuthHttpException(409, "البريد مستخدم من قبل")))
        assertEquals("خطأ مقصود", RegistrationErrorMessage.message(AuthException("خطأ مقصود")))
        assertTrue(RegistrationErrorMessage.CONNECTION.contains("بياناتك ما زالت في النموذج"))
        assertTrue(RegistrationErrorMessage.UNCONFIRMED.contains("بياناتك ما زالت في النموذج"))
        assertFalse(RegistrationErrorMessage.message(AuthHttpException(500, "")).contains("500"))
    }
}
