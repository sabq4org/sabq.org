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

    // The app Json (NetworkModule) keeps encodeDefaults = false. Without
    // @EncodeDefault the server never saw platform/provider and stored the
    // device as iOS/APNs, so no push reached Android.
    private val appJson = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    @Test
    fun genericRegistrationAlwaysSendsAndroidFcm() {
        val payload = appJson.encodeToString(
            DeviceRegisterRequest(deviceToken = "token", bundleId = "com.sabqorg.sabq"),
        )
        assertTrue(payload, payload.contains("\"platform\":\"android\""))
        assertTrue(payload, payload.contains("\"tokenProvider\":\"fcm\""))
    }

    @Test
    fun memberRegistrationAlwaysSendsAndroidFcm() {
        val payload = appJson.encodeToString(
            MemberPushTokenRequest(token = "token", bundleId = "com.sabqorg.sabq", installationId = "i"),
        )
        assertTrue(payload, payload.contains("\"platform\":\"android\""))
        assertTrue(payload, payload.contains("\"provider\":\"fcm\""))
    }
}
