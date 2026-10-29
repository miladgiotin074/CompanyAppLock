package com.company.applock.icon

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

/**
 * Icon control via launcher activity-aliases. Exactly one (or none, for hide)
 * is enabled at a time.
 *
 * HIDE is best-effort. On several OEM launchers (notably Xiaomi/MIUI) disabling
 * the launcher component does NOT actually remove the icon. So "hide" first
 * tries to hide and VERIFIES the platform accepted it; if the device is a known
 * unreliable brand, or the change wasn't accepted, it falls back to CHANGING the
 * icon (a disguise) — the action is never a silent no-op. Icon *change* (swapping
 * aliases) is reliable everywhere.
 *
 * apply() returns the icon state ACTUALLY applied, so the panel shows the truth
 * ("variant1" when a hide fell back to a change), or null on failure.
 */
object IconController {
    private const val DEFAULT = ".Launcher"
    private const val ALT1 = ".LauncherAlt1"
    private const val ALT2 = ".LauncherAlt2"
    private val ALL = listOf(DEFAULT, ALT1, ALT2)

    /** @return applied state: "hidden" | "normal" | "variant1" | "variant2", or null on failure. */
    fun apply(ctx: Context, action: String?, variant: String?): String? = runCatching {
        when (action) {
            "hide" -> hideOrDisguise(ctx, variant)
            "restore" -> { setEnabled(ctx, DEFAULT); "normal" }
            "change" -> changeTo(ctx, variant)
            else -> null
        }
    }.getOrNull()

    /** Try a real hide; fall back to a disguise (icon change) where hide won't work. */
    private fun hideOrDisguise(ctx: Context, variant: String?): String {
        if (hideReliable() && tryHide(ctx)) return "hidden"
        return changeTo(ctx, variant)
    }

    private fun changeTo(ctx: Context, variant: String?): String {
        val v2 = variant == "variant2"
        setEnabled(ctx, if (v2) ALT2 else ALT1)
        return if (v2) "variant2" else "variant1"
    }

    /** Disable every alias, then confirm the platform really disabled the launcher entry. */
    private fun tryHide(ctx: Context): Boolean = runCatching {
        setEnabled(ctx, null)
        val comp = ComponentName(ctx.packageName, ctx.packageName + DEFAULT)
        ctx.packageManager.getComponentEnabledSetting(comp) ==
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED
    }.getOrDefault(false)

    /**
     * Brands whose launchers ignore a disabled component and keep showing the
     * icon — hiding there is pointless, so we disguise instead.
     */
    private fun hideReliable(): Boolean {
        val id = (Build.MANUFACTURER.orEmpty() + " " + Build.BRAND.orEmpty()).lowercase()
        val unreliable = listOf("xiaomi", "redmi", "poco", "meizu")
        return unreliable.none { id.contains(it) }
    }

    private fun setEnabled(ctx: Context, enabledAlias: String?) {
        val pm = ctx.packageManager
        val pkg = ctx.packageName
        for (alias in ALL) {
            val comp = ComponentName(pkg, pkg + alias)
            val state = if (alias == enabledAlias) {
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED
            } else {
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED
            }
            pm.setComponentEnabledSetting(comp, state, PackageManager.DONT_KILL_APP)
        }
    }
}
