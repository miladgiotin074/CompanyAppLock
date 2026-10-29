package com.company.applock.onboarding

object OnboardingTemplateProvider {
    const val ID = "velvet"

    fun create(): OnboardingTemplate = VelvetOnboardingTemplate()
}
