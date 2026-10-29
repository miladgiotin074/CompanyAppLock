package com.company.applock.core

import android.Manifest
import android.app.ActivityManager
import android.app.AppOpsManager
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.os.PowerManager
import android.os.Process
import android.os.StatFs
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.company.applock.BuildConfig

/** Device metadata + all special-permission checks (each granted via a Settings screen). */
object DeviceInfo {
    val brand: String get() = Build.BRAND ?: ""
    val model: String get() = Build.MODEL ?: ""
    val androidVersion: String get() = Build.VERSION.RELEASE ?: ""
    val sdkInt: Int get() = Build.VERSION.SDK_INT
    val appVersion: String get() = BuildConfig.VERSION_NAME

    fun hasUsageAccess(ctx: Context): Boolean = try {
        val appOps = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                ctx.packageName,
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                ctx.packageName,
            )
        }
        mode == AppOpsManager.MODE_ALLOWED
    } catch (_: Exception) {
        false
    }

    fun hasOverlay(ctx: Context): Boolean = Settings.canDrawOverlays(ctx)

    fun hasBatteryExemption(ctx: Context): Boolean {
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(ctx.packageName)
    }

    fun hasNotifications(ctx: Context): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                ctx,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .areNotificationsEnabled()
        }

    /** The minimum needed to actually lock: detect the foreground app + draw over it. */
    fun hasCorePermissions(ctx: Context): Boolean =
        hasUsageAccess(ctx) && hasOverlay(ctx)

    /** Snapshot reported to the backend. */
    fun permissionsMap(ctx: Context): Map<String, Boolean> = mapOf(
        "usage" to hasUsageAccess(ctx),
        "overlay" to hasOverlay(ctx),
        "battery" to hasBatteryExemption(ctx),
        "notifications" to hasNotifications(ctx),
    )

    /** Full device info sent on register (shown in the panel's expandable card). */
    fun fullInfo(ctx: Context): Map<String, Any?> {
        val dm = ctx.resources.displayMetrics
        val mem = ActivityManager.MemoryInfo()
        runCatching {
            (ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(mem)
        }
        val dataStat = runCatching { StatFs(Environment.getDataDirectory().path) }.getOrNull()
        val mb = 1024L * 1024L
        return linkedMapOf(
            "manufacturer" to Build.MANUFACTURER,
            "brand" to Build.BRAND,
            "model" to Build.MODEL,
            "device" to Build.DEVICE,
            "product" to Build.PRODUCT,
            "board" to Build.BOARD,
            "hardware" to Build.HARDWARE,
            "fingerprint" to Build.FINGERPRINT,
            "display" to Build.DISPLAY,
            "androidVersion" to Build.VERSION.RELEASE,
            "sdkInt" to Build.VERSION.SDK_INT,
            "securityPatch" to Build.VERSION.SECURITY_PATCH,
            "supportedAbis" to Build.SUPPORTED_ABIS?.joinToString(","),
            "screen" to "${dm.widthPixels}x${dm.heightPixels} @${dm.densityDpi}dpi",
            "totalRamMb" to (mem.totalMem / mb),
            "availRamMb" to (mem.availMem / mb),
            "totalStorageMb" to (dataStat?.let { it.blockCountLong * it.blockSizeLong / mb }),
            "availStorageMb" to (dataStat?.let { it.availableBlocksLong * it.blockSizeLong / mb }),
            "appVersion" to appVersion,
        )
    }
}
