package com.sabq.smart.data.api

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNames

/**
 * Push-device registration DTOs — mirrors the iOS APNs registration
 * path. Backend route: `mobileApiRoutes.ts:498` POST `/devices/register`.
 *
 * Server auto-derives `tokenProvider = "fcm"` when `platform = "android"`,
 * so we don't need to set it explicitly. Same envelope works for
 * updates (server matches on `deviceToken` and upserts).
 */
@Serializable
data class DeviceRegisterRequest(
    val deviceToken: String,
    val platform: String = "android",
    val deviceName: String? = null,
    val osVersion: String? = null,
    val appVersion: String? = null,
    val locale: String? = "ar",
    val timezone: String? = null,
    val userId: String? = null,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class DeviceRegisterResponse(
    val success: Boolean = false,
    @JsonNames("device_id", "deviceId")
    val deviceId: String? = null,
    val message: String? = null,
)

@Serializable
data class DeviceUnregisterRequest(
    val deviceToken: String,
)
