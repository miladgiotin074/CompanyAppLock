package com.company.applock.watchdog

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.company.applock.core.Constants
import com.company.applock.receivers.BootReceiver
import java.util.concurrent.TimeUnit

/**
 * Overlapping recovery scheduling. No single mechanism is trusted:
 *   1) WorkManager periodic watchdog (survives process death + app updates).
 *   2) AlarmManager one-shot (re-armed each fire) as a Doze-tolerant backup.
 *   3) scheduleImmediateRestart() for prompt self-heal after onDestroy/onTaskRemoved.
 */
object WatchdogScheduler {

    private const val ALARM_REQUEST = 7001
    private val ALARM_INTERVAL_MS = TimeUnit.MINUTES.toMillis(15)

    fun schedulePeriodic(ctx: Context) {
        val req = PeriodicWorkRequestBuilder<WatchdogWorker>(15, TimeUnit.MINUTES).build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
            Constants.WORK_WATCHDOG,
            ExistingPeriodicWorkPolicy.KEEP,
            req,
        )
        scheduleAlarm(ctx)
    }

    fun scheduleImmediateRestart(ctx: Context) {
        val req = OneTimeWorkRequestBuilder<WatchdogWorker>()
            .setConstraints(Constraints.NONE)
            .build()
        WorkManager.getInstance(ctx).enqueueUniqueWork(
            Constants.WORK_WATCHDOG + "-now",
            ExistingWorkPolicy.REPLACE,
            req,
        )
    }

    /** One-shot, allowed to fire in Doze; the worker re-arms the next one. */
    fun scheduleAlarm(ctx: Context) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(ctx, BootReceiver::class.java).setAction(Constants.ACTION_RESTART)
        val pi = PendingIntent.getBroadcast(
            ctx,
            ALARM_REQUEST,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val trigger = System.currentTimeMillis() + ALARM_INTERVAL_MS
        runCatching { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pi) }
    }
}
