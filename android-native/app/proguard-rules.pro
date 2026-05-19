# Sabq Android native — ProGuard rules

# Keep kotlinx.serialization metadata.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keep,includedescriptorclasses class com.sabq.smart.**$$serializer { *; }
-keepclassmembers class com.sabq.smart.** {
    *** Companion;
}
-keepclasseswithmembers class com.sabq.smart.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Retrofit + OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn retrofit2.**
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}

# Coroutines
-keepclassmembers class kotlinx.coroutines.** { volatile <fields>; }

# Compose
-keep class androidx.compose.runtime.** { *; }
