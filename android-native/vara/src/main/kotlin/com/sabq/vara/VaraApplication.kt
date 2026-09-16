package com.sabq.vara

import android.app.Application
import com.google.firebase.FirebaseApp
import com.sabq.vara.push.MatchReminderScheduler
import com.sabq.vara.push.VaraMessagingService

class VaraApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // يبقى التطبيق قابلاً للتشغيل في CI بلا ملف Firebase؛ تتعطل الإشعارات فقط.
        runCatching { FirebaseApp.initializeApp(this) }
        VaraMessagingService.ensureChannel(this)
        // حزام أمان: يعيد جدولة التذكيرات المحلية إن فُقدت بعد إعادة التشغيل.
        MatchReminderScheduler.rescheduleAll(this)
    }
}
