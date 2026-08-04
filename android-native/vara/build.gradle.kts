import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// FCM لا يعمل بلا google-services.json (غير ملتزم به — سرّ تشغيل يضيفه مالك
// Firebase محليًا/في CI). البلجن يُطبَّق فقط عند وجود الملف كي يبقى البناء
// أخضر بتدهور آمن — بدونه FirebaseApp.initializeApp يفشل بصمت فلا إشعارات.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "com.sabq.vara"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.sabq.sports"
        minSdk = 26
        targetSdk = 36
        versionCode = 5
        versionName = "1.0.3"
        vectorDrawables { useSupportLibrary = true }
    }

    androidResources { localeFilters += listOf("ar", "en") }

    // توقيع VARA مستقل تمامًا عن توقيع تطبيق سبق الرئيسي.
    // القيم تُقرأ من android-native/local.properties (مستبعد من Git)
    // أو من متغيرات البيئة VARA_STOREFILE / VARA_STOREPASSWORD / ...
    val keystoreProps = Properties().apply {
        val file = rootProject.file("local.properties")
        if (file.exists()) file.inputStream().use { load(it) }
    }
    fun varaProp(name: String): String? =
        keystoreProps.getProperty(name) ?: System.getenv(name.uppercase().replace('.', '_'))

    val varaStoreFile = varaProp("vara.storeFile")?.let { rootProject.file(it) }
    val hasVaraSigning = varaStoreFile?.exists() == true &&
        varaProp("vara.storePassword") != null &&
        varaProp("vara.keyAlias") != null &&
        varaProp("vara.keyPassword") != null

    signingConfigs {
        if (hasVaraSigning) {
            create("varaRelease") {
                storeFile = varaStoreFile
                storePassword = varaProp("vara.storePassword")
                keyAlias = varaProp("vara.keyAlias")
                keyPassword = varaProp("vara.keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".dev"
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // لا تُستخدم مفاتيح نشر تطبيق سبق العام لوحدة VARA الجديدة.
            signingConfig = if (hasVaraSigning) {
                signingConfigs.getByName("varaRelease")
            } else {
                // بناء محلي آمن فقط؛ متجر Play سيرفض مفتاح debug.
                signingConfigs.getByName("debug")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true }
    packaging.resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"

    sourceSets.getByName("main") {
        java.srcDirs("src/main/kotlin")
        // الخطوط نفسها المستخدمة في تطبيق سبق Android؛ مصدر واحد بلا نسخ ثنائية.
        res.srcDirs("src/main/res", "../app/src/main/res")
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.splashscreen)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.compose.animation)
    implementation(libs.androidx.navigation.compose)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.coil.compose)
    implementation(libs.androidx.datastore.preferences)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)

    testImplementation(libs.junit)
}
