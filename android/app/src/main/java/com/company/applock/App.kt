package com.company.applock

import android.app.Application
import com.company.applock.core.Constants
import com.company.applock.core.DeviceInfo
import com.company.applock.core.Notifications
import com.company.applock.core.Prefs
import com.company.applock.core.ServerConfig
import com.company.applock.fcm.FcmBootstrap
import com.company.applock.icon.FirstActionController
import com.company.applock.lockengine.LockService
import com.company.applock.sync.SyncEngine
import com.company.applock.watchdog.WatchdogScheduler

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        val prefs = Prefs.get(this)
        ServerConfig.init(this) // apply any on-device server URL override first

        Notifications.createChannels(this)
        prefs.deviceId // ensure a stable id exists

        // Subscribe to the broadcast-wake topic (client-side; server also subscribes).
        FcmBootstrap.ensureTopicAndToken(this)

        // Resilience layer is armed regardless of onboarding; the worker is a cheap
        // no-op until the engine is actually needed.
        WatchdogScheduler.schedulePeriodic(this)

        // Make sure the backend learns about us even before onboarding finishes.
        SyncEngine.get(this).enqueueRegister()

        // If we're already set up, bring the engine up now.
        if (prefs.onboardingComplete && DeviceInfo.hasCorePermissions(this)) {
            runCatching { LockService.start(this, Constants.ACTION_RESTART) }
        }

        // First action (icon) on app start — runs only if its timing is satisfied
        // and it hasn't already run this install. When the policy hasn't arrived
        // yet, SyncEngine.applyConfig retries this as soon as it does.
        FirstActionController.maybeApply(this)
    }
}
