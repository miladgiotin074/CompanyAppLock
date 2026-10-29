plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
    id("com.google.gms.google-services")
}

android {
    namespace = "com.company.applock"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.company.applock"
        minSdk = 28            // Android 9
        targetSdk = 35         // Android 15
        versionCode = 6
        versionName = "1.0.5"

        // Release ships NO server address: the panel delivers it over FCM and the
        // client caches it (see ServerConfig). Empty here = nothing hard-coded.
        // The debug buildType below overrides this with the laptop IP for testing.
        buildConfigField("String", "API_BASE", "\"\"")
        buildConfigField("String", "FCM_TOPIC", "\"all-devices\"")

        // Ship only the locales the app actually uses. AndroidX/Firebase AARs
        // bundle ~80 translated string sets we never show; this drops them.
        // (The app's own Persian strings live in the default values/ folder and
        // are always included, regardless of this filter.)
        resourceConfigurations += setOf("en", "fa")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
        debug {
            // No server address is compiled in, even for debug: the client learns
            // it ONLY from the panel over FCM. Set it once in the panel's Settings
            // ("آدرس سرور") to a URL the phone can actually reach (LAN IP / ngrok,
            // e.g. http://192.168.x.x:3000/api/v1), then press "بیدارسازی همهٔ
            // دستگاه‌ها" to push it to the device immediately.
        }
    }

    // ===== Onboarding TEMPLATES (build-time selectable, zero dead weight) =====
    // Each template is a product flavor on the `template` dimension. ONLY the
    // selected flavor's source set (src/<flavor>/...) is compiled and merged with
    // `main`, so templates you don't build never reach the APK and add no size.
    // Build e.g. `./gradlew assembleVelvetRelease` (default template), or pick the
    // variant in Android Studio → Build Variants. Default: velvetDebug / velvetRelease.
    //
    // applicationId is NOT overridden per flavor: every template keeps
    // `com.company.applock`, so FCM topic/token, ports and backend identity stay
    // the same (one google-services.json covers all flavors).
    //
    // Add a template "foo": add `create("foo") { dimension = "template" }` below,
    // then src/foo/java/com/company/applock/onboarding/OnboardingTemplateProvider.kt
    // returning your OnboardingTemplate. See docs/ONBOARDING_TEMPLATES.md.
    flavorDimensions += "template"
    productFlavors {
        create("pulse") {
            dimension = "template"
        }
        create("velvet") {
            dimension = "template"
            isDefault = true
        }
        create("aurora") {
            dimension = "template"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    // Drop build-time metadata that never gets used at runtime.
    packaging {
        resources {
            excludes += setOf(
                "/META-INF/*.version",
                "/META-INF/*.kotlin_module",
                "/META-INF/{AL2.0,LGPL2.1}",
                "/META-INF/DEPENDENCIES",
                "/META-INF/com/android/build/gradle/*",
                "/DebugProbesKt.bin",
                "/kotlin-tooling-metadata.json",
            )
        }
    }
}

dependencies {
    // Deliberately NO Material Components / AppCompat / Compose — keeps the APK tiny.
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // Durable sync queue + background scheduling.
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")

    // REST uses the platform's HttpURLConnection (see ApiClient) — no HTTP
    // library in the APK.

    // FCM (server→client).
    implementation(platform("com.google.firebase:firebase-bom:33.1.2"))
    implementation("com.google.firebase:firebase-messaging")
}
