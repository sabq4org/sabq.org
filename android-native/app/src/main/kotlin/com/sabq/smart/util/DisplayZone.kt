package com.sabq.smart.util

import java.time.ZoneId

/**
 * المنطقة الزمنية لعرض الأوقات: منطقة جهاز المستخدم (قارئ في القاهرة يرى وقت القاهرة)،
 * مطابقًا للويب (`client/src/lib/displayTimeZone.ts`). تُقرأ عند كل استدعاء لأن المستخدم
 * قد يغيّر منطقة الجهاز أثناء عمل التطبيق.
 *
 * يبقى بتوقيت الرياض عمدًا: حقول إدخال الجدولة (مكتوب بجانبها «بتوقيت الرياض»)،
 * مواعيد كتّاب الرأي، مواعيد، والرياضة.
 */
val RIYADH_ZONE_ID: ZoneId = ZoneId.of("Asia/Riyadh")

fun displayZone(): ZoneId = runCatching { ZoneId.systemDefault() }.getOrDefault(RIYADH_ZONE_ID)
