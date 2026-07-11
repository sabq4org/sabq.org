# Google Analytics (GA4) في مشروع سبق

كيف نضع كود Google في المشروع وكيف تُرصد **مشاهدات الصفحات** والأحداث عبر الويب وiOS وAndroid.

> **معرّف القياس (Measurement ID):** `G-EEB5593GY7`  
> **خاصية GA4:** Sabq GA3 - GA4  
> الأحداث موحّدة الأسماء عبر المنصات حتى تظهر معاً في: **Reports → Engagement → Events**.

---

## 1) الويب (sabq.org) — المصدر الأساسي لمشاهدات الصفحات

الويب تطبيق SPA (React + Wouter). تحميل الصفحة مرة واحدة لا يكفي؛ لازم نرسل `page_view` عند كل تغيير مسار.

### أ) تحميل مكتبة gtag في HTML

الملف: [`client/index.html`](../../client/index.html)

```html
<!-- Google Analytics GA4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-EEB5593GY7" data-cfasync="false"></script>
<script data-cfasync="false">
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-EEB5593GY7', {
    send_page_view: false,   // مهم: لا ترسل page_view تلقائياً
    cookie_flags: 'SameSite=None;Secure'
  });
</script>
```

| الإعداد | لماذا |
|--------|--------|
| `async` | لا يوقف تحليل الصفحة |
| `data-cfasync="false"` | يمنع Cloudflare Rocket Loader من تأخير السكربت |
| `send_page_view: false` | يمنع العدّ المزدوج؛ الـ SPA يرسل المشاهدات يدوياً |

> لا تُرجع `send_page_view` إلى `true` وأنت تستخدم `useAnalytics` — ستُحسب الزيارة الأولى مرتين.

### ب) رصد كل تغيير مسار (page views)

الملف: [`client/src/hooks/use-analytics.tsx`](../../client/src/hooks/use-analytics.tsx)  
يُستدعى مرة واحدة من [`client/src/App.tsx`](../../client/src/App.tsx) داخل `Router()`:

```ts
function Router() {
  useAnalytics(); // ← مصدر واحد لكل page_view
  return ( ... );
}
```

الـ hook يرسل عند كل تغيير في مسار Wouter:

```ts
gtag("event", "page_view", {
  send_to: "G-EEB5593GY7",
  page_path: location,          // مثال: /article/slug
  page_title: document.title,
  page_location: window.location.href,
});
```

هذا يغطي: الرئيسية، التصنيفات، المقالات، البحث، لحظة بلحظة، لوحة التحكم، إلخ — طالما التنقل داخل الـ SPA.

### ج) أحداث المحتوى (ليست page_view)

الملف: [`client/src/lib/analytics.ts`](../../client/src/lib/analytics.ts)

| الدالة | الحدث في GA4 | متى تُستدعى |
|--------|--------------|-------------|
| `trackArticleView` | `article_view` | فتح مقال خبر |
| `trackOpinionView` | `opinion_view` | فتح مقال رأي |
| `trackArticleLike` | `article_like` | إعجاب |
| `trackArticleComment` | `article_comment` | تعليق |
| `trackBookmarkToggle` | `bookmark_toggle` | حفظ |
| `trackShare` | `share` | مشاركة |
| `trackSearch` | `search` | بحث |
| `trackLogin` | `login` | تسجيل دخول |

مثال من صفحة المقال:

```ts
import { trackArticleView } from "@/lib/analytics";
trackArticleView(article.id, article.title, categoryName);
```

### د) Google Tag Manager (GTM) — منفصل عن page views

في نفس `client/index.html` يوجد أيضاً **GTM** (`GTM-T5PW84LM`) ويُحمَّل مؤجّلاً بعد تفاعل المستخدم أو إشارة المحتوى (للأداء والإعلانات).

- **مشاهدات الصفحات** تعتمد على **gtag المباشر** + `useAnalytics` أعلاه.
- **GTM** للأحداث/التاجات الإعلانية والطرف الثالث — لا تعتمد عليه وحده لعدّ page views في الـ SPA.

---

## 2) إضافة رصد صفحة جديدة على الويب

1. تأكد أن المسار داخل `Router` في `App.tsx` (أي مسار Wouter يمرّ تلقائياً بـ `useAnalytics`).
2. حدّث `document.title` للصفحة إن أمكن — يظهر في `page_title`.
3. إن كانت الصفحة «محتوى» (مقال/رأي) أضف حدثاً من `analytics.ts` بالإضافة إلى `page_view`.
4. لا تضف سكربت gtag جديداً في الصفحة — السكربت العام في `index.html` كافٍ.

للتحقق محلياً:

1. افتح DevTools → Network → صفِّ بـ `google-analytics` أو `collect`.
2. أو ثبّت [Google Analytics Debugger](https://chrome.google.com/webstore) وراقب Console.
3. في GA4: **Admin → DebugView** (أو Realtime) أثناء التصفح.

---

## 3) iOS — Measurement Protocol (بدون Firebase SDK)

الملف: [`sabq app ios/sabq/Services/SabqAnalytics.swift`](../../sabq%20app%20ios/sabq/Services/SabqAnalytics.swift)

- يرسل HTTPS POST إلى `https://www.google-analytics.com/mp/collect`.
- الإعداد من Info.plist / Build Settings:
  - `GA4_MEASUREMENT_ID` → مثل `G-EEB5593GY7`
  - `GA4_API_SECRET` → من GA Admin → Data Streams → Measurement Protocol API secrets
- إن نقص أحدهما: الاستدعاءات تصبح no-op بصمت.

مشاهدات الشاشات:

```swift
SabqAnalytics.screen("ArticleDetail", screenClass: "ArticleDetailView")
// أو عبر المُعدِّل:
.sabqScreen("HomeFeed")
```

أحداث المحتوى بنفس أسماء الويب: `articleView`, `opinionView`, `login`, …

---

## 4) Android — نفس بروتوكول القياس

الملف: [`android-native/.../analytics/SabqAnalytics.kt`](../../android-native/app/src/main/kotlin/com/sabq/smart/data/analytics/SabqAnalytics.kt)

- مرآة 1:1 لـ iOS (نفس أسماء الأحداث والمعاملات).
- يُفعَّل مرة عند الإقلاع: `SabqAnalytics.start(...)` من `SabqApplication`.
- المفاتيح من `BuildConfig` (Measurement ID + API Secret).

```kotlin
SabqAnalytics.screen("Home")
SabqAnalytics.articleView(id, title, category)
```

---

## 5) خريطة سريعة

```
المتصفح
  └─ client/index.html          → يحمّل gtag.js + config (بدون page_view تلقائي)
  └─ App.tsx → useAnalytics()   → page_view عند كل تغيير مسار SPA
  └─ lib/analytics.ts           → أحداث المحتوى (article_view, search, …)

iOS
  └─ SabqAnalytics.swift        → MP/collect + screen_view / article_view / …

Android
  └─ SabqAnalytics.kt           → نفس MP/collect ونفس أسماء الأحداث
```

---

## 6) قواعد لا تكسر الرصد

1. **لا** تضع `send_page_view: true` في `index.html` مع بقاء `useAnalytics`.
2. **لا** تستدعِ `gtag('config', …)` مرة ثانية في صفحات فردية بدون حاجة.
3. عند إضافة حدث جديد: سمِّه بنفس الاسم على الويب وiOS وAndroid، وحدّث الثلاثة معاً.
4. Measurement ID ثابت في الكود حالياً (`G-EEB5593GY7`) — أي تغيير يجب أن يشمل `index.html` + `use-analytics.tsx` (+ أسرار الموبايل).
5. صفحات SSR في `web-next/` لا تضمّن gtag حالياً؛ الزائر ينتقل للـ SPA أو يُحسب عند التحميل الكامل حسب مسار النشر — لا تفترض page_view من Next وحده.

---

## 7) أين ترى النتائج في Google Analytics

| ما تريد رؤيته | أين في GA4 |
|---------------|------------|
| مشاهدات الصفحات الحية | Reports → Realtime |
| مسارات الصفحات | Reports → Engagement → Pages and screens |
| أحداث مخصّصة (`article_view`…) | Reports → Engagement → Events |
| تصحيح أثناء التطوير | Admin → DebugView |

---

## 8) إضافة Google Analytics لتطبيق VARA (iOS)

التطبيق: `sports app ios/SabqSports` (Bundle ID: `com.sabq.sports`).  
**اليوم لا يوجد أي رصد GA في VARA** — هذا القسم خطة الإضافة المعتمدة.

### القرار الموصى به

اتبع **نفس أسلوب تطبيق سبق الأم**: Measurement Protocol عبر HTTPS (بدون Firebase SDK).

| الخيار | متى تستخدمه |
|--------|-------------|
| **Measurement Protocol** (مثل `SabqAnalytics.swift`) | الرصد الداخلي للصفحات/الأحداث + خصوصية أعلى + بدون ATT/SDK ثقيل — **الموصى به لـ VARA** |
| Firebase Analytics SDK | إذا احتجت حملات Google Ads للتطبيق أو Audience في Firebase |

لا تخلط بيانات VARA مع سكربت ويب `sabq.org` (`G-EEB5593GY7` في `index.html`) دون قرار صريح — الأفضل **Data Stream منفصل** لتطبيق VARA داخل نفس خاصية GA4 أو خاصية مستقلة.

### خطوات الإعداد في Google Analytics

1. افتح GA4 → **Admin → Data streams → Add stream → iOS app**.
2. Bundle ID: `com.sabq.sports`، اسم التطبيق: `VARA`.
3. انسخ **Measurement ID** (شكل `G-XXXXXXXX`).
4. من إعدادات الـ stream → **Measurement Protocol API secrets** → أنشئ سراً وانسخه.
5. (اختياري) اربط Google Ads لاحقاً إن صارت حملات تثبيت.

### خطوات التنفيذ في كود VARA

1. **انسخ** منطق [`sabq app ios/sabq/Services/SabqAnalytics.swift`](../../sabq%20app%20ios/sabq/Services/SabqAnalytics.swift) إلى مثلاً:
   - `sports app ios/SabqSports/Services/VaraAnalytics.swift`
2. غيّر مفتاح `client_id` في UserDefaults إلى شيء خاص بـ VARA (مثل `vara_ga4_client_id`) حتى لا يختلط مع تثبيت سبق على نفس الجهاز.
3. أضف في `SabqSports/Info.plist` (أو Build Settings → Info):

```xml
<key>GA4_MEASUREMENT_ID</key>
<string>$(GA4_MEASUREMENT_ID)</string>
<key>GA4_API_SECRET</key>
<string>$(GA4_API_SECRET)</string>
```

وضع القيم الحقيقية في `.xcconfig` / Secrets CI — **لا ترفع الـ API Secret إلى Git علناً**.

4. **رصد الشاشات** عند الظهور:

```swift
.sabqScreen("Home")           // إن نسخت المُعدِّل كما في سبق
// أو:
VaraAnalytics.screen("MatchCenter", screenClass: "MatchCenterView")
```

5. **أحداث VARA المقترحة** (أسماء ثابتة للتقارير):

| الحدث | متى |
|-------|-----|
| `screen_view` | كل شاشة رئيسية |
| `match_view` | فتح مركز مباراة |
| `prediction_submit` | إرسال توقّع VARA |
| `team_follow` | متابعة فريق |
| `snap_impression` / `snap_tap` / `snap_push_open` | اللقطات الذكية (انظر `docs/VARA_SMART_SNAPS_PLAN.md`) |
| `login` | دخول بعضوية سبق |
| `notification_open` | فتح إشعار مباراة |

6. عند تسجيل الدخول: `VaraAnalytics.setUserId(memberId)` — وامسحه عند الخروج.

### التحقق

1. ابنِ Debug مع المفاتيح مضبوطة (`debug_mode = 1` كما في سبق).
2. GA4 → **Admin → DebugView** أثناء فتح الشاشات.
3. أو Realtime بعد دقائق من Build إنتاجي.

### ما لا تفعله

- لا تلصق سكربت `gtag` من الويب داخل تطبيق iOS.
- لا تستخدم Measurement ID الخاص بـ sabq.org للويب كبديل عن stream تطبيق VARA إن أردت فصل التقارير.
- لا تضع `GA4_API_SECRET` داخل الكود المصدري أو PR عام.

### تقدير الجهد

- نسخ الخدمة + المفاتيح + `screen` على 5–8 شاشات أساسية: نصف يوم.
- أحداث التوقّعات/المباريات/اللقطات: يوم إضافي حسب الأولوية.

---

*آخر تحديث: 2026-07-11 — يعكس الكود الحالي في المستودع.*
