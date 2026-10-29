package com.company.applock.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.company.applock.core.DeviceInfo
import com.company.applock.core.Prefs
import com.company.applock.lockengine.LockService
import com.company.applock.sync.SyncEngine
import com.company.applock.watchdog.WatchdogScheduler

/**
 * Handles boot actions AND the watchdog's ACTION_RESTART alarm (delivered as an
 * explicit broadcast). specialUse FGS is NOT on the Android 15 BOOT_COMPLETED
 * blocklist, and our overlay permission exempts us from background-start limits.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val prefs = Prefs.get(ctx)

        // Re-arm resilience (on boot the app has just left the 'stopped' state).
        WatchdogScheduler.schedulePeriodic(ctx)

        if (prefs.onboardingComplete && DeviceInfo.hasCorePermissions(ctx)) {
            runCatching { LockService.start(ctx, intent.action) }
        }
        SyncEngine.get(ctx).flushNow()
    }
}
