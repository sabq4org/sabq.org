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
        // Play Store published bundle is com.sabqorg.sabq (versionCode
        // 120 at 9.0.1). Native 10.0 ships as 121 over the SAME id so
        // it counts as an update, not a new app install.
        applicationId = "com.sabqorg.sabq"
        minSdk = 26
        targetSdk = 35
        versionCode = 121
        versionName = "10.0.0"

        // Locks the rendering locale to Arabic. We still honour the
        // OS-level RTL config in code, but resource fallback is forced
        // to ar so plural/string resources never surprise-flip into en.
        resourceConfigurations += listOf("ar")

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }
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
}
