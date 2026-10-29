package com.company.applock.onboarding

/**
 * Aurora flavor's onboarding template provider.
 *
 * Every `template` build flavor defines an object with this exact name and
 * package in its own source set (src/<flavor>/java/...). When a variant is built,
 * only the selected flavor's copy is compiled and merged with `main`, so the
 * unused templates — and their drawables/strings — never reach the APK.
 */
object OnboardingTemplateProvider {
    /** Identifier of the template compiled into this build. */
    const val ID = "aurora"

    fun create(): OnboardingTemplate = AuroraOnboardingTemplate()
}
