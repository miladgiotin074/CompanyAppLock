package com.company.applock.onboarding

import android.app.Activity
import android.view.View

/**
 * Onboarding template system.
 *
 * The onboarding LOGIC (which permissions are needed, how each is checked and
 * granted, and what "finish" does) lives once in [OnboardingActivity]. The
 * PRESENTATION — the look of the screen, "the template" — is swappable per build
 * flavor: each `template` flavor provides its own [OnboardingTemplateProvider]
 * (and only that flavor's files are compiled), so unused templates add zero size
 * to the final APK.
 *
 * To add a template: add a flavor on the `template` dimension in build.gradle.kts,
 * add src/<flavor>/java/com/company/applock/onboarding/OnboardingTemplateProvider.kt
 * returning your [OnboardingTemplate], and (optionally) src/<flavor>/res/ for its
 * own drawables/colors/strings. See docs/ONBOARDING_TEMPLATES.md.
 */

/**
 * One onboarding step the template renders. The logic (how to check, how to
 * grant) is injected by [OnboardingActivity]; the template only presents it.
 *
 * @param verifiable false for steps with no readable state (e.g. OEM autostart):
 *        the template shows an action affordance but never a granted/pending badge,
 *        and such a step is excluded from progress counts.
 */
class OnboardingStep(
    val id: String,
    val title: String,
    val description: String,
    val optional: Boolean,
    val verifiable: Boolean,
    private val checkGranted: () -> Boolean,
    private val startGrant: () -> Unit,
) {
    /** Current grant state. Always false for non-verifiable steps. */
    val isGranted: Boolean get() = verifiable && checkGranted()

    /** Open this step's Settings / permission flow. */
    fun grant() = startGrant()
}

/**
 * Everything a template needs from the onboarding engine. Implemented by
 * [OnboardingActivity] — the single owner of permission logic and completion.
 */
interface OnboardingHost {
    /** Launcher label of the current build (may be a disguise name). */
    val appName: String

    // Named to avoid clashing with Activity's own `title`/`finish()` members.
    val headline: String
    val subtitle: String
    val finishLabel: String
    val steps: List<OnboardingStep>

    /** Core permissions (usage + overlay) satisfied → finishing is allowed. */
    val isReady: Boolean

    /** Complete onboarding and start the service. A no-op unless [isReady]. */
    fun complete()
}

/**
 * A swappable onboarding presentation. Exactly ONE implementation is compiled
 * per build flavor (via [OnboardingTemplateProvider]).
 */
interface OnboardingTemplate {
    /** Build the onboarding view tree once; return the root to setContentView. */
    fun createView(activity: Activity, host: OnboardingHost): View

    /**
     * Re-read state and refresh rows + the finish affordance. Called on resume
     * and after a permission result — the template must not rebuild the tree.
     */
    fun refresh()
}
