package com.company.applock.core

import com.company.applock.BuildConfig

/** App-wide constant identifiers. */
object Constants {
    const val PREFS = "applock_prefs"

    val API_BASE: String = BuildConfig.API_BASE
    val FCM_TOPIC: String = BuildConfig.FCM_TOPIC

    // Notification channels / ids.
    const val CH_SERVICE = "service"
    const val CH_STABILITY = "stability"
    const val NOTIF_SERVICE = 1001
    const val NOTIF_STABILITY = 1002

    // WorkManager unique names.
    const val WORK_SYNC = "sync-flush"
    const val WORK_WATCHDOG = "watchdog"
    const val WORK_STABILITY = "stability-notif"

    // Internal intent actions.
    const val ACTION_RESTART = "com.company.applock.action.RESTART"

    // Dedupe keys (collapsible, last-writer-wins outbox rows).
    const val DK_REGISTER = "register"
    const val DK_HEARTBEAT = "heartbeat"
    const val DK_PERMISSIONS = "permissions"
    const val DK_APPS = "apps"

    // Outbox request types.
    const val T_REGISTER = "REGISTER"
    const val T_HEARTBEAT = "HEARTBEAT"
    const val T_APPS = "APP_LIST"
    const val T_PERMISSIONS = "PERMISSIONS"
    const val T_CMD_RESULT = "CMD_RESULT"
}
