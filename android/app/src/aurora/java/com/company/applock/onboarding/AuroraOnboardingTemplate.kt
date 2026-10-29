package com.company.applock.onboarding

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.company.applock.R

/**
 * "Aurora" — the elegant default onboarding template.
 *
 * Pure framework views (no Material/AppCompat), styled with GradientDrawable so it
 * adds negligible size: a soft page under a rounded indigo gradient hero with an
 * app badge and live progress dots, rounded permission cards whose number badge
 * flips to a green check as each is granted, and a gradient finish button that
 * lights up once the core permissions are in. RTL by construction (Persian).
 *
 * Only presentation lives here — all logic comes through [OnboardingHost].
 */
class AuroraOnboardingTemplate : OnboardingTemplate {

    private lateinit var activity: Activity
    private lateinit var host: OnboardingHost

    private val rowUpdaters = mutableListOf<() -> Unit>()
    private val progressDots = mutableListOf<View>()
    private lateinit var finishButton: TextView
    private lateinit var progressLabel: TextView

    // ------------------------------ palette --------------------------------
    private val pageBg = 0xFFF4F5FB.toInt()
    private val headerTop = 0xFF6D5DF6.toInt()
    private val headerBottom = 0xFF4F46E5.toInt()
    private val cardBg = Color.WHITE
    private val cardStroke = 0xFFEAEBF3.toInt()
    private val ink = 0xFF14152B.toInt()
    private val muted = 0xFF6B7280.toInt()
    private val brand = 0xFF4F46E5.toInt()
    private val brandSoft = 0xFFEDEBFE.toInt()
    private val success = 0xFF15A34A.toInt()
    private val successBg = 0xFFDCFCE7.toInt()
    private val onHeader = Color.WHITE
    private val onHeaderDim = 0xCCFFFFFF.toInt()
    private val dotOff = 0x40FFFFFF

    override fun createView(activity: Activity, host: OnboardingHost): View {
        this.activity = activity
        this.host = host
        tintStatusBar()

        val scroll = ScrollView(activity).apply {
            setBackgroundColor(pageBg)
            isFillViewport = true
            isVerticalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
        }
        val root = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }

        root.addView(buildHeader())

        val body = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(18), dp(16), dp(26))
        }
        host.steps.forEachIndexed { index, step ->
            body.addView(buildStepCard(index, step), cardParams())
        }
        body.addView(buildFinishButton(), finishParams())
        root.addView(body)

        scroll.addView(root)
        refresh()
        return scroll
    }

    override fun refresh() {
        rowUpdaters.forEach { it() }
        val total = host.steps.count { it.verifiable }
        val granted = host.steps.count { it.verifiable && it.isGranted }
        progressDots.forEachIndexed { i, dot ->
            (dot.background as GradientDrawable).setColor(if (i < granted) onHeader else dotOff)
        }
        progressLabel.text = "${faDigits(granted.toString())} ${activity.getString(R.string.onb_progress_ready)} / ${faDigits(total.toString())}"
        val ready = host.isReady
        finishButton.isEnabled = ready
        finishButton.alpha = if (ready) 1f else 0.5f
    }

    // ------------------------------- header --------------------------------

    private fun buildHeader(): View {
        val header = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            background = gradientBottomRounded(headerTop, headerBottom, dp(30).toFloat())
            setPadding(dp(22), dp(30), dp(22), dp(24))
            elevation = dp(8).toFloat()
        }

        // App badge: a soft rounded square with the first letter of the app name.
        val badge = TextView(activity).apply {
            text = host.appName.trim().take(1).ifBlank { "●" }
            gravity = Gravity.CENTER
            textSize = 22f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(onHeader)
            background = solid(0x33FFFFFF, dp(16).toFloat())
        }
        header.addView(badge, LinearLayout.LayoutParams(dp(52), dp(52)))

        header.addView(
            text(activity.getString(R.string.onb_welcome), 12.5f, onHeaderDim).apply {
                letterSpacing = 0.04f
                setPadding(0, dp(16), 0, 0)
            },
        )
        header.addView(
            text(host.headline, 24f, onHeader, bold = true).apply { setPadding(0, dp(5), 0, 0) },
        )
        header.addView(
            text(host.subtitle, 14f, onHeaderDim).apply {
                setPadding(0, dp(8), 0, 0)
                setLineSpacing(dp(3).toFloat(), 1f)
            },
        )

        val footer = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(18), 0, 0)
        }
        val dots = LinearLayout(activity).apply { orientation = LinearLayout.HORIZONTAL }
        val verifiable = host.steps.count { it.verifiable }
        repeat(verifiable) { i ->
            val dot = View(activity).apply {
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(dotOff)
                }
            }
            val lp = LinearLayout.LayoutParams(dp(9), dp(9))
            if (i > 0) lp.marginStart = dp(7)
            dots.addView(dot, lp)
            progressDots.add(dot)
        }
        footer.addView(dots, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        progressLabel = text("", 12.5f, onHeaderDim, bold = true)
        footer.addView(progressLabel)
        header.addView(footer)

        return header
    }

    // ------------------------------ step card ------------------------------

    private fun buildStepCard(index: Int, step: OnboardingStep): View {
        val card = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = solid(cardBg, dp(20).toFloat(), dp(1), cardStroke)
            setPadding(dp(14), dp(15), dp(14), dp(15))
            elevation = dp(2).toFloat()
        }

        val badge = TextView(activity).apply {
            gravity = Gravity.CENTER
            textSize = 15f
            setTypeface(typeface, Typeface.BOLD)
        }
        card.addView(badge, LinearLayout.LayoutParams(dp(40), dp(40)))

        val textCol = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
        textCol.addView(text(step.title, 15.5f, ink, bold = true))
        if (step.description.isNotBlank()) {
            textCol.addView(
                text(step.description, 12.5f, muted).apply { setPadding(0, dp(3), 0, 0) },
            )
        }
        card.addView(
            textCol,
            LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply {
                marginStart = dp(13)
                marginEnd = dp(10)
            },
        )

        val action = TextView(activity).apply {
            gravity = Gravity.CENTER
            textSize = 13f
            setTypeface(typeface, Typeface.BOLD)
            setPadding(dp(16), dp(9), dp(16), dp(9))
            setOnClickListener { step.grant() }
        }
        card.addView(action, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT))

        val number = faDigits((index + 1).toString())
        rowUpdaters.add {
            if (step.isGranted) {
                badge.text = "✓"
                badge.setTextColor(success)
                badge.background = solid(successBg, dp(20).toFloat())
                action.text = activity.getString(R.string.onb_granted)
                action.setTextColor(success)
                action.background = solid(successBg, dp(20).toFloat())
                action.isClickable = false
            } else {
                badge.text = number
                badge.setTextColor(brand)
                badge.background = solid(brandSoft, dp(20).toFloat())
                action.isClickable = true
                if (step.verifiable) {
                    action.text = activity.getString(R.string.onb_grant)
                    action.setTextColor(Color.WHITE)
                    action.background = solid(brand, dp(20).toFloat())
                } else {
                    // No readable state (e.g. autostart): offer the action, no status.
                    action.text = activity.getString(R.string.onb_open)
                    action.setTextColor(brand)
                    action.background = solid(cardBg, dp(20).toFloat(), dp(1), brand)
                }
            }
        }
        return card
    }

    // ---------------------------- finish button ----------------------------

    private fun buildFinishButton(): View {
        finishButton = TextView(activity).apply {
            text = host.finishLabel
            gravity = Gravity.CENTER
            textSize = 16f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
            background = gradient(headerTop, headerBottom, dp(28).toFloat())
            elevation = dp(6).toFloat()
            setOnClickListener { if (isEnabled) host.complete() }
        }
        return finishButton
    }

    // ------------------------------- helpers -------------------------------

    private fun tintStatusBar() {
        runCatching {
            val w = activity.window
            w.statusBarColor = headerTop
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                // Dark header → light status-bar icons (clear the light-bar flag).
                val decor = w.decorView
                @Suppress("DEPRECATION")
                decor.systemUiVisibility =
                    decor.systemUiVisibility and View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv()
            }
        }
    }

    private fun cardParams() = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply {
        bottomMargin = dp(12)
    }

    private fun finishParams() = LinearLayout.LayoutParams(MATCH_PARENT, dp(56)).apply {
        topMargin = dp(10)
    }

    private fun text(value: String, sizeSp: Float, color: Int, bold: Boolean = false): TextView =
        TextView(activity).apply {
            text = value
            textSize = sizeSp
            setTextColor(color)
            if (bold) setTypeface(typeface, Typeface.BOLD)
        }

    private fun solid(color: Int, radius: Float, strokeW: Int = 0, strokeColor: Int = 0) =
        GradientDrawable().apply {
            setColor(color)
            cornerRadius = radius
            if (strokeW > 0) setStroke(strokeW, strokeColor)
        }

    private fun gradient(top: Int, bottom: Int, radius: Float) =
        GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(top, bottom)).apply {
            cornerRadius = radius
        }

    private fun gradientBottomRounded(top: Int, bottom: Int, radius: Float) =
        GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(top, bottom)).apply {
            cornerRadii = floatArrayOf(0f, 0f, 0f, 0f, radius, radius, radius, radius)
        }

    private fun dp(v: Int): Int = (v * activity.resources.displayMetrics.density).toInt()

    private val faMap = charArrayOf('۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹')
    private fun faDigits(s: String): String =
        buildString { for (c in s) append(if (c in '0'..'9') faMap[c - '0'] else c) }
}
