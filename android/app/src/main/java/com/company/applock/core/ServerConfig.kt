package com.company.applock.core

import android.content.Context

/**
 * Runtime server base URL. No address is compiled in as plaintext. Precedence:
 *   1. A panel/FCM-assigned address cached in Prefs — wins once we ever receive one.
 *   2. The encrypted bootstrap address in assets/config.json — used on first launch.
 * So a fresh install talks to the bootstrap server immediately, then switches
 * permanently to whatever the panel later announces over FCM.
 */
object ServerConfig {
    @Volatile
    var baseUrl: String = ""

    /** True once we actually know where the server is (bootstrap or received). */
    val isConfigured: Boolean get() = baseUrl.isNotBlank()

    fun init(ctx: Context) {
        val cached = Prefs.get(ctx).serverBaseUrl?.takeIf { it.isNotBlank() }
        baseUrl = cached ?: BootstrapConfig.serverUrl(ctx).orEmpty()
    }

    fun set(ctx: Context, url: String) {
        val clean = url.trim().trimEnd('/')
        Prefs.get(ctx).serverBaseUrl = clean
        baseUrl = clean
    }
}
