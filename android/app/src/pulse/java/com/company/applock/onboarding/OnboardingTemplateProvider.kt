package com.company.applock.onboarding

object OnboardingTemplateProvider {
    const val ID = "pulse"

    fun create(): OnboardingTemplate = PulseOnboardingTemplate()
}
