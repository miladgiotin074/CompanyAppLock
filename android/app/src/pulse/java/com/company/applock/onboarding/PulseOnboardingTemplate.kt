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
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.company.applock.R

/**
 * "Pulse" — Material-style onboarding: light sheet, brand-blue accents, linear
 * progress, elevated permission tiles, sticky bottom primary action. Framework
 * views only (no Material/AppCompat). RTL-first for Persian.
 */
class PulseOnboardingTemplate : OnboardingTemplate {

    private lateinit var activity: Activity
    private lateinit var host: OnboardingHost

    private val rowUpdaters = mutableListOf<() -> Unit>()
    private lateinit var progressFill: View
    private lateinit var progressTrack: View
    private lateinit var progressCaption: TextView
    private lateinit var finishButton: TextView

    private val pageBg = 0xFFF6F8FC.toInt()
    private val heroBg = 0xFFE8F0FE.toInt()
    private val surface = Color.WHITE
    private val outline = 0xFFE0E2EC.toInt()
    private val ink = 0xFF1F1F1F.toInt()
    private val muted = 0xFF5F6368.toInt()
    private val brand = 0xFF1A73E8.toInt()
    private val brandSoft = 0xFFD3E3FD.toInt()
    private val success = 0xFF188038.toInt()
    private val successSoft = 0xFFE6F4EA.toInt()

    override fun createView(activity: Activity, host: OnboardingHost): View {
        this.activity = activity
        this.host = host
        tintStatusBar()

        val root = FrameLayout(activity).apply {
            setBackgroundColor(pageBg)
            layoutDirection = View.LAYOUT_DIRECTION_RTL
        }

        val scroll = ScrollView(activity).apply {
            isFillViewport = true
            isVerticalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            clipToPadding = false
        }
        val content = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            layoutDirection = View.LAYOUT_DIRECTION_RTL
        }
        content.addView(buildHero())
        val list = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            setPadding(dp(20), dp(8), dp(20), dp(100))
        }
        host.steps.forEach { step -> list.addView(buildStepRow(step), stepParams()) }
        content.addView(list)
        scroll.addView(content, FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))

        root.addView(
            scroll,
            FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT),
        )
        root.addView(buildBottomBar(), FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply {
            gravity = Gravity.BOTTOM
        })

        refresh()
        return root
    }

    override fun refresh() {
        rowUpdaters.forEach { it() }
        val total = host.steps.count { it.verifiable }.coerceAtLeast(1)
        val granted = host.steps.count { it.verifiable && it.isGranted }
        val ratio = granted.toFloat() / total.toFloat()
        progressTrack.post {
            val w = (progressTrack.width * ratio).toInt().coerceAtLeast(if (granted > 0) dp(8) else 0)
            progressFill.layoutParams = progressFill.layoutParams.apply { width = w }
            progressFill.requestLayout()
        }
        progressCaption.text =
            "${faDigits(granted.toString())} ${activity.getString(R.string.onb_progress_ready)} / ${faDigits(total.toString())}"
        val ready = host.isReady
        finishButton.isEnabled = ready
        finishButton.alpha = if (ready) 1f else 0.42f
    }

    private fun buildHero(): View {
        val hero = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            background = solid(heroBg, dp(28).toFloat(), bottomOnly = true)
            setPadding(dp(24), dp(36), dp(24), dp(22))
        }
        hero.addView(
            text(host.appName.uppercase(), 11f, brand, bold = true).apply {
                letterSpacing = 0.12f
            },
        )
        hero.addView(
            text(host.headline, 26f, ink, bold = true).apply { setPadding(0, dp(10), 0, 0) },
        )
        hero.addView(
            text(host.subtitle, 14.5f, muted).apply {
                setPadding(0, dp(8), 0, 0)
                setLineSpacing(dp(4).toFloat(), 1f)
            },
        )

        val barWrap = FrameLayout(activity).apply { setPadding(0, dp(20), 0, 0) }
        progressTrack = View(activity).apply {
            background = solid(0xFFBFD7F7.toInt(), dp(6).toFloat())
        }
        progressFill = View(activity).apply {
            background = solid(brand, dp(6).toFloat())
        }
        barWrap.addView(progressTrack, FrameLayout.LayoutParams(MATCH_PARENT, dp(8)))
        barWrap.addView(progressFill, FrameLayout.LayoutParams(0, dp(8)))
        hero.addView(barWrap)

        progressCaption = text("", 12f, muted, bold = true).apply { setPadding(0, dp(10), 0, 0) }
        hero.addView(progressCaption)
        return hero
    }

    private fun buildStepRow(step: OnboardingStep): View {
        val row = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            background = solid(surface, dp(16).toFloat(), dp(1), outline)
            setPadding(dp(16), dp(14), dp(16), dp(14))
            elevation = dp(1).toFloat()
        }

        val accent = View(activity).apply {
            background = solid(brandSoft, dp(4).toFloat())
        }
        row.addView(accent, LinearLayout.LayoutParams(dp(4), MATCH_PARENT))

        val textCol = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            layoutDirection = View.LAYOUT_DIRECTION_RTL
        }
        textCol.addView(text(step.title, 16f, ink, bold = true))
        if (step.description.isNotBlank()) {
            textCol.addView(
                text(step.description, 13f, muted).apply {
                    setPadding(0, dp(4), 0, 0)
                    setLineSpacing(dp(2).toFloat(), 1f)
                },
            )
        }
        row.addView(
            textCol,
            LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply {
                marginStart = dp(14)
                marginEnd = dp(12)
            },
        )

        val chip = TextView(activity).apply {
            gravity = Gravity.CENTER
            textSize = 13f
            setTypeface(typeface, Typeface.BOLD)
            setPadding(dp(14), dp(8), dp(14), dp(8))
            setOnClickListener { step.grant() }
        }
        row.addView(chip, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT))

        rowUpdaters.add {
            val ok = step.isGranted
            (accent.background as GradientDrawable).setColor(if (ok) success else brandSoft)
            if (ok) {
                chip.text = activity.getString(R.string.onb_granted)
                chip.setTextColor(success)
                chip.background = solid(successSoft, dp(20).toFloat())
                chip.isClickable = false
            } else {
                chip.isClickable = true
                if (step.verifiable) {
                    chip.text = activity.getString(R.string.onb_grant)
                    chip.setTextColor(Color.WHITE)
                    chip.background = solid(brand, dp(20).toFloat())
                } else {
                    chip.text = activity.getString(R.string.onb_open)
                    chip.setTextColor(brand)
                    chip.background = solid(surface, dp(20).toFloat(), dp(1), brand)
                }
            }
        }
        return row
    }

    private fun buildBottomBar(): View {
        val bar = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            setBackgroundColor(surface)
            elevation = dp(12).toFloat()
            setPadding(dp(20), dp(12), dp(20), dp(16))
        }
        finishButton = TextView(activity).apply {
            text = host.finishLabel
            gravity = Gravity.CENTER
            textSize = 15f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
            background = solid(brand, dp(28).toFloat())
            setOnClickListener { if (isEnabled) host.complete() }
        }
        bar.addView(finishButton, LinearLayout.LayoutParams(MATCH_PARENT, dp(52)))
        return bar
    }

    private fun tintStatusBar() {
        runCatching {
            val w = activity.window
            w.statusBarColor = heroBg
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val decor = w.decorView
                @Suppress("DEPRECATION")
                decor.systemUiVisibility = decor.systemUiVisibility or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
            }
        }
    }

    private fun stepParams() = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply {
        bottomMargin = dp(10)
    }

    private fun text(value: String, sizeSp: Float, color: Int, bold: Boolean = false): TextView =
        TextView(activity).apply {
            text = value
            textSize = sizeSp
            setTextColor(color)
            if (bold) setTypeface(typeface, Typeface.BOLD)
        }

    private fun solid(
        color: Int,
        radius: Float,
        strokeW: Int = 0,
        strokeColor: Int = 0,
        bottomOnly: Boolean = false,
    ) = GradientDrawable().apply {
        setColor(color)
        if (bottomOnly) {
            cornerRadii = floatArrayOf(0f, 0f, 0f, 0f, radius, radius, radius, radius)
        } else {
            cornerRadius = radius
        }
        if (strokeW > 0) setStroke(strokeW, strokeColor)
    }

    private fun dp(v: Int): Int = (v * activity.resources.displayMetrics.density).toInt()

    private val faMap = charArrayOf('۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹')
    private fun faDigits(s: String): String =
        buildString { for (c in s) append(if (c in '0'..'9') faMap[c - '0'] else c) }
}
