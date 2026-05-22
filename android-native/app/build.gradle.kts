plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "com.sabq.smart"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.sabq.smart"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "10.0.0-native"

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
    }

    buildTypes {
        debug {
            // Coexist with the published Capacitor app
            // (com.sabq.smart) and the eventual native release on the
            // same device. Drop the suffix when native is ready to
            // replace the Capacitor build on Play Store.
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
            signingConfig = signingConfigs.getByName("debug") // TODO: production signing
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
}
