package com.company.applock.lockengine

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.company.applock.R

/**
 * The lock screen drawn over a locked app. Programmatic views only (no layout
 * XML, no Material) → instant inflate, tiny footprint. One instance; add/remove
 * is idempotent and always runs on the main thread.
 */
class LockOverlay(private val ctx: Context) {

    private val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val main = Handler(Looper.getMainLooper())
    private var view: View? = null

    private val layoutType =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

    private fun params(): WindowManager.LayoutParams = WindowManager.LayoutParams(
        WindowManager.LayoutParams.MATCH_PARENT,
        WindowManager.LayoutParams.MATCH_PARENT,
        layoutType,
        // Focusable + touchable so it fully blocks the app behind and can catch BACK.
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
        PixelFormat.OPAQUE,
    ).apply { gravity = Gravity.CENTER }

    fun show() {
        main.post {
            if (view != null) return@post
            view = buildView()
            runCatching { wm.addView(view, params()) }
                .onFailure { view = null }
        }
    }

    fun hide() {
        main.post {
            val v = view ?: return@post
            runCatching { wm.removeView(v) }
            view = null
        }
    }

    private fun buildView(): View {
        val root = object : FrameLayout(ctx) {
            override fun dispatchKeyEvent(event: KeyEvent): Boolean {
                // Swallow BACK; let the user leave only via the Home button.
                if (event.keyCode == KeyEvent.KEYCODE_BACK) return true
                return super.dispatchKeyEvent(event)
            }
        }
        root.setBackgroundColor(ctx.getColor(R.color.lock_scrim))
        root.isClickable = true // consume touches
        root.isFocusableInTouchMode = true

        val col = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(32), dp(32), dp(32), dp(32))
        }

        val title = TextView(ctx).apply {
            text = ctx.getString(R.string.lock_title)
            setTextColor(Color.WHITE)
            textSize = 22f
            gravity = Gravity.CENTER
        }
        val subtitle = TextView(ctx).apply {
            text = ctx.getString(R.string.lock_subtitle)
            setTextColor(ctx.getColor(R.color.text_muted))
            textSize = 15f
            gravity = Gravity.CENTER
            setPadding(0, dp(12), 0, dp(28))
        }
        val home = Button(ctx).apply {
            text = "بازگشت به صفحه اصلی"
            setOnClickListener { goHome() }
        }

        col.addView(title)
        col.addView(subtitle)
        col.addView(home)
        root.addView(
            col,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ).apply { gravity = Gravity.CENTER },
        )
        return root
    }

    private fun goHome() {
        val i = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        runCatching { ctx.startActivity(i) }
        hide()
    }

    private fun dp(v: Int): Int = (v * ctx.resources.displayMetrics.density).toInt()
}
