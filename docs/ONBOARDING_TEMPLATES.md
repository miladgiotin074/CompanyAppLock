# Onboarding templates (build-time, zero dead weight)

The client's onboarding screen can have several looks ("templates"). Each build
picks **one** template, and **only that template's code/resources are compiled**
into the APK — unused templates add no size.

## How it works

- **Logic lives once, in `main`.** `OnboardingActivity` (src/main) owns the
  permission steps, the grant intents, the state checks and the finish side-effects.
  It implements the `OnboardingHost` contract.
- **Presentation is swappable, per flavor.** `OnboardingTemplate` (the look) is
  provided by `OnboardingTemplateProvider`, which each **product flavor** defines
  in its own source set (`src/<flavor>/java/...`). Gradle compiles only the
  selected flavor, so the other templates never reach the APK.

```
src/main/.../onboarding/
    OnboardingContract.kt     # OnboardingStep, OnboardingHost, OnboardingTemplate
    OnboardingActivity.kt     # the logic + host (shared by every template)
    AutostartHelper.kt
src/pulse/.../onboarding/
    OnboardingTemplateProvider.kt   # object -> PulseOnboardingTemplate()
    PulseOnboardingTemplate.kt
src/velvet/.../onboarding/
    OnboardingTemplateProvider.kt   # object -> VelvetOnboardingTemplate() (default build)
    VelvetOnboardingTemplate.kt
src/aurora/.../onboarding/
    OnboardingTemplateProvider.kt   # object -> AuroraOnboardingTemplate()
    AuroraOnboardingTemplate.kt
```

The flavors are declared in `app/build.gradle.kts` on the `template` dimension:

```kotlin
flavorDimensions += "template"
productFlavors {
    create("pulse") { dimension = "template" }
    create("velvet") { dimension = "template"; isDefault = true }
    create("aurora") { dimension = "template" }
}
```

`applicationId` is **not** changed per flavor — every template keeps
`com.company.applock`, so FCM topic/token, ports, the backend and one
`google-services.json` all stay the same.

## Choosing a template for a build

Variant names are `<flavor><BuildType>`:

- Android Studio → **Build Variants** panel → default is `velvetRelease` (or `velvetDebug`).
- CLI: `./gradlew assembleVelvetRelease` (default) or `assemblePulseRelease` / `assembleAuroraRelease`.

> Note: because a flavor exists now, the plain `assembleDebug`/`assembleRelease`
> tasks resolve to the **default** template flavor (`velvet`), e.g. `assembleVelvetDebug`.

## Adding a new template "foo"

1. Add the flavor in `app/build.gradle.kts`:
   ```kotlin
   productFlavors {
       create("aurora") { dimension = "template" }
       create("foo")    { dimension = "template" }
   }
   ```
2. Create `src/foo/java/com/company/applock/onboarding/OnboardingTemplateProvider.kt`:
   ```kotlin
   package com.company.applock.onboarding
   object OnboardingTemplateProvider {
       const val ID = "foo"
       fun create(): OnboardingTemplate = FooOnboardingTemplate()
   }
   ```
3. Create `src/foo/java/com/company/applock/onboarding/FooOnboardingTemplate.kt`
   implementing `OnboardingTemplate` (`createView` + `refresh`). Render from the
   `OnboardingHost` you receive — never re-implement permission logic.
4. (Optional) add `src/foo/res/` for that template's own drawables/colors/strings.
   They ship only in the `foo` builds.

Every `template` flavor **must** provide an `OnboardingTemplateProvider` with that
exact package/name (that is how `main` stays flavor-agnostic). A variant whose
flavor is missing it will not compile.

## The contract (what a template may use)

`OnboardingHost` (read-only to the template):

- `appName`, `headline`, `subtitle`, `finishLabel` — copy to show.
- `steps: List<OnboardingStep>` — each has `title`, `description`, `optional`,
  `verifiable`, `isGranted`, and `grant()` (opens its Settings flow).
  `verifiable == false` (e.g. OEM autostart) means "no readable state": show an
  action, never a granted/pending badge, and exclude it from progress.
- `isReady` — true once the **core** permissions (usage + overlay) are granted;
  only then may the template call `complete()`.
- `complete()` — finishes onboarding and starts the lock service.

`OnboardingTemplate`:

- `createView(activity, host): View` — build the tree once, return the root.
- `refresh()` — re-read state and update rows + the finish affordance (called on
  resume and after a permission result; must not rebuild the tree).

## Build rule

Per project rule #3 the APK is **not** built by the agent — build it yourself in
Android Studio after selecting the variant.
