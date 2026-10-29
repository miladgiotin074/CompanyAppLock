package com.company.applock.onboarding

import android.app.Activity
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.SystemClock
import android.view.GestureDetector
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.company.applock.R
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/**
 * Velvet — multi-step sexy-live onboarding. Hero art comes from
 * `onb_slide_*` drawables (replace placeholders with generated PNG/WebP).
 * Permission logic stays on [OnboardingHost].
 */
class VelvetOnboardingTemplate : OnboardingTemplate {

    private sealed class Page {
        data class Intro(val key: String) : Page()
        data class Permission(val step: OnboardingStep) : Page()
        data object Finish : Page()
    }

    private lateinit var activity: Activity
    private lateinit var host: OnboardingHost
    private val pages = mutableListOf<Page>()
    private var pageIndex = 0
    private var renderGen = 0
    private var primaryAction: () -> Unit = {}
    private var secondaryAction: () -> Unit = {}

    private lateinit var hero: ImageView
    private lateinit var scrim: View
    private lateinit var livePill: TextView
    private lateinit var copyBlock: LinearLayout
    private lateinit var kicker: TextView
    private lateinit var titleView: TextView
    private lateinit var bodyView: TextView
    private lateinit var statusChip: TextView
    private lateinit var dots: LinearLayout
    private lateinit var progress: SoftBar
    private lateinit var primaryBtn: RoseBtn
    private lateinit var secondaryBtn: TextView
    private lateinit var backLink: TextView
    private lateinit var stepLabel: TextView
    private lateinit var vazirRegular: Typeface
    private lateinit var vazirMedium: Typeface
    private lateinit var vazirBold: Typeface

    override fun createView(activity: Activity, host: OnboardingHost): View {
        this.activity = activity
        this.host = host
        tintChrome()
        vazirRegular = activity.resources.getFont(R.font.vazirmatn_regular)
        vazirMedium = activity.resources.getFont(R.font.vazirmatn_medium)
        vazirBold = activity.resources.getFont(R.font.vazirmatn_bold)

        pages.clear()
        pages += Page.Intro("welcome")
        pages += Page.Intro("vibe")
        pages += Page.Intro("glow")
        pages += Page.Intro("privacy")
        host.steps.forEach { pages += Page.Permission(it) }
        pages += Page.Finish

        val root = SwipeFrame(activity) { dx -> onSwipe(dx) }.apply {
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            setBackgroundColor(0xFF12060C.toInt())
        }
        root.addView(PulseGlow(activity), FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))

        val column = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            layoutDirection = View.LAYOUT_DIRECTION_RTL
        }

        val heroHost = FrameLayout(activity)
        hero = ImageView(activity).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }
        heroHost.addView(hero, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        scrim = View(activity).apply {
            background = GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                intArrayOf(0x0012060C, 0x6612060C.toInt(), 0xF212060C.toInt()),
            )
        }
        heroHost.addView(scrim, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        heroHost.addView(buildTopChrome(), FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        column.addView(heroHost, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1.15f))
        column.addView(buildSheet())
        root.addView(column, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))

        render(animated = false)
        return root
    }

    override fun refresh() = render(animated = false)

    private fun showPage(index: Int) {
        val next = index.coerceIn(0, pages.lastIndex)
        val changed = next != pageIndex
        pageIndex = next
        render(animated = changed)
    }

    private fun render(animated: Boolean) {
        val apply = {
            val page = pages[pageIndex]
            hero.setImageResource(artRes(page))
            livePill.visibility = when (page) {
                is Page.Intro -> if (page.key == "welcome" || page.key == "vibe") View.VISIBLE else View.GONE
                Page.Finish -> View.VISIBLE
                else -> View.GONE
            }
            kicker.text = kickerFor(page)
            titleView.text = titleFor(page)
            bodyView.text = bodyFor(page)
            val perm = page as? Page.Permission
            val granted = perm != null && perm.step.verifiable && perm.step.isGranted
            statusChip.visibility = if (granted) View.VISIBLE else View.GONE
            if (perm?.step?.optional == true) {
                kicker.text = "${kicker.text}  ·  ${activity.getString(R.string.velvet_optional)}"
            }
            bindActions(page)
            progress.fraction = (pageIndex + 1f) / pages.size.toFloat()
            stepLabel.text = faDigits("${pageIndex + 1} / ${pages.size}")
            rebuildDots()
        }
        renderGen++
        val gen = renderGen
        copyBlock.animate().cancel()
        hero.animate().cancel()
        if (!animated) {
            apply()
            copyBlock.alpha = 1f
            hero.alpha = 1f
            return
        }
        copyBlock.animate().alpha(0f).setDuration(140).withEndAction {
            if (gen != renderGen) return@withEndAction
            apply()
            copyBlock.alpha = 0f
            hero.alpha = 0.55f
            copyBlock.animate().alpha(1f).setDuration(260).start()
            hero.animate().alpha(1f).setDuration(320).start()
        }.start()
        hero.animate().alpha(0.55f).setDuration(140).start()
    }

    private fun bindActions(page: Page) {
        backLink.isEnabled = pageIndex > 0
        backLink.alpha = if (pageIndex > 0) 1f else 0.28f
        secondaryBtn.visibility = View.GONE

        when (page) {
            Page.Finish -> {
                primaryBtn.label = host.finishLabel
                primaryBtn.armed = host.isReady
                primaryAction = { if (primaryBtn.armed) host.complete() }
            }
            is Page.Permission -> {
                val step = page.step
                val skippable = step.optional || !step.verifiable
                if (step.isGranted) {
                    primaryBtn.label = activity.getString(R.string.velvet_next)
                    primaryBtn.armed = true
                    primaryAction = { showPage(pageIndex + 1) }
                } else if (skippable) {
                    primaryBtn.label = activity.getString(R.string.velvet_activate)
                    primaryBtn.armed = true
                    primaryAction = { step.grant() }
                    secondaryBtn.visibility = View.VISIBLE
                    secondaryBtn.text = activity.getString(R.string.velvet_skip_optional)
                    secondaryAction = { showPage(pageIndex + 1) }
                } else {
                    primaryBtn.label = activity.getString(R.string.velvet_activate)
                    primaryBtn.armed = true
                    primaryAction = { step.grant() }
                }
            }
            else -> {
                primaryBtn.label = activity.getString(R.string.velvet_next)
                primaryBtn.armed = true
                primaryAction = { showPage(pageIndex + 1) }
            }
        }
    }

    private fun canLeave(page: Page): Boolean = when (page) {
        is Page.Permission -> page.step.isGranted || page.step.optional || !page.step.verifiable
        Page.Finish -> false
        else -> true
    }

    private fun onSwipe(dx: Float): Boolean {
        val page = pages[pageIndex]
        return if (dx < 0) {
            if (canLeave(page) && pageIndex < pages.lastIndex) {
                showPage(pageIndex + 1)
                true
            } else false
        } else if (pageIndex > 0) {
            showPage(pageIndex - 1)
            true
        } else false
    }

    private fun buildTopChrome(): View {
        val row = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            setPadding(dp(18), dp(14), dp(18), dp(8))
        }
        livePill = TextView(activity).apply {
            text = "●  ${activity.getString(R.string.velvet_live_badge)}"
            textSize = 11f
            setTextColor(Color.WHITE)
            typeface = vazirBold
            letterSpacing = 0.1f
            setPadding(dp(12), dp(6), dp(12), dp(6))
            background = GradientDrawable().apply {
                cornerRadius = dp(20).toFloat()
                setColor(0xE8E11D48.toInt())
            }
        }
        stepLabel = text("", 12.5f, 0xFFFFC2D4.toInt(), medium = true)
        row.addView(livePill)
        row.addView(View(activity), LinearLayout.LayoutParams(0, 0, 1f))
        row.addView(
            text(host.appName, 12.5f, 0xFFFFE4EC.toInt(), medium = true),
            LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { marginEnd = dp(10) },
        )
        row.addView(stepLabel)
        return row
    }

    private fun buildSheet(): View {
        val sheet = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            setPadding(dp(22), dp(6), dp(22), dp(12))
            background = GradientDrawable().apply {
                setColor(0xF214080F.toInt())
                cornerRadii = floatArrayOf(
                    dp(28).toFloat(), dp(28).toFloat(), dp(28).toFloat(), dp(28).toFloat(),
                    0f, 0f, 0f, 0f,
                )
            }
        }
        sheet.addView(View(activity).apply {
            background = GradientDrawable().apply {
                setColor(0x66FF8FB5)
                cornerRadius = dp(3).toFloat()
            }
        }, LinearLayout.LayoutParams(dp(40), dp(4)).apply {
            gravity = Gravity.CENTER_HORIZONTAL
            bottomMargin = dp(12)
        })

        copyBlock = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            layoutDirection = View.LAYOUT_DIRECTION_RTL
        }
        kicker = text("", 11.5f, 0xFFFF8FB5.toInt(), medium = true).apply { letterSpacing = 0.16f }
        titleView = text("", 28f, 0xFFFFF7FA.toInt(), bold = true).apply {
            setPadding(0, dp(8), 0, 0)
            includeFontPadding = false
            setLineSpacing(0f, 0.96f)
        }
        bodyView = text("", 14.5f, 0xFFE8C4D0.toInt()).apply {
            setPadding(0, dp(10), 0, 0)
            setLineSpacing(dp(4).toFloat(), 1f)
            includeFontPadding = false
        }
        statusChip = text(activity.getString(R.string.velvet_granted), 12.5f, 0xFFFFB4C8.toInt(), medium = true).apply {
            setPadding(dp(12), dp(6), dp(12), dp(6))
            background = GradientDrawable().apply {
                cornerRadius = dp(16).toFloat()
                setColor(0x33FF4D8D)
                setStroke(dp(1), 0x66FF8FB5)
            }
            visibility = View.GONE
        }
        copyBlock.addView(kicker)
        copyBlock.addView(titleView)
        copyBlock.addView(bodyView)
        copyBlock.addView(statusChip, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply {
            topMargin = dp(12)
        })
        sheet.addView(copyBlock)

        dots = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            setPadding(0, dp(14), 0, dp(8))
        }
        sheet.addView(dots)

        progress = SoftBar(activity)
        sheet.addView(progress, LinearLayout.LayoutParams(MATCH_PARENT, dp(3)).apply {
            bottomMargin = dp(12)
        })

        primaryBtn = RoseBtn(activity).apply {
            face = vazirBold
            setOnClickListener { if (armed) primaryAction() }
        }
        sheet.addView(primaryBtn, LinearLayout.LayoutParams(MATCH_PARENT, dp(54)))

        secondaryBtn = text("", 14f, 0xFFFFC2D4.toInt(), medium = true).apply {
            gravity = Gravity.CENTER
            minHeight = dp(42)
            visibility = View.GONE
            setOnClickListener { secondaryAction() }
        }
        sheet.addView(secondaryBtn, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))

        backLink = text(activity.getString(R.string.velvet_back), 14f, 0xFFC89AAA.toInt(), medium = true).apply {
            gravity = Gravity.CENTER
            minHeight = dp(44)
            setOnClickListener { if (pageIndex > 0) showPage(pageIndex - 1) }
        }
        sheet.addView(backLink)
        return sheet
    }

    private fun rebuildDots() {
        if (dots.childCount != pages.size) {
            dots.removeAllViews()
            repeat(pages.size) {
                dots.addView(View(activity), LinearLayout.LayoutParams(dp(7), dp(7)).apply {
                    marginStart = dp(3)
                    marginEnd = dp(3)
                })
            }
        }
        for (i in 0 until dots.childCount) {
            val on = i == pageIndex
            val child = dots.getChildAt(i)
            child.background = GradientDrawable().apply {
                cornerRadius = dp(4).toFloat()
                setColor(if (on) 0xFFFF4D8D.toInt() else 0xFF3A1524.toInt())
            }
            (child.layoutParams as LinearLayout.LayoutParams).apply {
                width = if (on) dp(20) else dp(7)
                height = dp(7)
            }
            child.requestLayout()
        }
    }

    private fun artRes(page: Page): Int = when (page) {
        is Page.Intro -> when (page.key) {
            "vibe" -> R.drawable.onb_slide_vibe
            "glow" -> R.drawable.onb_slide_glow
            "privacy" -> R.drawable.onb_slide_privacy
            else -> R.drawable.onb_slide_welcome
        }
        Page.Finish -> R.drawable.onb_slide_done
        is Page.Permission -> when (page.step.id) {
            "usage" -> R.drawable.onb_slide_usage
            "overlay" -> R.drawable.onb_slide_overlay
            "battery" -> R.drawable.onb_slide_battery
            "notifications" -> R.drawable.onb_slide_notifications
            "autostart" -> R.drawable.onb_slide_autostart
            else -> R.drawable.onb_slide_welcome
        }
    }

    private fun kickerFor(page: Page): String = when (page) {
        is Page.Intro -> activity.getString(
            when (page.key) {
                "vibe" -> R.string.velvet_slide_vibe_kicker
                "glow" -> R.string.velvet_slide_glow_kicker
                "privacy" -> R.string.velvet_slide_privacy_kicker
                else -> R.string.velvet_slide_welcome_kicker
            },
        )
        Page.Finish -> activity.getString(R.string.velvet_slide_done_kicker)
        is Page.Permission -> activity.getString(
            when (page.step.id) {
                "usage" -> R.string.velvet_slide_usage_kicker
                "overlay" -> R.string.velvet_slide_overlay_kicker
                "battery" -> R.string.velvet_slide_battery_kicker
                "notifications" -> R.string.velvet_slide_notif_kicker
                "autostart" -> R.string.velvet_slide_autostart_kicker
                else -> R.string.velvet_slide_usage_kicker
            },
        )
    }

    private fun titleFor(page: Page): String = when (page) {
        is Page.Intro -> activity.getString(
            when (page.key) {
                "vibe" -> R.string.velvet_slide_vibe_title
                "glow" -> R.string.velvet_slide_glow_title
                "privacy" -> R.string.velvet_slide_privacy_title
                else -> R.string.velvet_slide_welcome_title
            },
        )
        Page.Finish -> activity.getString(R.string.velvet_slide_done_title)
        is Page.Permission -> page.step.title
    }

    private fun bodyFor(page: Page): String = when (page) {
        is Page.Intro -> activity.getString(
            when (page.key) {
                "vibe" -> R.string.velvet_slide_vibe_body
                "glow" -> R.string.velvet_slide_glow_body
                "privacy" -> R.string.velvet_slide_privacy_body
                else -> R.string.velvet_slide_welcome_body
            },
        )
        Page.Finish -> activity.getString(R.string.velvet_slide_done_body)
        is Page.Permission -> page.step.description
    }

    private fun text(value: String, sp: Float, color: Int, bold: Boolean = false, medium: Boolean = false) =
        TextView(activity).apply {
            text = value
            textSize = sp
            setTextColor(color)
            typeface = when {
                bold -> vazirBold
                medium -> vazirMedium
                else -> vazirRegular
            }
        }

    private fun tintChrome() {
        runCatching {
            val night = 0xFF12060C.toInt()
            val w = activity.window
            w.statusBarColor = night
            w.navigationBarColor = night
            w.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(night))
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                @Suppress("DEPRECATION")
                w.decorView.systemUiVisibility =
                    w.decorView.systemUiVisibility and View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv()
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                @Suppress("DEPRECATION")
                w.decorView.systemUiVisibility =
                    w.decorView.systemUiVisibility and View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR.inv()
            }
        }
    }

    private fun dp(v: Int) = (v * activity.resources.displayMetrics.density).toInt()
    private val fa = charArrayOf('۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹')
    private fun faDigits(s: String) = buildString {
        for (c in s) append(if (c in '0'..'9') fa[c - '0'] else c)
    }
}

private class SwipeFrame(
    context: Context,
    private val onFlingX: (dx: Float) -> Boolean,
) : FrameLayout(context) {
    private val detector = GestureDetector(
        context,
        object : GestureDetector.SimpleOnGestureListener() {
            override fun onFling(e1: MotionEvent?, e2: MotionEvent, velocityX: Float, velocityY: Float): Boolean {
                if (e1 == null) return false
                val dx = e2.x - e1.x
                val dy = e2.y - e1.y
                val min = 72f * resources.displayMetrics.density
                if (abs(dx) < min || abs(dx) < abs(dy)) return false
                return onFlingX(dx)
            }
        },
    )

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        detector.onTouchEvent(ev)
        return super.dispatchTouchEvent(ev)
    }
}

private class PulseGlow(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val t0 = SystemClock.uptimeMillis()
    private var live = false

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        live = true
        postInvalidateOnAnimation()
    }

    override fun onDetachedFromWindow() {
        live = false
        super.onDetachedFromWindow()
    }

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        val t = (SystemClock.uptimeMillis() - t0) / 1000f
        paint.shader = RadialGradient(
            w * 0.82f, h * 0.12f + sin(t) * 10f, w * 0.55f,
            0x44FF2D72.toInt(), 0x0012060C, Shader.TileMode.CLAMP,
        )
        canvas.drawRect(0f, 0f, w, h, paint)
        paint.shader = RadialGradient(
            w * 0.1f, h * 0.7f + cos(t * 0.8f) * 12f, w * 0.45f,
            0x33C026D3.toInt(), 0x0012060C, Shader.TileMode.CLAMP,
        )
        canvas.drawRect(0f, 0f, w, h, paint)
        if (live) postInvalidateOnAnimation()
    }
}

private class SoftBar(context: Context) : View(context) {
    var fraction: Float = 0f
        set(value) {
            field = value.coerceIn(0f, 1f)
            invalidate()
        }

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        val r = h / 2f
        paint.shader = null
        paint.color = 0xFF3A1524.toInt()
        canvas.drawRoundRect(0f, 0f, w, h, r, r, paint)
        val fw = (w * fraction).coerceAtLeast(h)
        paint.shader = LinearGradient(
            w - fw, 0f, w, 0f,
            intArrayOf(0xFFFF2D72.toInt(), 0xFFFF9EC8.toInt()),
            null, Shader.TileMode.CLAMP,
        )
        canvas.drawRoundRect(w - fw, 0f, w, h, r, r, paint)
        paint.shader = null
    }
}

private class RoseBtn(context: Context) : View(context) {
    var label: String = ""
        set(value) {
            field = value
            invalidate()
        }

    var armed: Boolean = true
        set(value) {
            field = value
            invalidate()
        }

    var face: Typeface? = null
        set(value) {
            field = value
            textPaint.typeface = value
            invalidate()
        }

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
    }
    private val density = resources.displayMetrics.density
    private var shader: LinearGradient? = null

    init {
        isClickable = true
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        shader = LinearGradient(
            0f, 0f, w.toFloat(), 0f,
            intArrayOf(0xFFFF2D72.toInt(), 0xFFFF6B9D.toInt(), 0xFFFF8FB5.toInt()),
            floatArrayOf(0f, 0.55f, 1f),
            Shader.TileMode.CLAMP,
        )
    }

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        val rad = 28f * density
        if (armed) {
            paint.shader = shader
        } else {
            paint.shader = null
            paint.color = 0xFF3A1524.toInt()
        }
        canvas.drawRoundRect(0f, 0f, w, h, rad, rad, paint)
        paint.shader = null
        if (armed) {
            paint.color = 0x33FFFFFF
            canvas.drawRoundRect(2f * density, 2f * density, w - 2f * density, h * 0.4f, rad, rad, paint)
        }
        textPaint.color = if (armed) 0xFFFFF8FB.toInt() else 0xFF9A6A7A.toInt()
        textPaint.textSize = 16f * resources.displayMetrics.scaledDensity
        val fm = textPaint.fontMetrics
        canvas.drawText(label, w / 2f, h / 2f - (fm.ascent + fm.descent) / 2f, textPaint)
    }
}
