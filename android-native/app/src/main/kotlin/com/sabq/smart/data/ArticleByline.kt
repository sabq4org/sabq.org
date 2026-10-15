package com.sabq.smart.data

import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * سطر الكاتب في الخبر كما في الويب (#1598) ونظير iOS (`Article.resolveAuthorRole`
 * و`publicationDate/publicationClock/lastUpdatedLabel/readingLabel`).
 * التواريخ بتوقيت الرياض وبأرقام لاتينية (الويب `ar-SA-u-ca-gregory-nu-latn`).
 */
object ArticleByline {
    private val riyadh: ZoneId = ZoneId.of("Asia/Riyadh")
    private val saudi: Locale = Locale.forLanguageTag("ar-SA")
    private val dateFormatter = DateTimeFormatter.ofPattern("d MMMM yyyy", saudi)
    private val clockFormatter = DateTimeFormatter.ofPattern("hh:mm a", saudi)
    private val dateTimeFormatter = DateTimeFormatter.ofPattern("d MMMM yyyy، hh:mm a", saudi)

    /** صفة الكاتب: صفة المراسل، وإلا «صحيفة إلكترونية سعودية» لحساب الصحيفة،
     *  وإلا «مراسل صحفي» عندما يكون الكاتب هو المراسل المختار، وإلا «كاتب الخبر». */
    fun resolveAuthorRole(name: String?, authorId: String?, reporterId: String?, staffTitle: String?): String {
        staffTitle?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
        if (name?.trim() == "صحيفة سبق") return "صحيفة إلكترونية سعودية"
        if (!authorId.isNullOrEmpty() && authorId == reporterId) return "مراسل صحفي"
        return "كاتب الخبر"
    }

    /** «12 سبتمبر 2026». */
    fun publicationDate(iso: String?): String? = parse(iso)?.let { latinDigits(dateFormatter.format(it)) }

    /** «10:22 م». */
    fun publicationClock(iso: String?): String? = parse(iso)?.let { latinDigits(clockFormatter.format(it)) }

    /** «آخر تحديث» — null بلا تعديل تحريري مسجّل (كما في الويب). */
    fun lastUpdatedLabel(iso: String?): String? = parse(iso)?.let { latinDigits(dateTimeFormatter.format(it)) }

    /** «قراءة N دقيقة» بصياغة الويب. */
    fun readingLabel(minutes: Int?): String = "قراءة ${maxOf(1, minutes ?: 1)} دقيقة"

    private fun parse(iso: String?): ZonedDateTime? = parseDate(iso)?.withZoneSameInstant(riyadh)

    /** بعض إعدادات النظام تُخرج أرقامًا هندية؛ الويب وiOS يعرضان اللاتينية دائمًا. */
    fun latinDigits(text: String): String {
        val sb = StringBuilder(text.length)
        for (ch in text) {
            val code = ch.code
            sb.append(
                when (code) {
                    in 0x0660..0x0669 -> ('0' + (code - 0x0660))
                    in 0x06F0..0x06F9 -> ('0' + (code - 0x06F0))
                    else -> ch
                },
            )
        }
        return sb.toString()
    }
}
