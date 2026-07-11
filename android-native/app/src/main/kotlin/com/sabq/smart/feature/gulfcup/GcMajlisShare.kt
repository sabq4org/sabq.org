package com.sabq.smart.feature.gulfcup

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.net.Uri
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream

/** Generates the same 4:5 social card size as iOS ImageRenderer (360×450 @3x). */
object GcMajlisShare {
    const val WIDTH = 1080
    const val HEIGHT = 1350
    private const val WEB_ORIGIN = "https://sabq.org"

    fun shareInvite(context: Context, majlis: GcMajlisSummary) {
        val url = "$WEB_ORIGIN/gulf-cup/majlis?code=${Uri.encode(majlis.code)}"
        val bitmap = inviteBitmap(majlis, url)
        share(
            context,
            bitmap,
            "gc-majlis-invite-${safeName(majlis.id)}.png",
            "نافسنا في مجلس «${majlis.name}» لتوقعات خليجي 27 — رمز الدعوة ${majlis.code}\n$url",
        )
    }

    fun shareHarvest(context: Context, data: GcMajlisHarvestResponse) {
        val url = "$WEB_ORIGIN/gulf-cup/majlis?id=${Uri.encode(data.majlis.id)}"
        val bitmap = harvestBitmap(data)
        share(
            context,
            bitmap,
            "gc-majlis-harvest-${safeName(data.majlis.id)}.png",
            "هذا حصاد مجلس «${data.majlis.name}» في توقعات خليجي 27 🏆\n$url",
        )
    }

    fun inviteBitmap(majlis: GcMajlisSummary, inviteUrl: String): Bitmap =
        Bitmap.createBitmap(WIDTH, HEIGHT, Bitmap.Config.ARGB_8888).also { bitmap ->
            val canvas = Canvas(bitmap)
            drawBase(canvas)
            drawTopBrand(canvas, "مجالس توقعات خليجي 27", "من سبق")
            centeredText(canvas, "انضم إلى مجلس", 160f, 48f, WHITE_76, Typeface.BOLD)
            multiline(canvas, majlis.name, 105f, 590f, 250f, 82f, Color.WHITE, Typeface.BOLD)
            centeredText(canvas, "توقّع قبل المباريات ونافس ناسك", 350f, 38f, WHITE_72, Typeface.NORMAL)

            val codeRect = RectF(95f, 535f, 985f, 820f)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(242, 255, 255, 255) }
            canvas.drawRoundRect(codeRect, 54f, 54f, paint)
            centeredText(canvas, "رمز الدعوة", 620f, 32f, Color.rgb(90, 108, 112), Typeface.BOLD)
            centeredText(canvas, majlis.code, 750f, 84f, SKY_DEEP, Typeface.BOLD, letterSpacing = 10f)

            centeredText(canvas, "${majlis.membersCount}/50 عضو", 930f, 36f, WHITE_70, Typeface.BOLD)
            centeredText(canvas, inviteUrl.substringAfter("https://").substringBefore("?"), 1135f, 31f, WHITE_58, Typeface.NORMAL)
        }

    fun harvestBitmap(data: GcMajlisHarvestResponse): Bitmap =
        Bitmap.createBitmap(WIDTH, HEIGHT, Bitmap.Config.ARGB_8888).also { bitmap ->
            val canvas = Canvas(bitmap)
            drawBase(canvas)
            drawTopBrand(canvas, "حصاد المجلس", data.majlis.name)
            centeredText(canvas, "🏆", 250f, 92f, SKY_LITE, Typeface.NORMAL)
            centeredText(canvas, "بطل المجلس", 340f, 34f, WHITE_70, Typeface.BOLD)
            multiline(
                canvas,
                data.awards.champions.joinToString(" · ") { it.name }.ifBlank { "—" },
                92f,
                896f,
                390f,
                72f,
                Color.WHITE,
                Typeface.BOLD,
            )
            data.awards.champions.firstOrNull()?.let {
                centeredText(canvas, "${it.totalPoints} نقطة", 500f, 45f, SKY_LITE, Typeface.BOLD)
            }

            val labels = listOf(
                "الأدق" to data.awards.mostAccurate.firstOrNull()?.name,
                "الأجرأ" to data.awards.boldest.firstOrNull()?.name,
                "العنيد" to data.awards.stubborn.firstOrNull()?.name,
            )
            labels.forEachIndexed { index, pair ->
                val left = 70f + index * 330f
                val rect = RectF(left, 710f, left + 280f, 965f)
                canvas.drawRoundRect(rect, 38f, 38f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(20, 255, 255, 255) })
                text(canvas, pair.first, rect.centerX(), 790f, 31f, SKY_LITE, Typeface.BOLD, Paint.Align.CENTER)
                multiline(canvas, pair.second ?: "—", left + 22f, 236f, 820f, 35f, Color.WHITE, Typeface.BOLD)
            }
            centeredText(canvas, "14 يومًا من التوقعات والمنافسة", 1130f, 30f, WHITE_58, Typeface.BOLD)
            centeredText(canvas, "sabq.org", 1225f, 28f, WHITE_58, Typeface.NORMAL)
        }

    private fun drawBase(canvas: Canvas) {
        val background = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = LinearGradient(
                0f,
                0f,
                WIDTH.toFloat(),
                HEIGHT.toFloat(),
                intArrayOf(Color.rgb(4, 28, 34), Color.rgb(5, 46, 54), Color.rgb(8, 65, 72)),
                null,
                Shader.TileMode.CLAMP,
            )
        }
        canvas.drawRect(0f, 0f, WIDTH.toFloat(), HEIGHT.toFloat(), background)
        val glow = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(35, 56, 189, 248) }
        canvas.drawCircle(70f, 70f, 360f, glow)
        canvas.drawCircle(1040f, 1320f, 410f, glow)
        val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(13, 255, 255, 255); strokeWidth = 3f }
        for (x in 120..960 step 210) canvas.drawLine(x.toFloat(), 0f, x.toFloat(), HEIGHT.toFloat(), line)
    }

    private fun drawTopBrand(canvas: Canvas, title: String, subtitle: String) {
        text(canvas, title, 985f, 95f, 34f, SKY_LITE, Typeface.BOLD, Paint.Align.RIGHT)
        text(canvas, subtitle, 985f, 142f, 27f, WHITE_58, Typeface.NORMAL, Paint.Align.RIGHT)
        val badge = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(28, 255, 255, 255) }
        canvas.drawCircle(100f, 105f, 62f, badge)
        centeredText(canvas, "27", 123f, 42f, Color.WHITE, Typeface.BOLD, centerX = 100f)
    }

    private fun centeredText(
        canvas: Canvas,
        value: String,
        baseline: Float,
        size: Float,
        color: Int,
        style: Int,
        letterSpacing: Float = 0f,
        centerX: Float = WIDTH / 2f,
    ) = text(canvas, value, centerX, baseline, size, color, style, Paint.Align.CENTER, letterSpacing)

    private fun text(
        canvas: Canvas,
        value: String,
        x: Float,
        baseline: Float,
        size: Float,
        color: Int,
        style: Int,
        align: Paint.Align,
        letterSpacing: Float = 0f,
    ) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = color
            textSize = size
            textAlign = align
            typeface = Typeface.create("sans-serif", style)
            this.letterSpacing = letterSpacing / size
        }
        canvas.drawText(value, x, baseline, paint)
    }

    private fun multiline(
        canvas: Canvas,
        value: String,
        left: Float,
        width: Float,
        top: Float,
        size: Float,
        color: Int,
        style: Int,
    ) {
        val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = color
            textSize = size
            typeface = Typeface.create("sans-serif", style)
        }
        val layout = StaticLayout.Builder.obtain(value, 0, value.length, paint, width.toInt())
            .setAlignment(Layout.Alignment.ALIGN_CENTER)
            .setIncludePad(false)
            .setMaxLines(2)
            .build()
        canvas.save()
        canvas.translate(left, top)
        layout.draw(canvas)
        canvas.restore()
    }

    private fun share(context: Context, bitmap: Bitmap, fileName: String, message: String) {
        val dir = File(context.cacheDir, "gc-shares").apply { mkdirs() }
        val file = File(dir, fileName)
        FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_TEXT, message)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "مشاركة"))
    }

    private fun safeName(value: String): String = value.replace(Regex("[^A-Za-z0-9_-]"), "-")

    private const val SKY_DEEP = 0xFF024F6C.toInt()
    private const val SKY_LITE = 0xFF7DD3FC.toInt()
    private const val WHITE_76 = 0xC2FFFFFF.toInt()
    private const val WHITE_72 = 0xB8FFFFFF.toInt()
    private const val WHITE_70 = 0xB3FFFFFF.toInt()
    private const val WHITE_58 = 0x94FFFFFF.toInt()
}
