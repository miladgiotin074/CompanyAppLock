package com.company.applock.core

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import com.company.applock.R

/**
 * Notification channels + builders. Framework APIs only (no AppCompat).
 *
 * Policy: the app shows NO notification other than the mandatory foreground-
 * service notice. There is exactly one channel (the FGS one) and exactly one
 * notification (serviceNotification). Any older "stability" channel/notification
 * is actively removed below.
 */
object Notifications {

    fun createChannels(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(NotificationManager::class.java)

        val service = NotificationChannel(
            Constants.CH_SERVICE,
            ctx.getString(R.string.notif_channel_service),
            NotificationManager.IMPORTANCE_MIN, // quiet, no sound — just the required FGS notice
        ).apply {
            setShowBadge(false)
            lockscreenVisibility = Notification.VISIBILITY_SECRET
        }
        nm.createNotificationChannel(service)

        // Clean up anything a previous version may have created/shown.
        runCatching { nm.deleteNotificationChannel(Constants.CH_STABILITY) }
        runCatching { nm.cancel(Constants.NOTIF_STABILITY) }
    }

    fun serviceNotification(ctx: Context): Notification {
        val b = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(ctx, Constants.CH_SERVICE)
        } else {
            @Suppress("DEPRECATION") Notification.Builder(ctx)
        }
        b.setContentTitle(ctx.getString(R.string.notif_service_title))
            .setContentText(ctx.getString(R.string.notif_service_text))
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setOngoing(true)
        // Ask the OS to DEFER showing the mandatory FGS notice. This is the only
        // OS-supported way to keep it off-screen right after the service starts —
        // but the platform still reveals it within ~10s; it CANNOT be held back
        // for minutes (a foreground service must surface its notification).
        // Best-effort: honored on Android 12+ (S) only.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_DEFERRED)
        }
        return b.build()
    }
}
