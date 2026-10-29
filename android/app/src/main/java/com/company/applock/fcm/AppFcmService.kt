package com.company.applock.fcm

import com.company.applock.core.Constants
import com.company.applock.core.DeviceInfo
import com.company.applock.core.Prefs
import com.company.applock.core.ServerConfig
import com.company.applock.icon.IconController
import com.company.applock.lockengine.LockService
import com.company.applock.sync.SyncEngine
import com.company.applock.watchdog.WatchdogScheduler
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Receives server→client messages. All commands are data-only + high priority,
 * so this runs even in the background/Doze.
 *
 * Revive-on-FCM (operator requirement): EVERY message first ensures the lock
 * engine is alive (if possible) before the command is handled.
 */
class AppFcmService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        val prefs = Prefs.get(this)
        prefs.fcmToken = token
        runCatching { FirebaseMessaging.getInstance().subscribeToTopic(Constants.FCM_TOPIC) }
        SyncEngine.get(this).enqueueRegister()
    }

    override fun onMessageReceived(message: RemoteMessage) {
        reviveEngine()

        val data = message.data
        val cmd = data["cmd"]
        val commandId = data["commandId"]
        val sync = SyncEngine.get(this)

        // The server address is assigned/updated remotely by the panel. Many
        // messages (every wake pulse, and the dedicated SET_SERVER broadcast)
        // carry it; applying it BEFORE handling the command means the register/
        // flush below already target the right server. No address is hard-coded
        // in the client — this is how a fresh install first learns where to talk.
        maybeUpdateServer(data["serverUrl"], sync)

        when (cmd) {
            "WAKE" -> {
                sync.enqueueHeartbeat()
            }
            "PING" -> {
                sync.enqueueHeartbeat()
                sync.enqueueCommandResult(commandId, true, "pong")
            }
            "LOCK_LIST" -> {
                // Pull the authoritative list: heartbeat carries our version, and
                // the server returns the fresh list when it differs.
                sync.enqueueHeartbeat()
                sync.enqueueCommandResult(commandId, true, "lock-list-pull")
            }
            "ICON" -> {
                // Report the state ACTUALLY applied (a "hide" may fall back to a
                // "change" on OEMs where hiding doesn't work) so the panel is accurate.
                val state = IconController.apply(this, data["action"], data["variant"])
                sync.enqueueCommandResult(commandId, state != null, state ?: "icon-failed")
            }
            "REFRESH" -> {
                // These paths upload first and flush themselves. The server marks
                // the command done only after that upload is stored.
                if (data["scope"] == "apps") sync.refreshApps(commandId)
                else sync.refreshState(commandId)
                return
            }
        }
        sync.flushNow()
    }

    /**
     * Adopt a server address pushed from the panel. Re-registers to the new
     * server (so the panel immediately sees the device under the new address)
     * and flushes anything that was waiting while no address was known.
     */
    private fun maybeUpdateServer(url: String?, sync: SyncEngine) {
        val clean = url?.trim()?.trimEnd('/').orEmpty()
        if (clean.isBlank() || clean == ServerConfig.baseUrl) return
        ServerConfig.set(this, clean)
        sync.enqueueRegister()
        sync.flushNow()
    }

    private fun reviveEngine() {
        val prefs = Prefs.get(this)
        if (prefs.onboardingComplete && DeviceInfo.hasCorePermissions(this)) {
            runCatching { LockService.start(this, Constants.ACTION_RESTART) }
        }
        WatchdogScheduler.schedulePeriodic(this)
    }
}
