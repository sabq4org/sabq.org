# وثائق واجهات برمجة التطبيقات (APIs) - صحيفة سبق

## نظرة عامة

- **إجمالي الـ APIs:** 834+ نقطة نهاية
- **Base URL:** `https://sabq.org/api`
- **Authentication:** Bearer Token / Session Cookie
- **Content-Type:** `application/json`

---

## 1. المصادقة والتسجيل (Authentication)

### تسجيل الدخول
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/login` | تسجيل دخول بالبريد/كلمة المرور | - |
| GET | `/api/auth/google` | تسجيل دخول بحساب Google | - |
| GET | `/api/auth/google/callback` | Callback لـ Google OAuth | - |
| GET | `/api/auth/apple` | تسجيل دخول بحساب Apple | - |
| POST | `/api/auth/apple/callback` | Callback لـ Apple OAuth | - |
| POST | `/api/register` | إنشاء حساب جديد | - |
| POST | `/api/logout` | تسجيل الخروج | Required |
| GET | `/api/auth/logout` | تسجيل الخروج (GET) | Required |

### إدارة الحساب
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/auth/user` | جلب بيانات المستخدم الحالي | Required |
| PATCH | `/api/auth/user` | تحديث بيانات المستخدم | Required |
| POST | `/api/auth/verify-email` | تأكيد البريد الإلكتروني | - |
| POST | `/api/auth/resend-verification` | إعادة إرسال رمز التأكيد | Required |
| POST | `/api/auth/forgot-password` | نسيت كلمة المرور | - |
| POST | `/api/auth/reset-password` | إعادة تعيين كلمة المرور | - |
| POST | `/api/auth/set-password` | تعيين كلمة المرور | Required |
| POST | `/api/auth/complete-profile` | إكمال الملف الشخصي | Required |

### المصادقة الثنائية (2FA)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/2fa/status` | حالة المصادقة الثنائية | Required |
| GET | `/api/2fa/setup` | إعداد المصادقة الثنائية | Required |
| POST | `/api/2fa/enable` | تفعيل المصادقة الثنائية | Required |
| POST | `/api/2fa/disable` | تعطيل المصادقة الثنائية | Required |
| POST | `/api/2fa/verify` | التحقق من الرمز | - |
| POST | `/api/2fa/send-sms` | إرسال رمز SMS | - |
| GET | `/api/2fa/pending-method` | الطريقة المعلقة | - |
| POST | `/api/2fa/verify-sms` | التحقق من رمز SMS | - |
| POST | `/api/2fa/update-method` | تحديث طريقة المصادقة | Required |
| POST | `/api/2fa/backup-codes` | أكواد النسخ الاحتياطي | Required |

### CSRF
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/csrf-token` | جلب رمز CSRF | - |

---

## 2. المقالات والأخبار (Articles)

### المقالات العامة
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/articles` | قائمة المقالات | - |
| GET | `/api/articles/featured` | المقال المميز | - |
| GET | `/api/articles/latest-footer` | أحدث مقالات للفوتر | - |
| GET | `/api/articles/search-simple` | بحث بسيط | - |
| GET | `/api/articles/:slug` | مقال بالـ slug | - |
| GET | `/api/articles/:slug/comments` | تعليقات المقال | - |
| GET | `/api/articles/:slug/related` | مقالات ذات صلة | - |
| GET | `/api/articles/:slug/sidebar` | محتوى الشريط الجانبي | - |
| GET | `/api/articles/:slug/ai-recommendations` | توصيات الذكاء الاصطناعي | - |
| GET | `/api/articles/:slug/summary-audio` | ملخص صوتي | - |
| GET | `/api/articles/:slug/ai-insights` | رؤى الذكاء الاصطناعي | - |
| GET | `/api/articles/:slug/related-infographics` | إنفوجرافيك ذو صلة | - |
| GET | `/api/articles/:slug/infographics` | إنفوجرافيك المقال | - |

### تفاعلات المقالات
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/articles/:id/view` | تسجيل مشاهدة | - |
| POST | `/api/articles/:id/react` | التفاعل (إعجاب) | Required |
| POST | `/api/articles/:id/bookmark` | حفظ المقال | Required |
| POST | `/api/articles/:id/reading-time` | تسجيل وقت القراءة | Required |
| POST | `/api/articles/:slug/comments` | إضافة تعليق | Required |

### تحليلات المقالات
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/articles/:id/analyze-credibility` | تحليل المصداقية | Required |
| POST | `/api/articles/:id/analyze-seo` | تحليل SEO | Required + Permission |
| POST | `/api/articles/generate-content` | توليد محتوى | Required + Permission |
| POST | `/api/articles/edit-and-generate` | تحرير وتوليد | Required + Permission |

### الوسائط المرفقة
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/articles/:articleId/media-assets` | إضافة وسائط | Required |
| GET | `/api/articles/:articleId/media-assets` | جلب الوسائط | - |
| GET | `/api/media-assets/:id` | وسيط محدد | - |
| PATCH | `/api/media-assets/:id` | تحديث وسيط | Required |
| DELETE | `/api/media-assets/:id` | حذف وسيط | Required |
| POST | `/api/articles/:articleId/media-assets/reorder` | إعادة ترتيب | Required |

---

## 3. لوحة التحكم - المقالات (Dashboard Articles)

### إدارة المقالات
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/dashboard/articles` | قائمة مقالات المحرر | Required |
| POST | `/api/dashboard/articles` | إنشاء مقال | Required |
| GET | `/api/dashboard/articles/:id` | مقال محدد | Required |
| PUT | `/api/dashboard/articles/:id` | تحديث مقال | Required |
| DELETE | `/api/dashboard/articles/:id` | حذف مقال | Required |

### إدارة المقالات (Admin)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/admin/articles` | كل المقالات | Required + Permission |
| GET | `/api/admin/articles/metrics` | إحصائيات المقالات | Required + Permission |
| GET | `/api/admin/articles/:id` | مقال محدد | Required + Permission |
| POST | `/api/admin/articles` | إنشاء مقال | Required + Permission |
| PATCH | `/api/admin/articles/:id` | تحديث مقال | Required + Permission |
| POST | `/api/admin/articles/:id/publish` | نشر مقال | Required + Permission |
| POST | `/api/admin/articles/:id/feature` | تمييز مقال | Required + Permission |
| POST | `/api/admin/articles/:id/archive` | أرشفة مقال | Required + Permission |
| POST | `/api/admin/articles/:id/restore` | استعادة مقال | Required + Permission |
| POST | `/api/admin/articles/:id/toggle-breaking` | تبديل عاجل | Required + Permission |
| DELETE | `/api/admin/articles/:id` | حذف مقال | Required + Permission |
| DELETE | `/api/admin/articles/:id/permanent` | حذف نهائي | Required + Permission |

### قفل التحرير
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/admin/articles/:id/lock` | قفل المقال | Required |
| PATCH | `/api/admin/articles/:id/lock/heartbeat` | تجديد القفل | Required |
| DELETE | `/api/admin/articles/:id/lock` | فك القفل | Required |
| GET | `/api/admin/articles/:id/lock` | حالة القفل | Required |

### العمليات المجمعة
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/admin/articles/bulk-archive` | أرشفة مجمعة | Required + Permission |
| POST | `/api/admin/articles/bulk-delete-permanent` | حذف مجمع | Required + Permission |
| POST | `/api/admin/articles/update-order` | تحديث الترتيب | Required + Permission |

---

## 4. مقالات الرأي (Opinion Articles)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/dashboard/opinion` | قائمة مقالات الرأي | Required |
| POST | `/api/dashboard/opinion` | إنشاء مقال رأي | Required |
| GET | `/api/dashboard/opinion/:id` | مقال رأي محدد | Required |
| PUT | `/api/dashboard/opinion/:id` | تحديث مقال رأي | Required |
| DELETE | `/api/dashboard/opinion/:id` | حذف مقال رأي | Required |
| GET | `/api/dashboard/opinion/authors` | قائمة الكتّاب | Required |
| GET | `/api/opinions` | مقالات الرأي العامة | - |
| GET | `/api/opinions/:slug` | مقال رأي بالـ slug | - |
| GET | `/api/opinions/random` | مقالات رأي عشوائية | - |

---

## 5. التصنيفات (Categories)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/categories` | قائمة التصنيفات | - |
| GET | `/api/categories/:id` | تصنيف محدد | - |
| GET | `/api/categories/slug/:slug` | تصنيف بالـ slug | - |
| GET | `/api/categories/:slug/articles` | مقالات التصنيف | - |
| GET | `/api/categories/:slug/analytics` | تحليلات التصنيف | - |
| GET | `/api/categories/smart` | التصنيفات الذكية | - |
| POST | `/api/categories` | إنشاء تصنيف | Required + Permission |
| PATCH | `/api/categories/:id` | تحديث تصنيف | Required + Permission |
| DELETE | `/api/categories/:id` | حذف تصنيف | Required + Permission |
| POST | `/api/categories/reorder` | إعادة ترتيب | Required + Permission |

---

## 6. الصفحة الرئيسية (Homepage)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/homepage` | محتوى الصفحة الرئيسية | - |
| GET | `/api/homepage-lite` | الصفحة الخفيفة | - |
| GET | `/api/homepage/stats` | إحصائيات الصفحة | - |
| GET | `/api/lite-feed` | تغذية النسخة الخفيفة | - |
| GET | `/api/news/paginated` | الأخبار مع تصفح الصفحات | - |
| GET | `/api/trending-keywords` | الكلمات الرائجة | - |
| GET | `/api/personal-feed` | التغذية الشخصية | Required |
| GET | `/api/daily-brief` | الموجز اليومي | Required |

---

## 7. البلوكات الذكية (Smart Blocks)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/smart-blocks` | قائمة البلوكات | - |
| GET | `/api/smart-blocks/:id` | بلوك محدد | - |
| POST | `/api/smart-blocks` | إنشاء بلوك | Required + Permission |
| PUT | `/api/smart-blocks/:id` | تحديث بلوك | Required + Permission |
| DELETE | `/api/smart-blocks/:id` | حذف بلوك | Required + Permission |
| POST | `/api/smart-blocks/reorder` | إعادة ترتيب | Required + Permission |

---

## 8. الوسائط (Media)

### إدارة الملفات
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/media` | قائمة الوسائط | Required |
| POST | `/api/media/upload` | رفع ملف | Required |
| GET | `/api/media/proxy/:id` | عرض ملف | - |
| POST | `/api/media/save-existing` | حفظ ملف موجود | Required |
| PUT | `/api/media/:id` | تحديث ملف | Required |
| DELETE | `/api/media/:id` | حذف ملف | Required |
| POST | `/api/media/make-public` | جعل الملف عام | Required |
| GET | `/api/media/suggestions` | اقتراحات | Required |

### المجلدات
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/media/folders` | قائمة المجلدات | Required |
| POST | `/api/media/folders` | إنشاء مجلد | Required |
| PUT | `/api/media/folders/:id` | تحديث مجلد | Required |
| DELETE | `/api/media/folders/:id` | حذف مجلد | Required |

### الصور الرمزية
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/profile/upload-avatar` | رفع صورة رمزية | Required |
| PUT | `/api/profile/image` | تحديث صورة الملف | Required |
| GET | `/api/media/proxy-avatar/:storagePath` | عرض صورة رمزية | - |

---

## 9. التعليقات (Comments)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/admin/comments` | قائمة التعليقات | Required + Permission |
| GET | `/api/admin/comments/stats` | إحصائيات التعليقات | Required + Permission |
| PATCH | `/api/admin/comments/:id/approve` | موافقة على تعليق | Required + Permission |
| PATCH | `/api/admin/comments/:id/reject` | رفض تعليق | Required + Permission |
| DELETE | `/api/admin/comments/:id` | حذف تعليق | Required + Permission |

---

## 10. المستخدمين (Users)

### المستخدمين العامة
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/users` | قائمة المستخدمين | Required |
| GET | `/api/users/suggested` | مستخدمين مقترحين | Required |
| GET | `/api/users/:id/public` | ملف عام | - |

### إدارة المستخدمين (Admin)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/admin/users` | كل المستخدمين | Required + Permission |
| GET | `/api/admin/users/:id` | مستخدم محدد | Required + Permission |
| POST | `/api/admin/users` | إنشاء مستخدم | Required + Permission |
| PATCH | `/api/admin/users/:id` | تحديث مستخدم | Required + Permission |
| DELETE | `/api/admin/users/:id` | حذف مستخدم | Required + Permission |
| DELETE | `/api/admin/users/:id/permanent` | حذف نهائي | Required + Permission |
| POST | `/api/admin/users/:id/reset-password` | إعادة تعيين كلمة المرور | Required + Permission |
| GET | `/api/admin/users/:id/delete-preview` | معاينة الحذف | Required + Permission |

### الأدوار والصلاحيات
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/admin/users/:id/roles` | أدوار المستخدم | Required + Permission |
| PATCH | `/api/admin/users/:id/roles` | تحديث الأدوار | Required + Permission |
| GET | `/api/admin/users/:id/staff` | بيانات الموظف | Required + Permission |
| PATCH | `/api/admin/users/:id/staff` | تحديث بيانات الموظف | Required + Permission |
| GET | `/api/admin/users/:id/permission-overrides` | الصلاحيات المخصصة | Required + Permission |
| POST | `/api/admin/users/:id/permission-overrides` | إضافة صلاحية مخصصة | Required + Permission |
| DELETE | `/api/admin/users/:id/permission-overrides/:permissionCode` | حذف صلاحية | Required + Permission |

---

## 11. الأدوار والصلاحيات (Roles & Permissions)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/admin/roles` | قائمة الأدوار | Required + Permission |
| POST | `/api/admin/roles` | إنشاء دور | Required + Permission |
| GET | `/api/admin/roles/:id` | دور محدد | Required + Permission |
| DELETE | `/api/admin/roles/:id` | حذف دور | Required + Permission |
| GET | `/api/admin/roles/:id/permissions` | صلاحيات الدور | Required + Permission |
| PATCH | `/api/admin/roles/:id/permissions` | تحديث الصلاحيات | Required + Permission |
| GET | `/api/permissions` | كل الصلاحيات | Required |

---

## 12. الإشعارات (Notifications)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/notifications` | قائمة الإشعارات | Required |
| GET | `/api/notifications/unread-count` | عدد غير المقروءة | Required |
| PATCH | `/api/notifications/:id/read` | تحديد كمقروء | Required |
| PATCH | `/api/notifications/mark-all-read` | تحديد الكل كمقروء | Required |
| DELETE | `/api/notifications/:id` | حذف إشعار | Required |
| DELETE | `/api/notifications/clear` | مسح الكل | Required |

---

## 13. البحث (Search)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/search` | بحث شامل | - |
| GET | `/api/search/suggestions` | اقتراحات البحث | - |
| GET | `/api/search/trending` | الأكثر بحثاً | - |

---

## 14. الكلمات المفتاحية (Keywords/Tags)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/tags` | قائمة الوسوم | - |
| POST | `/api/tags` | إنشاء وسم | Required + Permission |
| PATCH | `/api/tags/:id` | تحديث وسم | Required + Permission |
| DELETE | `/api/tags/:id` | حذف وسم | Required + Permission |
| GET | `/api/keyword/:keyword` | مقالات بكلمة مفتاحية | - |
| POST | `/api/keywords/follow` | متابعة كلمة | Required |
| DELETE | `/api/keywords/unfollow/:tagId` | إلغاء متابعة | Required |
| GET | `/api/keywords/followed` | الكلمات المتابعة | Required |
| POST | `/api/articles/:articleId/tags/:tagId` | ربط وسم بمقال | Required |
| DELETE | `/api/articles/:articleId/tags/:tagId` | فك ربط وسم | Required |
| GET | `/api/articles/:articleId/tags` | وسوم المقال | - |

---

## 15. الشورتس (Shorts)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/shorts` | قائمة الشورتس | - |
| GET | `/api/shorts/featured` | شورتس مميزة | - |
| GET | `/api/shorts/:id` | شورت محدد | - |
| GET | `/api/shorts/slug/:slug` | شورت بالـ slug | - |
| POST | `/api/admin/shorts` | إنشاء شورت | Required + Permission |
| PUT | `/api/admin/shorts/:id` | تحديث شورت | Required + Permission |
| DELETE | `/api/admin/shorts/:id` | حذف شورت | Required + Permission |

---

## 16. القصص (Stories)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/stories` | قائمة القصص | - |
| GET | `/api/stories/:id` | قصة محددة | - |
| POST | `/api/stories` | إنشاء قصة | Required + Permission |
| PUT | `/api/stories/:id` | تحديث قصة | Required + Permission |
| DELETE | `/api/stories/:id` | حذف قصة | Required + Permission |
| POST | `/api/stories/:storyId/follow` | متابعة قصة | Required |
| DELETE | `/api/stories/:storyId/follow` | إلغاء متابعة | Required |
| PUT | `/api/stories/follows/:storyId` | تحديث المتابعة | Required |

---

## 17. الشريط العاجل (Breaking Ticker)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/breaking-ticker/active` | الشريط النشط | - |
| GET | `/api/admin/breaking-ticker/topics` | مواضيع الشريط | Required + Permission |
| GET | `/api/admin/breaking-ticker/topics/:id` | موضوع محدد | Required + Permission |
| POST | `/api/admin/breaking-ticker/topics` | إنشاء موضوع | Required + Permission |
| PATCH | `/api/admin/breaking-ticker/topics/:id` | تحديث موضوع | Required + Permission |
| DELETE | `/api/admin/breaking-ticker/topics/:id` | حذف موضوع | Required + Permission |
| POST | `/api/admin/breaking-ticker/topics/:id/activate` | تفعيل موضوع | Required + Permission |
| POST | `/api/admin/breaking-ticker/topics/:id/deactivate` | تعطيل موضوع | Required + Permission |
| POST | `/api/admin/breaking-ticker/headlines` | إضافة عنوان | Required + Permission |
| PATCH | `/api/admin/breaking-ticker/headlines/:id` | تحديث عنوان | Required + Permission |
| DELETE | `/api/admin/breaking-ticker/headlines/:id` | حذف عنوان | Required + Permission |

---

## 18. النشرات البريدية (Newsletters)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/newsletter/subscribe` | الاشتراك | - |
| POST | `/api/newsletter/unsubscribe` | إلغاء الاشتراك | - |
| GET | `/api/newsletter/subscriptions` | قائمة الاشتراكات | Required + Permission |
| DELETE | `/api/newsletter/subscriptions/:id` | حذف اشتراك | Required + Permission |
| GET | `/api/admin/newsletter/campaigns` | حملات النشرة | Required + Permission |
| POST | `/api/admin/newsletter/campaigns` | إنشاء حملة | Required + Permission |
| POST | `/api/admin/newsletter/campaigns/:id/send` | إرسال حملة | Required + Permission |

---

## 19. التقويم والتذكيرات (Calendar)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/calendar` | الأحداث | Required |
| POST | `/api/calendar` | إنشاء حدث | Required |
| PATCH | `/api/calendar/:id` | تحديث حدث | Required |
| DELETE | `/api/calendar/:id` | حذف حدث | Required |
| GET | `/api/calendar/reminders` | التذكيرات | Required |
| POST | `/api/calendar/reminders` | إنشاء تذكير | Required |
| PATCH | `/api/calendar/reminders/:id` | تحديث تذكير | Required |
| DELETE | `/api/calendar/reminders/:id` | حذف تذكير | Required |

---

## 20. المهام (Tasks)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/tasks` | قائمة المهام | Required |
| POST | `/api/tasks` | إنشاء مهمة | Required |
| GET | `/api/tasks/:id` | مهمة محددة | Required |
| PATCH | `/api/tasks/:id` | تحديث مهمة | Required |
| DELETE | `/api/tasks/:id` | حذف مهمة | Required |
| GET | `/api/subtasks` | المهام الفرعية | Required |
| POST | `/api/subtasks` | إنشاء مهمة فرعية | Required |
| PATCH | `/api/subtasks/:id` | تحديث مهمة فرعية | Required |
| DELETE | `/api/subtasks/:id` | حذف مهمة فرعية | Required |
| GET | `/api/task-comments` | تعليقات المهام | Required |
| POST | `/api/task-comments` | إضافة تعليق | Required |
| DELETE | `/api/task-comments/:id` | حذف تعليق | Required |
| POST | `/api/task-attachments` | إضافة مرفق | Required |
| DELETE | `/api/task-attachments/:id` | حذف مرفق | Required |

---

## 21. الاختبارات A/B (A/B Tests)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/ab-tests` | قائمة الاختبارات | Required + Permission |
| GET | `/api/ab-tests/:id` | اختبار محدد | Required + Permission |
| POST | `/api/ab-tests` | إنشاء اختبار | Required + Permission |
| PATCH | `/api/ab-tests/:id` | تحديث اختبار | Required + Permission |
| DELETE | `/api/ab-tests/:id` | حذف اختبار | Required + Permission |
| GET | `/api/ab-tests/:id/variants` | نسخ الاختبار | Required + Permission |
| GET | `/api/ab-tests/:id/analytics` | تحليلات الاختبار | Required + Permission |
| GET | `/api/ab-tests/assign/:experimentId` | تعيين للاختبار | - |

---

## 22. النسخة الإنجليزية (English Version)

### المقالات
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/en/articles` | المقالات الإنجليزية | - |
| GET | `/api/en/articles/:slug` | مقال محدد | - |
| GET | `/api/en/categories` | التصنيفات الإنجليزية | - |
| GET | `/api/en/homepage` | الصفحة الرئيسية | - |
| POST | `/api/en/dashboard/articles` | إنشاء مقال | Required |
| PUT | `/api/en/dashboard/articles/:id` | تحديث مقال | Required |
| DELETE | `/api/en/dashboard/articles/:id` | حذف مقال | Required |
| PATCH | `/api/en/dashboard/articles/:id/toggle-featured` | تبديل التمييز | Required + Permission |

---

## 23. النسخة الأردية (Urdu Version)

### المقالات
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/ur/articles` | المقالات الأردية | - |
| GET | `/api/ur/articles/:slug` | مقال محدد | - |
| GET | `/api/ur/homepage` | الصفحة الرئيسية | - |
| POST | `/api/ur/dashboard/articles` | إنشاء مقال | Required |
| PUT | `/api/ur/dashboard/articles/:id` | تحديث مقال | Required |
| DELETE | `/api/ur/dashboard/articles/:id` | حذف مقال | Required |

---

## 24. iFox (الذكاء الاصطناعي)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/ifox/articles` | مقالات iFox | - |
| GET | `/api/ifox/categories` | تصنيفات iFox | - |
| GET | `/api/ifox/home-featured` | المميزة للصفحة | - |
| GET | `/api/admin/ifox/media` | وسائط iFox | Required + Permission |
| POST | `/api/admin/ifox/media` | رفع وسيط | Required + Permission |
| DELETE | `/api/admin/ifox/media/:id` | حذف وسيط | Required + Permission |
| GET | `/api/admin/ifox/schedule` | جدولة iFox | Required + Permission |
| POST | `/api/admin/ifox/schedule` | إنشاء جدولة | Required + Permission |
| DELETE | `/api/admin/ifox/schedule/:id` | حذف جدولة | Required + Permission |
| GET | `/api/admin/ifox/settings` | إعدادات iFox | Required + Permission |
| PUT | `/api/admin/ifox/settings` | تحديث الإعدادات | Required + Permission |

---

## 25. المقترحات والأفكار (Muqtarab)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/admin/muqtarab/topics` | المواضيع | Required + Permission |
| GET | `/api/admin/muqtarab/topics/:id` | موضوع محدد | Required + Permission |
| POST | `/api/admin/muqtarab/topics` | إنشاء موضوع | Required + Permission |
| PATCH | `/api/admin/muqtarab/topics/:id` | تحديث موضوع | Required + Permission |
| DELETE | `/api/admin/muqtarab/topics/:id` | حذف موضوع | Required + Permission |
| GET | `/api/admin/muqtarab/angles` | الزوايا | Required + Permission |
| POST | `/api/admin/muqtarab/angles` | إنشاء زاوية | Required + Permission |
| PUT | `/api/admin/muqtarab/angles/:id` | تحديث زاوية | Required + Permission |
| DELETE | `/api/admin/muqtarab/angles/:id` | حذف زاوية | Required + Permission |

---

## 26. الرادار (Mirqab)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/mirqab/radar` | الرادار | Required + Permission |
| POST | `/api/mirqab/radar` | إضافة للرادار | Required + Permission |
| PUT | `/api/mirqab/radar/:id` | تحديث | Required + Permission |
| DELETE | `/api/mirqab/radar/:id` | حذف | Required + Permission |
| GET | `/api/mirqab/entries` | المدخلات | Required + Permission |
| POST | `/api/mirqab/entries` | إضافة مدخل | Required + Permission |
| DELETE | `/api/mirqab/entries/:id` | حذف مدخل | Required + Permission |
| GET | `/api/mirqab/next-stories` | القصص القادمة | Required + Permission |
| POST | `/api/mirqab/next-stories` | إضافة قصة | Required + Permission |
| PUT | `/api/mirqab/next-stories/:id` | تحديث قصة | Required + Permission |
| DELETE | `/api/mirqab/next-stories/:id` | حذف قصة | Required + Permission |
| GET | `/api/mirqab/algorithm-writes` | كتابات الخوارزمية | Required + Permission |
| POST | `/api/mirqab/algorithm-writes` | إضافة كتابة | Required + Permission |
| PUT | `/api/mirqab/algorithm-writes/:id` | تحديث كتابة | Required + Permission |
| DELETE | `/api/mirqab/algorithm-writes/:id` | حذف كتابة | Required + Permission |
| GET | `/api/mirqab/sabq-index` | مؤشر سبق | Required + Permission |
| POST | `/api/mirqab/sabq-index` | إضافة للمؤشر | Required + Permission |
| PUT | `/api/mirqab/sabq-index/:id` | تحديث المؤشر | Required + Permission |
| DELETE | `/api/mirqab/sabq-index/:id` | حذف من المؤشر | Required + Permission |

---

## 27. التحليل العميق (Deep Analysis)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/deep-analysis` | قائمة التحليلات | Required + Permission |
| GET | `/api/deep-analysis/:id` | تحليل محدد | Required + Permission |
| POST | `/api/deep-analysis` | إنشاء تحليل | Required + Permission |
| PUT | `/api/deep-analysis/:id` | تحديث تحليل | Required + Permission |
| DELETE | `/api/deep-analysis/:id` | حذف تحليل | Required + Permission |

---

## 28. الموجز الصوتي (Audio Briefs)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/audio-briefs` | قائمة الموجزات | - |
| GET | `/api/audio-briefs/:id` | موجز محدد | - |
| POST | `/api/audio-briefs` | إنشاء موجز | Required + Permission |
| PUT | `/api/audio-briefs/:id` | تحديث موجز | Required + Permission |
| DELETE | `/api/audio-briefs/:id` | حذف موجز | Required + Permission |

---

## 29. النشرة الصوتية (Audio Newsletters)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/audio-newsletters` | قائمة النشرات | Required + Permission |
| GET | `/api/audio-newsletters/:id` | نشرة محددة | Required + Permission |
| POST | `/api/audio-newsletters` | إنشاء نشرة | Required + Permission |
| PUT | `/api/audio-newsletters/:id` | تحديث نشرة | Required + Permission |
| DELETE | `/api/audio-newsletters/:id` | حذف نشرة | Required + Permission |
| POST | `/api/audio-newsletters/:id/articles` | إضافة مقالات | Required + Permission |
| DELETE | `/api/audio-newsletters/:id/articles/:articleId` | حذف مقال | Required + Permission |

---

## 30. ElevenLabs (الأصوات)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/elevenlabs/voices` | قائمة الأصوات | Required + Permission |
| POST | `/api/elevenlabs/voices` | إنشاء صوت | Required + Permission |
| PUT | `/api/elevenlabs/voices/:voiceId` | تحديث صوت | Required + Permission |
| DELETE | `/api/elevenlabs/voices/:voiceId` | حذف صوت | Required + Permission |
| POST | `/api/elevenlabs/generate` | توليد صوت | Required + Permission |

---

## 31. التواصل (Contact)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/contact` | إرسال رسالة | - |
| GET | `/api/admin/contact-messages` | قائمة الرسائل | Required + Permission |
| GET | `/api/admin/contact-messages/:id` | رسالة محددة | Required + Permission |
| PATCH | `/api/admin/contact-messages/:id` | تحديث الحالة | Required + Permission |
| DELETE | `/api/admin/contact-messages/:id` | حذف رسالة | Required + Permission |
| POST | `/api/contact-messages/:id/reply` | الرد على رسالة | Required + Permission |

---

## 32. الروابط المختصرة (Shortlinks)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/shortlinks/article/:articleId` | رابط مختصر للمقال | - |
| GET | `/api/s/:code` | تحويل الرابط المختصر | - |

---

## 33. الكاش والتحديث (Cache)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/admin/cache/purge-homepage` | مسح كاش الصفحة | Required + Permission |
| POST | `/api/admin/cache/purge-breaking` | مسح كاش العاجل | Required + Permission |
| POST | `/api/admin/cache/purge-article/:slug` | مسح كاش مقال | Required + Permission |
| POST | `/api/admin/cache/purge-all` | مسح كل الكاش | Required + Permission |
| GET | `/api/cache-invalidation/stream` | بث تحديثات الكاش (SSE) | - |

---

## 34. المحفظة الرقمية (Wallet/Passes)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/wallet/loyalty/issue` | إصدار بطاقة ولاء | Required |
| POST | `/api/wallet/press/issue` | إصدار بطاقة صحفية | Required + Permission |
| POST | `/api/wallet/v1/devices/:deviceLibraryId/registrations/:passTypeId/:serialNumber` | تسجيل جهاز | - |
| DELETE | `/api/wallet/v1/devices/:deviceLibraryId/registrations/:passTypeId/:serialNumber` | إلغاء تسجيل | - |
| GET | `/api/wallet/v1/devices/:deviceLibraryId/registrations/:passTypeId` | البطاقات المسجلة | - |
| GET | `/api/wallet/v1/passes/:passTypeId/:serialNumber` | جلب البطاقة | - |

---

## 35. الكيانات الذكية (Smart Entities)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/smart-entities` | قائمة الكيانات | - |
| GET | `/api/smart-entities/:id` | كيان محدد | - |
| POST | `/api/smart-entities` | إنشاء كيان | Required + Permission |
| PATCH | `/api/smart-entities/:id` | تحديث كيان | Required + Permission |
| DELETE | `/api/smart-entities/:id` | حذف كيان | Required + Permission |

---

## 36. الإعلانات الداخلية (Announcements)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/dashboard/announcements` | الإعلانات للمحرر | Required |
| POST | `/api/dashboard/announcements/:id/dismiss` | إخفاء إعلان | Required |
| GET | `/api/admin/announcements` | كل الإعلانات | Required + Permission |
| POST | `/api/admin/announcements` | إنشاء إعلان | Required + Permission |
| PATCH | `/api/admin/announcements/:id` | تحديث إعلان | Required + Permission |
| DELETE | `/api/admin/announcements/:id` | حذف إعلان | Required + Permission |

---

## 37. السمات (Themes)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/themes` | قائمة السمات | Required + Permission |
| GET | `/api/themes/active` | السمة النشطة | - |
| GET | `/api/themes/:id` | سمة محددة | Required + Permission |
| POST | `/api/themes` | إنشاء سمة | Required + Permission |
| PATCH | `/api/themes/:id` | تحديث سمة | Required + Permission |
| DELETE | `/api/themes/:id` | حذف سمة | Required + Permission |
| POST | `/api/themes/:id/activate` | تفعيل سمة | Required + Permission |
| POST | `/api/themes/:id/duplicate` | نسخ سمة | Required + Permission |
| POST | `/api/themes/:id/publish` | نشر سمة | Required + Permission |
| POST | `/api/themes/:id/rollback` | استعادة سمة | Required + Permission |

---

## 38. سجل النشاط (Activity Logs)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/activities` | نشاط المستخدم | Required |
| GET | `/api/admin/activity-logs` | كل السجلات | Required + Permission |
| GET | `/api/admin/activity-logs/analytics` | تحليلات السجلات | Required + Permission |
| GET | `/api/admin/activity-logs/:id` | سجل محدد | Required + Permission |

---

## 39. إمكانية الوصول (Accessibility)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/accessibility/recent` | الإعدادات الأخيرة | Required |
| GET | `/api/accessibility/stats` | إحصائيات الوصول | Required |
| POST | `/api/accessibility/log` | تسجيل استخدام | Required |

---

## 40. الإحصائيات ولوحة المعلومات (Stats & Dashboard)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/dashboard/stats` | إحصائيات المحرر | Required |
| GET | `/api/admin/dashboard/stats` | إحصائيات الإدارة | Required + Permission |
| GET | `/api/news/analytics` | تحليلات الأخبار | - |
| GET | `/api/news/stats` | إحصائيات الأخبار | - |
| GET | `/api/ai-metrics` | مقاييس الذكاء الاصطناعي | - |

---

## ملاحظات هامة

### المصادقة (Authentication)
- **Required**: يتطلب تسجيل دخول (Session Cookie أو Bearer Token)
- **Required + Permission**: يتطلب تسجيل دخول + صلاحية محددة
- **-**: لا يتطلب مصادقة

### رموز الحالة (Status Codes)
| Code | Description |
|------|-------------|
| 200 | نجاح |
| 201 | تم الإنشاء |
| 400 | طلب غير صالح |
| 401 | غير مصرح |
| 403 | ممنوع |
| 404 | غير موجود |
| 429 | طلبات كثيرة |
| 500 | خطأ في الخادم |

### معدل الطلبات (Rate Limiting)
- المصادقة: 5 طلبات/دقيقة
- الرفع: 10 طلبات/دقيقة
- عام: 100 طلب/دقيقة

### التخزين المؤقت (Caching)
- الصفحة الرئيسية: 60 ثانية
- المقالات: 300 ثانية
- التصنيفات: 600 ثانية

---

*آخر تحديث: يناير 2026*
*إجمالي نقاط النهاية: 834+*
