package com.sabq.smart.feature.revisions

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * تجهيز صورة للرفع: تصغير الضلع الأطول إلى 2000 بكسل ثم JPEG ‏70%.
 * مرآة iOS `SabqImageUpload.prepare` — الرفع الخام (4-8MB للصورة ×
 * ‏1.33 بعد base64) يتجاوز حدّ جسم JSON على الخادم ويرفع ذروة الذاكرة
 * بلا مكسب جودة منشورة.
 */
object RevisionImageUpload {

    const val MIME = "image/jpeg"

    fun prepare(
        context: Context,
        uri: Uri,
        maxDimension: Int = 2000,
        quality: Int = 70,
    ): ByteArray? {
        val resolver = context.contentResolver

        // قراءة الأبعاد فقط أولاً — لتقرير inSampleSize قبل فك الترميز
        // الكامل (صورة 12MP خام = ~48MB بيتماب بدون ذلك).
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        runCatching {
            resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        }.getOrNull() ?: return null
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxDimension) {
            sample *= 2
        }

        val decoded = runCatching {
            resolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
            }
        }.getOrNull() ?: return null

        val longest = max(decoded.width, decoded.height)
        val bitmap = if (longest > maxDimension) {
            val factor = maxDimension.toFloat() / longest
            Bitmap.createScaledBitmap(
                decoded,
                (decoded.width * factor).roundToInt().coerceAtLeast(1),
                (decoded.height * factor).roundToInt().coerceAtLeast(1),
                true,
            )
        } else {
            decoded
        }

        val out = java.io.ByteArrayOutputStream()
        val ok = bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
        if (bitmap !== decoded) decoded.recycle()
        return if (ok && out.size() > 0) out.toByteArray() else null
    }
}
