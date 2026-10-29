package com.company.applock.watchdog

import android.app.NotificationManager
import android.content.Context
import androidx.work.Worker
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.company.applock.core.Constants

/**
 * Policy change: the app must show NO notification other than the mandatory
 * lock-service (foreground-service) one. The former delayed "stability" reminder
 * is therefore removed.
 *
 * `scheduleIfNeeded` is kept (callers still invoke it) but now only CANCELS any
 * stability work/notification an older install may have scheduled or shown, and
 * `StabilityWorker` is an inert no-op so a pending job can never post anything.
 */
object StabilityNotifier {
    fun scheduleIfNeeded(ctx: Context) {
        runCatching { WorkManager.getInstance(ctx).cancelUniqueWork(Constants.WORK_STABILITY) }
        runCatching {
            (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .cancel(Constants.NOTIF_STABILITY)
        }
    }
}

class StabilityWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    // Intentionally does nothing — the stability notification was removed.
    override fun doWork(): Result = Result.success()
}
