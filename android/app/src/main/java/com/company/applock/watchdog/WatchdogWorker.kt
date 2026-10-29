package com.company.applock.watchdog

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.company.applock.core.Constants
import com.company.applock.core.DeviceInfo
import com.company.applock.core.Prefs
import com.company.applock.lockengine.LockService
import com.company.applock.sync.SyncEngine

/**
 * Cheap, idempotent liveness check: if we should be running, (re)assert the
 * foreground service and send a heartbeat; then re-arm the alarm and flush.
 */
class WatchdogWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val prefs = Prefs.get(ctx)

        if (prefs.onboardingComplete && DeviceInfo.hasCorePermissions(ctx)) {
            runCatching { LockService.start(ctx, Constants.ACTION_RESTART) }
            SyncEngine.get(ctx).enqueueHeartbeat()
        }

        WatchdogScheduler.scheduleAlarm(ctx)
        SyncEngine.get(ctx).flushNow()
        return Result.success()
    }
}
