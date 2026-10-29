package com.company.applock.lockengine

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Handler
import android.os.HandlerThread

/**
 * Primary foreground-app detector using UsageStatsManager. It polls queryEvents
 * on a dedicated background thread ONLY while the screen is interactive and the
 * device is online (gated by the caller), which is the biggest battery saver —
 * there is no OEM-safe push callback for the foreground app, so a light poll is
 * the pragmatic approach.
 */
class ForegroundAppDetector(
    private val ctx: Context,
    private val onForeground: (String?) -> Unit,
) {
    private val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    private var thread: HandlerThread? = null
    private var handler: Handler? = null

    @Volatile
    private var running = false

    @Volatile
    var lastForeground: String? = null
        private set

    private val tick = object : Runnable {
        override fun run() {
            if (!running) return
            val pkg = currentForeground()
            if (pkg != null) lastForeground = pkg
            onForeground(lastForeground)
            handler?.postDelayed(this, INTERVAL_MS)
        }
    }

    fun start() {
        if (running) return
        running = true
        val t = HandlerThread("fg-detector").also { it.start() }
        thread = t
        handler = Handler(t.looper).also { it.post(tick) }
    }

    fun stop() {
        running = false
        handler?.removeCallbacks(tick)
        thread?.quitSafely()
        thread = null
        handler = null
    }

    /** Scan the last few seconds of events and return the most recent foreground package. */
    private fun currentForeground(): String? {
        val end = System.currentTimeMillis()
        val begin = end - LOOKBACK_MS
        return try {
            val events = usm.queryEvents(begin, end)
            val e = UsageEvents.Event()
            var pkg: String? = null
            while (events.hasNextEvent()) {
                events.getNextEvent(e)
                if (e.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                    pkg = e.packageName
                }
            }
            pkg
        } catch (_: Exception) {
            null
        }
    }

    companion object {
        private const val INTERVAL_MS = 800L
        private const val LOOKBACK_MS = 10_000L
    }
}
