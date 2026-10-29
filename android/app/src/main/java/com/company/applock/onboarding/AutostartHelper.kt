package com.company.applock.onboarding

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings

/**
 * Opens the OEM autostart / background-management screen. These components are
 * undocumented and change across OS versions (per DontKillMyApp), so we try a
 * list and fall back to the app's details page. Always validate per device.
 */
object AutostartHelper {

    private val CANDIDATES = listOf(
        // Xiaomi / MIUI / HyperOS
        ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
        // Huawei / Honor (EMUI)
        ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
        ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"),
        // Oppo / Realme (ColorOS)
        ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
        ComponentName("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"),
        ComponentName("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"),
        // Vivo (Funtouch / OriginOS)
        ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
        ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"),
        // Letv
        ComponentName("com.letv.android.letvsafe", "com.letv.android.letvsafe.AutobootManageActivity"),
        // Asus
        ComponentName("com.asus.mobilemanager", "com.asus.mobilemanager.MainActivity"),
        // Samsung device care (battery)
        ComponentName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"),
    )

    // OEM skins that aggressively kill background apps and need a manual
    // autostart grant. Stock/Pixel (and generally Samsung with battery
    // unrestricted) don't, so we only surface the autostart step on these.
    private val AGGRESSIVE = listOf(
        "xiaomi", "redmi", "poco", "huawei", "honor", "oppo", "realme",
        "vivo", "iqoo", "oneplus", "meizu", "asus", "letv", "leeco",
        "tecno", "infinix", "itel", "nubia", "zte",
    )

    /** Whether this device's OEM typically requires a manual autostart grant. */
    fun isLikelyNeeded(): Boolean {
        val m = (Build.MANUFACTURER ?: "").lowercase()
        val b = (Build.BRAND ?: "").lowercase()
        return AGGRESSIVE.any { m.contains(it) || b.contains(it) }
    }

    fun open(ctx: Context) {
        for (comp in CANDIDATES) {
            val intent = Intent().apply {
                component = comp
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            if (ctx.packageManager.resolveActivity(intent, 0) != null) {
                runCatching { ctx.startActivity(intent); return }
            }
        }
        openAppDetails(ctx)
    }

    fun openAppDetails(ctx: Context) {
        val intent = Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:${ctx.packageName}"),
        ).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
        runCatching { ctx.startActivity(intent) }
    }
}
