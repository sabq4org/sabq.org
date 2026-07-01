# مهمة: تحويل تطبيق سبق iOS إلى تطبيق إنتاجي متصل بالموقع

## السياق
لدي تطبيق iOS مبني بـ SwiftUI لصحيفة سبق الإلكترونية (sabq.org).
التطبيق حالياً يعمل ببيانات تجريبية (mock data) محلية.
الموقع يعمل الآن بكل كفاءة على sabq.org.
المطلوب تحويل التطبيق لتطبيق إنتاجي حقيقي متصل بالموقع.

## ملف التصميم
اقرأ ملف `DESIGN_SPEC.md` الموجود في المشروع — يحتوي على كامل مواصفات التصميم (ألوان، خطوط، شاشات، مكونات). لا تغيّر التصميم، فقط اربطه بالبيانات الحقيقية.

---

## المطلوب تنفيذه

### 1. طبقة الشبكة (Networking Layer)
- أنشئ `APIClient` أو `NetworkService` مركزي يتعامل مع REST API للموقع
- استخدم `async/await` مع `URLSession`
- أضف إدارة الأخطاء (no internet, timeout, server error) مع رسائل عربية واضحة للمستخدم
- أضف retry logic للطلبات الفاشلة
- أضف request caching مناسب
- Base URL: `https://sabq.org/api/` (عدّله حسب الـ API الفعلي للموقع)

### 2. استبدال البيانات التجريبية
- الملف الحالي `Services/NewsService.swift` يحتوي على بيانات تجريبية ثابتة (18 مقالة)
- استبدله بخدمة حقيقية تجلب البيانات من API الموقع
- اربط كل دالة بالـ endpoint المناسب:
  - `allArticles()` → GET /articles
  - `featuredArticles()` → GET /articles?featured=true
  - `breakingNews()` → GET /articles?breaking=true
  - `articles(for category)` → GET /articles?category={category}
  - `search(query)` → GET /articles/search?q={query}
- عدّل الـ endpoints حسب ما يقدمه API الموقع الفعلي

### 3. نموذج البيانات (Models)
- النموذج الحالي `Article` موجود في `Models/SabqModels.swift`
- عدّل الـ `Article` struct ليطابق JSON response من الـ API
- أضف `CodingKeys` إذا كانت أسماء الحقول مختلفة
- تأكد من التعامل مع الحقول الاختيارية بشكل آمن
- الأقسام الثمانية: محلية، سياسة، رياضة، اقتصاد، تقنية، ثقافة، مجتمع، دولية

### 4. حالات التحميل (Loading States)
- أضف حالة تحميل (skeleton/shimmer) لكل شاشة أثناء جلب البيانات
- أضف حالة خطأ مع زر "إعادة المحاولة"
- أضف حالة فارغة عندما لا توجد بيانات
- الـ pull-to-refresh موجود بالفعل في الرئيسية، فعّله فعلياً ليجلب بيانات جديدة

### 5. التخزين المؤقت (Caching)
- أضف طبقة cache محلية (يفضل باستخدام SwiftData أو Core Data)
- المقالات تُعرض من الكاش أولاً ثم تُحدّث من الشبكة
- الصور تُخزن مؤقتاً (يمكن استخدام URLCache أو مكتبة مثل Kingfisher)

### 6. الإشعارات (Push Notifications)
- أضف دعم Apple Push Notifications (APNs)
- اربطه بنظام الإشعارات في الموقع
- الإشعارات المطلوبة: أخبار عاجلة + ملخص يومي (التبديل موجود في الإعدادات)
- عند الضغط على الإشعار يفتح المقال المرتبط

### 7. Pagination (التحميل التدريجي)
- أضف infinite scroll / pagination لقائمة المقالات
- حمّل 20 مقالة في كل صفحة
- أضف مؤشر تحميل أسفل القائمة عند جلب المزيد

### 8. Deep Linking
- أضف دعم Universal Links بحيث روابط sabq.org تفتح في التطبيق
- مثال: `https://sabq.org/article/12345` → يفتح المقال في التطبيق

### 9. Analytics
- أضف Firebase Analytics أو أي نظام تحليلات
- تتبع: فتح المقال، البحث، الحفظ، مشاركة، تغيير القسم

### 10. المشاركة (Share)
- زر المشاركة موجود في تفاصيل المقال لكن غير مفعّل
- فعّله باستخدام `ShareLink` أو `UIActivityViewController`
- شارك: عنوان المقال + رابط المقال على الموقع

### 11. الأمان
- أضف Certificate Pinning إذا لزم الأمر
- تأكد من استخدام HTTPS فقط
- لا تخزّن بيانات حساسة بدون تشفير

### 12. الأداء
- استخدم `LazyVStack` بدل `VStack` للقوائم الطويلة
- أضف `task` modifier لتحميل البيانات عند ظهور الشاشة
- تأكد من عدم حظر الـ Main Thread

---

## هيكل الملفات المقترح بعد التعديل

```
sabq/
├── App/
│   └── sabqApp.swift
├── Models/
│   ├── SabqModels.swift (الموجود - عدّل Article ليطابق API)
│   └── APIModels.swift (response wrappers)
├── Services/
│   ├── APIClient.swift (جديد - HTTP client)
│   ├── NewsService.swift (عدّل - من mock إلى API حقيقي)
│   ├── CacheService.swift (جديد - local cache)
│   └── NotificationService.swift (جديد - push notifications)
├── Stores/
│   ├── ArticlesStore.swift (عدّل - أضف loading states)
│   └── BookmarksStore.swift (الموجود)
├── Components/
│   ├── SabqComponents.swift (الموجود - لا تغيّره)
│   ├── SabqRTL.swift (الموجود - لا تغيّره)
│   └── SkeletonViews.swift (جديد - loading placeholders)
├── Screens/
│   ├── HomeFeedView.swift
│   ├── SectionsView.swift
│   ├── SearchView.swift
│   ├── BookmarksView.swift
│   ├── SettingsView.swift
│   └── ArticleDetailView.swift
└── ContentView.swift
```

---

## ملاحظات مهمة

1. **لا تغيّر التصميم أو الألوان أو الـ layout** — فقط اربط البيانات الحقيقية
2. **التطبيق عربي بالكامل** — كل الرسائل والأخطاء بالعربي
3. **RTL مطبق على مستوى النافذة** — لا تغيّر آلية الـ RTL الموجودة
4. **الإعدادات محفوظة بـ AppStorage** — (الوضع الداكن، لون التطبيق، حجم الخط) — لا تغيّرها
5. **افحص API الموقع أولاً** عبر `https://sabq.org` واكتشف الـ endpoints المتاحة وشكل الـ JSON response قبل البدء
6. **أضف ملف `.env` أو `Config.swift`** للمتغيرات البيئية (API URL, API Key إن وجد)

---

## أولوية التنفيذ
1. ✅ APIClient + استبدال NewsService (الأساس)
2. ✅ Loading states + Error handling (تجربة المستخدم)
3. ✅ Caching + Pagination (الأداء)
4. ✅ Push Notifications (التفاعل)
5. ✅ Share + Deep Links (المشاركة)
6. ✅ Analytics (التحليلات)
