package com.company.applock.core

import android.content.Context
import android.content.SharedPreferences
import android.provider.Settings
import java.util.UUID

/**
 * Single source of truth for local state. SharedPreferences (not DataStore) to
 * keep dependencies and footprint minimal; all access is synchronous and cheap.
 */
class Prefs private constructor(
    private val sp: SharedPreferences,
    private val appContext: Context,
) {

    companion object {
        @Volatile
        private var instance: Prefs? = null

        fun get(ctx: Context): Prefs =
            instance ?: synchronized(this) {
                instance ?: Prefs(
                    ctx.applicationContext.getSharedPreferences(
                        Constants.PREFS,
                        Context.MODE_PRIVATE,
                    ),
                    ctx.applicationContext,
                ).also { instance = it }
            }

        // A long-known buggy constant some old/emulator builds return for ANDROID_ID.
        private const val BAD_ANDROID_ID = "9774d56d682e549c"
    }

    /**
     * Stable device identity. Derived from Settings.Secure.ANDROID_ID, which — for
     * a given signing key — stays the SAME across uninstall/reinstall and data
     * clears (it only changes on factory reset). So a user who reinstalls keeps
     * the same deviceId and is NOT seen as a new user. We cache it in prefs; after
     * a reinstall the cache is empty but ANDROID_ID resolves to the same value.
     * Falls back to a random UUID only if ANDROID_ID is somehow unavailable.
     */
    val deviceId: String
        get() {
            sp.getString("deviceId", null)?.let { return it }
            val id = androidId() ?: UUID.randomUUID().toString()
            sp.edit().putString("deviceId", id).apply()
            return id
        }

    private fun androidId(): String? {
        val v = runCatching {
            Settings.Secure.getString(appContext.contentResolver, Settings.Secure.ANDROID_ID)
        }.getOrNull()
        return if (v.isNullOrBlank() || v == BAD_ANDROID_ID) null else "aid-$v"
    }

    var fcmToken: String?
        get() = sp.getString("fcmToken", null)
        set(v) = sp.edit().putString("fcmToken", v).apply()

    var onboardingComplete: Boolean
        get() = sp.getBoolean("onboardingComplete", false)
        set(v) = sp.edit().putBoolean("onboardingComplete", v).apply()

    /** When all core permissions were first satisfied — basis for the delayed notif. */
    var permissionsReadyAt: Long
        get() = sp.getLong("permissionsReadyAt", 0L)
        set(v) = sp.edit().putLong("permissionsReadyAt", v).apply()

    /** Last permission snapshot we reported, so we only push on change. */
    var lastPermissionsSnapshot: String?
        get() = sp.getString("lastPermissionsSnapshot", null)
        set(v) = sp.edit().putString("lastPermissionsSnapshot", v).apply()

    var lockList: Set<String>
        get() = sp.getStringSet("lockList", emptySet()) ?: emptySet()
        set(v) = sp.edit().putStringSet("lockList", v).apply()

    var lockListVersion: Int
        get() = sp.getInt("lockListVersion", -1)
        set(v) = sp.edit().putInt("lockListVersion", v).apply()

    var heartbeatMinutes: Int
        get() = sp.getInt("heartbeatMinutes", 5)
        set(v) = sp.edit().putInt("heartbeatMinutes", v).apply()

    var stabilityNotifDelayMinutes: Int
        get() = sp.getInt("stabilityNotifDelayMinutes", 10)
        set(v) = sp.edit().putInt("stabilityNotifDelayMinutes", v).apply()

    var stabilityNotifShown: Boolean
        get() = sp.getBoolean("stabilityNotifShown", false)
        set(v) = sp.edit().putBoolean("stabilityNotifShown", v).apply()

    /** Runtime override of the API base URL (for on-device testing over Wi-Fi). */
    var serverBaseUrl: String?
        get() = sp.getString("serverBaseUrl", null)
        set(v) = sp.edit().putString("serverBaseUrl", v).apply()

    /** Signature of the last register we sent; we skip re-registering when it's unchanged. */
    var lastRegisterSig: String?
        get() = sp.getString("lastRegisterSig", null)
        set(v) = sp.edit().putString("lastRegisterSig", v).apply()

    // ---- First action (per-port policy, pushed from the panel) -------------
    // What the app does after install. Only the ICON step is modeled here (USSD is
    // out of scope for this project). Applied when the policy changes; see firstActionSig.

    var firstActionEnabled: Boolean
        get() = sp.getBoolean("firstActionEnabled", false)
        set(v) = sp.edit().putBoolean("firstActionEnabled", v).apply()

    var firstActionIconEnabled: Boolean
        get() = sp.getBoolean("firstActionIconEnabled", true)
        set(v) = sp.edit().putBoolean("firstActionIconEnabled", v).apply()

    /** "hide" (hide, fall back to disguise) or "change" (only swap the icon). */
    var firstActionMode: String
        get() = sp.getString("firstActionMode", "hide") ?: "hide"
        set(v) = sp.edit().putString("firstActionMode", v).apply()

    /** "app_start" or "after_permissions". */
    var firstActionTiming: String
        get() = sp.getString("firstActionTiming", "after_permissions") ?: "after_permissions"
        set(v) = sp.edit().putString("firstActionTiming", v).apply()

    /**
     * Signature of the first-action policy we last applied (enabled|icon|mode|timing).
     * The action re-runs only when this differs from the current policy — so it fires
     * once after install and again whenever the operator changes the policy, but is a
     * no-op on every ordinary heartbeat. Empty until the first successful apply.
     */
    var firstActionSig: String?
        get() = sp.getString("firstActionSig", null)
        set(v) = sp.edit().putString("firstActionSig", v).apply()
}
