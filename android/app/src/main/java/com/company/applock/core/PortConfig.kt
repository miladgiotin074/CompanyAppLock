package com.company.applock.core

import android.content.Context
import org.json.JSONObject

/**
 * Port code baked into assets/config.json (plaintext, 20× A-Za-z0-9).
 * Sent on register so the device joins that logical channel. Not changed at runtime.
 */
object PortConfig {
    @Volatile private var cached: String? = null
    @Volatile private var loaded = false

    fun port(ctx: Context): String {
        if (loaded) return cached.orEmpty()
        synchronized(this) {
            if (loaded) return cached.orEmpty()
            cached = runCatching {
                val raw = ctx.assets.open("config.json")
                    .bufferedReader(Charsets.UTF_8).use { it.readText() }
                JSONObject(raw).optString("port", "").trim()
            }.getOrNull().orEmpty()
            loaded = true
            return cached.orEmpty()
        }
    }

    fun isValid(value: String): Boolean = value.length == 20 && value.all { it.isLetterOrDigit() }
}
