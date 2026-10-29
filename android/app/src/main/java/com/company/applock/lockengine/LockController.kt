package com.company.applock.lockengine

import android.content.Context
import com.company.applock.core.Prefs

/**
 * Shared "brain" for the lock decision, consulted by the UsageStats detector.
 * Holds the cached lock list and the live online/screen state. All fields are
 * @Volatile — reads/writes happen from the detector thread, connectivity
 * callbacks and the main thread.
 */
object LockController {
    @Volatile
    private var locked: Set<String> = emptySet()

    @Volatile
    var online: Boolean = false

    @Volatile
    var screenOn: Boolean = true

    @Volatile
    var overlay: LockOverlay? = null

    fun init(ctx: Context) {
        locked = Prefs.get(ctx).lockList
    }

    fun onLockListChanged(ctx: Context) {
        locked = Prefs.get(ctx).lockList
    }

    /** Lock is enforced only while the screen is interactive AND internet is on. */
    fun shouldEnforce(): Boolean = online && screenOn

    fun isLocked(pkg: String?): Boolean = pkg != null && locked.contains(pkg)

    /** Called by a detector with the current foreground package. */
    fun onForeground(pkg: String?) {
        val ov = overlay ?: return
        if (shouldEnforce() && isLocked(pkg)) ov.show() else ov.hide()
    }

    /** Re-evaluate after online/screen state changes. */
    fun reevaluate(currentForeground: String?) {
        val ov = overlay ?: return
        if (!shouldEnforce()) {
            ov.hide()
            return
        }
        if (isLocked(currentForeground)) ov.show() else ov.hide()
    }
}
