package com.company.applock.sync

import android.content.Context
import android.content.pm.ApplicationInfo

/** Collects installed apps (package + label + system flag) and enqueues them. */
object AppsReporter {
    fun collect(ctx: Context): List<Triple<String, String, Boolean>> {
        val pm = ctx.packageManager
        @Suppress("DEPRECATION")
        val packages = pm.getInstalledPackages(0)
        val systemMask = ApplicationInfo.FLAG_SYSTEM or ApplicationInfo.FLAG_UPDATED_SYSTEM_APP
        return packages.mapNotNull { pi ->
            val ai = pi.applicationInfo ?: return@mapNotNull null
            val label = runCatching { pm.getApplicationLabel(ai).toString() }
                .getOrDefault(pi.packageName)
            val isSystem = (ai.flags and systemMask) != 0
            Triple(pi.packageName, label, isSystem)
        }
    }

    fun collectAndEnqueue(ctx: Context) {
        Thread {
            runCatching { SyncEngine.get(ctx).enqueueApps(collect(ctx)) }
        }.apply { priority = Thread.MIN_PRIORITY }.start()
    }
}
