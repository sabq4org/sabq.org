package com.sabq.smart.data.api

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNames

/**
 * Push-device registration DTOs — mirrors the iOS APNs registration
 * path. Backend route: `mobileApiRoutes.ts:498` POST `/devices/register`.
 *
 * The app Json uses `encodeDefaults = false`, so a field equal to its
 * default is dropped from the body. `platform` / `provider` must always be
 * sent (the server used to default missing values to iOS/APNs and Apple
 * then rejected our FCM tokens), hence `@EncodeDefault(ALWAYS)`.
 * Same envelope works for updates (server matches on `deviceToken`).
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class DeviceRegisterRequest(
    val deviceToken: String,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS)
    val platform: String = "android",
    @EncodeDefault(EncodeDefault.Mode.ALWAYS)
    val tokenProvider: String = "fcm",
    val deviceName: String? = null,
    val osVersion: String? = null,
    val appVersion: String? = null,
    val locale: String? = "ar",
    val timezone: String? = null,
    val installationId: String? = null,
    val bundleId: String,
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

/** App-scoped push registration used by the Gulf Cup notification outbox. */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class MemberPushTokenRequest(
    val token: String,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS)
    val provider: String = "fcm",
    @EncodeDefault(EncodeDefault.Mode.ALWAYS)
    val platform: String = "android",
    val deviceName: String? = null,
    val osVersion: String? = null,
    val appVersion: String? = null,
    val locale: String? = "ar",
    val timezone: String? = null,
    val bundleId: String,
    val installationId: String,
)

@Serializable
data class MemberPushTokenDeleteRequest(val token: String)

@Serializable
data class MemberPushTokenResponse(
    val success: Boolean = false,
    val message: String? = null,
)
