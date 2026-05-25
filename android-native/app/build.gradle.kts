import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    // Kotlin namespace stays at com.sabq.smart (where all the .kt
    // files live + the R class). The Play Store applicationId
    // (com.sabqorg.sabq) is independent — Android Gradle Plugin
    // supports this split without renaming source folders.
    namespace = "com.sabq.smart"
    compileSdk = 35

    defaultConfig {
        // Play Store published bundles for com.sabqorg.sabq:
        //   • 9.0.1 (120) — legacy Capacitor build
        //   • 10.0.0 (121) — first native release (2026-05-21)
        //   • 10.0.1 (122) — launcher icon update (this build)
        // versionCode strictly monotonic upward — Play rejects equal/lower.
        applicationId = "com.sabqorg.sabq"
        minSdk = 26
        targetSdk = 35
        versionCode = 124
        versionName = "10.0.2"

        // Locks the rendering locale to Arabic. We still honour the
        // OS-level RTL config in code, but resource fallback is forced
        // to ar so plural/string resources never surprise-flip into en.
        resourceConfigurations += listOf("ar")

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }

        // GA4 Measurement Protocol credentials — Sabq Android App (MP) stream
        // in the Sabq GA3 - GA4 property. Shared with web (gtag.js) and iOS
        // (MP) so events unify in Reports → Engagement → Events.
        // These values are also visible in the on-the-wire HTTPS POST, so
        // committing them is no different from shipping them inside the APK.
        buildConfigField("String", "GA4_MEASUREMENT_ID", "\"G-XPS0W1N9CQ\"")
        buildConfigField("String", "GA4_API_SECRET", "\"8rfI2G7RTxW7IZ4iIM-D-A\"")

        // OAuth — Google Web Client ID is what Credential Manager uses to
        // sign Google ID tokens that our backend can verify (the backend
        // checks the audience against `GOOGLE_CLIENT_ID`, the Web client).
        // The Android-package-bound client ID still has to exist + carry
        // the right SHA-1, but THAT client's value isn't passed at
        // runtime — Google figures out which Android client this APK is
        // by matching the package name + signing certificate.
        buildConfigField(
            "String",
            "GOOGLE_WEB_CLIENT_ID",
            "\"664097075837-63pb4ja61jjo6fnikljvmkude964451a.apps.googleusercontent.com\"",
        )
    }

    // Production signing config reads from local.properties (gitignored)
    // or environment variables — never commit keystore credentials.
    //   release.storeFile     = absolute path to release.keystore
    //   release.storePassword = keystore password
    //   release.keyAlias      = upload key alias
    //   release.keyPassword   = key password
    // If any are missing, the release build falls back to the debug
    // signing config (safe — won't accidentally ship a wrong-keyed AAB).
    val keystoreProps = Properties().apply {
        val f = rootProject.file("local.properties")
        if (f.exists()) f.inputStream().use { stream -> load(stream) }
    }
    fun prop(name: String): String? =
        keystoreProps.getProperty(name) ?: System.getenv(name.uppercase().replace('.', '_'))

    val releaseStoreFile = prop("release.storeFile")?.let { rootProject.file(it) }
    val hasReleaseSigning = releaseStoreFile?.exists() == true &&
        prop("release.storePassword") != null &&
        prop("release.keyAlias") != null &&
        prop("release.keyPassword") != null

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = releaseStoreFile
                storePassword = prop("release.storePassword")
                keyAlias = prop("release.keyAlias")
                keyPassword = prop("release.keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            // Coexist with the published app on the same device while
            // testing. Drop the suffix when shipping to Play Store.
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            signingConfig = if (hasReleaseSigning) {
                signingConfigs.getByName("release")
            } else {
                // Fail-safe: a release build without prod keys uses
                // the debug key, which Play Store will REJECT — that's
                // exactly what we want until the keys are wired in.
                signingConfigs.getByName("debug")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions { jvmTarget = "17" }

    sourceSets {
        getByName("main") {
            java.srcDirs("src/main/kotlin")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // Core
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.splashscreen)

    // Compose
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.compose.animation)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.hilt.navigation.compose)
    implementation(libs.androidx.compose.ui.text.google.fonts)

    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    // Coroutines
    implementation(libs.kotlinx.coroutines.android)
    // play-services adapter — lets us `await()` Google Play Tasks
    // (FirebaseMessaging.getInstance().token) from suspend code.
    implementation(libs.kotlinx.coroutines.play.services)

    // Hilt
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)

    // Networking
    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization.json)

    // Image loading
    implementation(libs.coil.compose)

    // Storage
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    implementation(libs.androidx.datastore.preferences)

    // Push (FCM)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)

    // Media (audio)
    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.session)
    implementation(libs.androidx.media3.ui)

    // OAuth — Google Sign-In via Credential Manager + Apple via Custom Tab.
    // androidx.credentials is the modern Sign-In API (replaces GoogleSignInClient).
    // androidx.browser provides CustomTabsIntent which we use for the Apple
    // authorize flow since Apple has no native Android SDK.
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services.auth)
    implementation(libs.google.id)
    implementation(libs.androidx.browser)
}
