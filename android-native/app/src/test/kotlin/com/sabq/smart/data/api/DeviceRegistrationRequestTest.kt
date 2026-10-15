package com.sabq.smart.data.api

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertTrue
import org.junit.Test

class DeviceRegistrationRequestTest {
    @Test
    fun genericRegistrationCarriesTheAndroidApplicationId() {
        val payload = Json.encodeToString(
            DeviceRegisterRequest(
                deviceToken = "token",
                bundleId = "com.sabqorg.sabq",
            ),
        )

        assertTrue(payload.contains("\"bundleId\":\"com.sabqorg.sabq\""))
    }

    @Test
    fun memberRegistrationCarriesTheAndroidApplicationId() {
        val payload = Json.encodeToString(
            MemberPushTokenRequest(
                token = "token",
                bundleId = "com.sabqorg.sabq",
                installationId = "installation",
            ),
        )

        assertTrue(payload.contains("\"bundleId\":\"com.sabqorg.sabq\""))
    }
}
