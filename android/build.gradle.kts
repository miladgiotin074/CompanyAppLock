// Root build file. Plugin versions declared once, applied in :app.
plugins {
    id("com.android.application") version "8.7.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.20" apply false
    id("com.google.devtools.ksp") version "2.0.20-1.0.25" apply false
    id("com.google.gms.google-services") version "4.4.2" apply false
}
