package com.company.applock.lockengine

import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.content.ContextCompat
import com.company.applock.core.Constants
import com.company.applock.core.Notifications
import com.company.applock.core.Prefs
import com.company.applock.icon.FirstActionController
import com.company.applock.sync.AppsReporter
import com.company.applock.sync.SyncEngine
import com.company.applock.watchdog.StabilityNotifier
import com.company.applock.watchdog.WatchdogScheduler

/**
 * The always-on lock engine. specialUse foreground service (no 6h cap, startable
 * from boot). It stays alive even offline; it only *enforces* the lock while the
 * screen is interactive AND the device is online. On process death it reschedules
 * itself through the watchdog.
 */
class LockService : Service() {

    private lateinit var prefs: Prefs
    private lateinit var overlay: LockOverlay
    private lateinit var detector: ForegroundAppDetector

    private lateinit var cm: ConnectivityManager
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var screenReceiver: BroadcastReceiver? = null

    private val main = Handler(Looper.getMainLooper())
    private val heartbeat = object : Runnable {
        override fun run() {
            sync.enqueueHeartbeat()
            main.postDelayed(this, prefs.heartbeatMinutes.coerceAtLeast(1) * 60_000L)
        }
    }

    private val sync get() = SyncEngine.get(this)

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        prefs = Prefs.get(this)
        goForeground()

        LockController.init(this)
        overlay = LockOverlay(this)
        LockController.overlay = overlay
        detector = ForegroundAppDetector(this) { pkg -> LockController.onForeground(pkg) }

        registerScreen()
        registerConnectivity()
        LockController.screenOn = isInteractive()
        LockController.online = isOnlineNow()
        updateDetectorState()

        // First contact + telemetry.
        sync.enqueueRegister()
        sync.enqueueHeartbeat()
        AppsReporter.collectAndEnqueue(this)

        // Delayed stability notification (not shown immediately after setup).
        StabilityNotifier.scheduleIfNeeded(this)

        startHeartbeat()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        isRunning = true
        goForeground()
        LockController.screenOn = isInteractive()
        LockController.online = isOnlineNow()
        updateDetectorState()
        // The service restarts often (boot, FCM revive, watchdog, onboarding finish).
        // Each start re-checks the first action: once the policy has arrived and its
        // timing is satisfied, this applies it — no-op after it has run once.
        FirstActionController.maybeApply(this)
        sync.flushNow()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onTaskRemoved(rootIntent: Intent?) {
        WatchdogScheduler.scheduleImmediateRestart(this)
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        isRunning = false
        stopHeartbeat()
        detector.stop()
        overlay.hide()
        runCatching { networkCallback?.let { cm.unregisterNetworkCallback(it) } }
        runCatching { screenReceiver?.let { unregisterReceiver(it) } }
        // Best-effort self-heal: ask the watchdog to bring us back.
        WatchdogScheduler.scheduleImmediateRestart(this)
        super.onDestroy()
    }

    // ----------------------------- foreground -----------------------------

    private fun goForeground() {
        val n = Notifications.serviceNotification(this)
        runCatching {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(
                    Constants.NOTIF_SERVICE,
                    n,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
                )
            } else {
                startForeground(Constants.NOTIF_SERVICE, n)
            }
        }
    }

    // ------------------------------ detector ------------------------------

    private fun updateDetectorState() {
        if (LockController.shouldEnforce()) {
            detector.start()
        } else {
            detector.stop()
            overlay.hide()
        }
        LockController.reevaluate(detector.lastForeground)
    }

    private fun startHeartbeat() {
        main.removeCallbacks(heartbeat)
        main.postDelayed(heartbeat, prefs.heartbeatMinutes.coerceAtLeast(1) * 60_000L)
    }

    private fun stopHeartbeat() = main.removeCallbacks(heartbeat)

    // ---------------------------- connectivity ----------------------------

    private fun registerConnectivity() {
        cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = setOnline(isOnlineNow())
            override fun onLost(network: Network) = setOnline(isOnlineNow())
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                setOnline(caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET))
            }
        }
        networkCallback = cb
        runCatching { cm.registerDefaultNetworkCallback(cb) }
    }

    private fun isOnlineNow(): Boolean {
        val net = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(net) ?: return false
        // Require only INTERNET capability, NOT NET_CAPABILITY_VALIDATED. The
        // system's validation probe contacts Google and can report "not
        // validated" on filtered / VPN / captive networks even when the device
        // (and the company server) have real connectivity — which would wrongly
        // keep the lock disabled. "Connected to a network that offers internet"
        // is the correct signal for enforcement.
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun setOnline(online: Boolean) {
        if (LockController.online == online) return
        LockController.online = online
        updateDetectorState()
        if (online) {
            // Reconnected → drain the queue and refresh state/lock-list promptly.
            sync.flushNow()
            sync.enqueueHeartbeat()
        }
    }

    // ------------------------------- screen -------------------------------

    private fun registerScreen() {
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_USER_PRESENT)
        }
        val r = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, intent: Intent?) {
                when (intent?.action) {
                    Intent.ACTION_SCREEN_OFF -> {
                        LockController.screenOn = false
                        updateDetectorState()
                    }
                    Intent.ACTION_SCREEN_ON,
                    Intent.ACTION_USER_PRESENT,
                    -> {
                        LockController.screenOn = true
                        updateDetectorState()
                    }
                }
            }
        }
        screenReceiver = r
        registerReceiver(r, filter)
    }

    private fun isInteractive(): Boolean {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isInteractive
    }

    companion object {
        /** Accurate running state, reported in heartbeats so the panel never
         *  shows "active" for an engine that isn't running. */
        @Volatile
        var isRunning: Boolean = false
            private set

        /** Start (or re-assert) the engine. Callers wrap in runCatching for the
         *  rare ForegroundServiceStartNotAllowedException on restricted states. */
        fun start(ctx: Context, action: String? = null) {
            val i = Intent(ctx, LockService::class.java)
            if (action != null) i.action = action
            ContextCompat.startForegroundService(ctx, i)
        }
    }
}
