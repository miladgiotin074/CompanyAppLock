package com.company.applock.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.company.applock.core.DeviceInfo
import com.company.applock.core.Prefs
import com.company.applock.lockengine.LockService
import com.company.applock.sync.AppsReporter
import com.company.applock.watchdog.WatchdogScheduler

/** Keeps the engine alive across app updates and the installed-app list fresh. */
class PackageReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                WatchdogScheduler.schedulePeriodic(ctx)
                val prefs = Prefs.get(ctx)
                if (prefs.onboardingComplete && DeviceInfo.hasCorePermissions(ctx)) {
                    runCatching { LockService.start(ctx) }
                }
            }
            Intent.ACTION_PACKAGE_ADDED,
            Intent.ACTION_PACKAGE_REMOVED,
            -> AppsReporter.collectAndEnqueue(ctx)
        }
    }
}
