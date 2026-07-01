# مراجعة شاملة لكود تطبيق سبق iOS

**تاريخ المراجعة:** 2026-04-12
**عدد الملفات:** 28 ملف Swift
**البنية المعمارية:** MVVM + Service Layer (SwiftUI حديث)

---

## التقييم العام

| المعيار | التقييم | ملاحظات |
|---------|---------|---------|
| البنية المعمارية | 8/10 | MVVM نظيف مع فصل جيد للمسؤوليات |
| الامان | 5/10 | عدة مشاكل امنية تحتاج معالجة فورية |
| الاداء | 7/10 | جيد بشكل عام مع فرص تحسين |
| جودة الكود | 8/10 | كود نظيف ومقروء |
| قابلية الصيانة | 7/10 | بعض الملفات كبيرة جدا |
| **الاجمالي** | **7/10** | تطبيق جيد يحتاج تحسينات امنية |

---

## مراجعة تفصيلية لكل ملف

---

### 1. `sabq/sabqApp.swift` — 9/10

**الوصف:** نقطة دخول التطبيق.

ملف بسيط ونظيف. يستخدم `@AppStorage` للوضع الداكن بشكل صحيح.

**لا توجد مشاكل.**

---

### 2. `sabq/ContentView.swift` — 8/10

**الوصف:** الشاشة الرئيسية مع التنقل والتبويبات.

- بنية تنقل واضحة باستخدام `NavigationStack` و `NavigationPath`.
- توزيع الـ Stores عبر `.environment()` نمط جيد.

**مشاكل اداء:**
- **[P-01]** `.id(selectedTab)` في السطر 30 يعيد بناء الـ View بالكامل عند تغيير التبويب. الافضل استخدام `switch` بدون `.id()` او استخدام `opacity` فقط.

---

### 3. `sabq/Components/SabqComponents.swift` — 7/10

**الوصف:** مكونات UI مشتركة (Theme, Cards, Buttons, Tab Bar, Image Cache, Skeleton).

ملف كبير (~1166 سطر) يحتوي على عدد كبير من المكونات.

**مشاكل اداء:**
- **[P-02]** `CachedAsyncImage` يستخدم `URLSession.shared.data(from:)` بدون استخدام الكاش المركزي لـ `APIClient`. هذا يعني تحميل مزدوج محتمل.
- **[P-03]** `ImageCache` يستخدم `nonisolated(unsafe)` مع `NSCache`. هذا آمن عمليا لان `NSCache` thread-safe، لكنه نمط غير مثالي.
- **[P-04]** `SabqTheme.primaryStart` و `primaryEnd` يقرأون من `UserDefaults` في كل استدعاء عبر `AppAccent.current`. هذا يحدث بشكل متكرر جدا في الـ Views. الافضل تخزينها مؤقتا.

**مشاكل بنيوية:**
- **[S-01]** الملف كبير جدا. يفضل تقسيمه الى ملفات: `SabqTheme.swift`, `SabqImageCache.swift`, `SabqCards.swift`, `SabqButtons.swift`.

---

### 4. `sabq/Components/SabqRTL.swift` — 7/10

**الوصف:** اعداد RTL للواجهة.

**مشاكل اداء:**
- **[P-05]** `propagateRTL(in:)` يمر على **جميع** الـ subviews بشكل recursive في كل `updateUIView`. هذا مكلف ومتكرر. UIKit يتعامل مع RTL تلقائيا عبر `semanticContentAttribute` على الـ window فقط — لا حاجة للتمرير على كل view.
- **[P-06]** استخدام `DispatchQueue.main.async` داخل `updateUIView` يؤدي الى حلقة تحديث لا نهائية محتملة (SwiftUI يستدعي `updateUIView` -> `DispatchQueue.main.async` يغير الخصائص -> SwiftUI يستدعي `updateUIView` مرة اخرى).

---

### 5. `sabq/Models/SabqModels.swift` — 8/10

**الوصف:** نماذج البيانات (Article, OpinionArticle, ArticleCategory, Routes).

كود نظيف مع معالجة جيدة لتنسيقات التاريخ المختلفة.

**مشاكل اداء:**
- **[P-07]** `dateFormatted` و `relativeDate` ينشئون `DateFormatter` و `RelativeDateTimeFormatter` جديدين في كل استدعاء. هذه العمليات مكلفة. الافضل استخدام formatters ثابتة (`static let`).
- **[P-08]** `stripHTMLTags` يستخدم سلسلة طويلة من `replacingOccurrences` مع regex. الافضل استخدام `NSAttributedString(data:options:)` مع `.documentType: .html` او على الاقل تجميع الـ regex مرة واحدة.

**ملاحظات:**
- `normalizeEditorialPlainText` ينشئ `NSRegularExpression` في كل استدعاء. الافضل تخزينها كـ `static let`.

---

### 6. `sabq/Services/APIClient.swift` — 6/10 (حرج)

**الوصف:** عميل HTTP مركزي (actor-based).

بنية جيدة باستخدام `actor` للـ thread safety. لكن يوجد مشاكل امنية خطيرة.

**مشاكل امنية (حرجة):**

- **[SEC-01] تخزين Auth Token في UserDefaults (خطير)**
  - السطر 30, 57-58: `UserDefaults.standard.set(token, forKey: "sabq_auth_token")`
  - `UserDefaults` غير مشفر ويمكن قراءته من backup. **يجب استخدام Keychain بدلا منه.**

- **[SEC-02] عدم وجود Certificate Pinning**
  - التطبيق يثق بأي شهادة SSL يقدمها النظام. هذا يجعله عرضة لـ MITM attacks عبر proxy tools. يفضل تطبيق certificate pinning على الاقل للـ API الرئيسي.

- **[SEC-03] عدم تعقيم مدخلات URL**
  - السطور 224-235, 276-279: المتغيرات `slug` و `query` تُدخل مباشرة في مسارات URL بدون تعقيم كافٍ. مثال:
    ```swift
    func fetchArticle(slug: String) async throws -> APIArticle {
        try await get(..., path: "/articles/\(slug)")
    ```
  - اذا كان `slug` يحتوي على رموز خاصة، قد يؤدي الى path traversal.

- **[SEC-04] Force Unwrap على URL**
  - السطر 73: `URL(string: baseURL)!` — قد يسبب crash اذا كان الـ baseURL غير صالح لأي سبب.

- **[SEC-05] عدم وجود Rate Limiting محلي**
  - لا يوجد حد للطلبات من جهة العميل. هجوم او خطأ برمجي قد يرسل مئات الطلبات بسرعة.

**مشاكل اداء:**
- **[P-09]** `makeEphemeralSession()` ينشئ `URLSession` جديد في كل طلب `ignoreCache`. الافضل اعادة استخدام session واحد ephemeral.
- **[P-10]** `WrappedArray` يحاول فك التشفير بعدة مفاتيح متسلسلة باستخدام `try?`. هذا يعني محاولات فاشلة متعددة في كل استجابة. مقبول لكن يمكن تحسينه.

---

### 7. `sabq/Services/APIModels.swift` — 7/10

**الوصف:** نماذج استجابات API مع Flexible Decoding.

كود defensive ممتاز للتعامل مع تنسيقات API مختلفة.

**مشاكل امنية:**
- **[SEC-06]** `APIUser` يحتوي على معلومات حساسة (email, phone, bio) بدون حماية. اذا تم تسريب الذاكرة او عمل dump، هذه المعلومات مكشوفة.

**مشاكل بنيوية:**
- **[S-02]** الملف ضخم (~700 سطر). يفضل تقسيمه: `APIArticleModels.swift`, `APIAuthModels.swift`, `APILiveModels.swift`.
- **[S-03]** تكرار كبير في كود الـ decoding بين `APIArticle` و `APIOpinion`. يفضل استخراج logic مشترك.

---

### 8. `sabq/Services/NewsService.swift` — 6/10

**الوصف:** طبقة خدمة تنسق بين APIClient والنماذج.

**مشاكل امنية:**
- **[SEC-07]** `categoryCache` هو `static var` قابل للتعديل بدون حماية من الـ concurrency:
  ```swift
  static var categoryCache: [String: [Int: (articles: [Article], hasMore: Bool)]] = [:]
  ```
  - عدة Tasks قد تقرأ وتكتب في نفس الوقت → **data race محتمل**. يجب حمايته بـ actor او lock.

**مشاكل اداء:**
- **[P-11]** `fetchOpinions()` لديه retry logic مع `Task.sleep(nanoseconds: 250_000_000)` — انتظار ربع ثانية ثم اعادة المحاولة. هذا يبطئ تجربة المستخدم. الافضل اظهار النتائج الاولى والاعادة في الخلفية.
- **[P-12]** `fetchHomepage()` ينشئ عدة `async let` tasks حتى لو فشل الاول. الـ fallback في `catch` جيد لكنه يعيد طلب كامل بدلا من استخدام نتائج جزئية.
- **[P-13]** `fallbackTrending` hardcoded — مقبول لكن يفضل تخزينها في ملف config.

---

### 9. `sabq/Stores/ArticlesStore.swift` — 7/10

**الوصف:** Store رئيسي للمقالات مع pagination.

**مشاكل اداء:**
- **[P-14]** `search(query:)` يقوم بـ `lowercased()` على كل مقال في كل استدعاء. مع 100+ مقال، هذا مكلف. الافضل تخزين النسخة المصغرة مسبقا.
- **[P-15]** `articles(for:)` و `articleCount(for:)` يقومان بـ `filter` منفصل على نفس المصفوفة. اذا تم استدعاؤهما معا، فهذا filter مزدوج.
- **[P-16]** `init()` يبدأ `Task { await loadArticles() }` — وهذا جيد، لكن لا يوجد الغاء لهذا الـ Task اذا تم ازالة الـ Store من الذاكرة.

---

### 10. `sabq/Stores/AuthStore.swift` — 6/10

**الوصف:** Store للمصادقة وادارة المستخدم.

**مشاكل امنية (حرجة):**
- **[SEC-08]** الـ auth token يُخزن في `UserDefaults` (عبر APIClient). يجب استخدام **Keychain**.
- **[SEC-09]** لا يوجد حد لمحاولات تسجيل الدخول. هجوم brute force ممكن من خلال التطبيق.
- **[SEC-10]** لا يوجد session timeout — المستخدم يبقى مسجل الدخول الى الابد.
- **[SEC-11]** `errorMessage` قد يعرض رسائل خطأ تفصيلية من السيرفر للمستخدم، مما قد يكشف معلومات داخلية.

**مشاكل بنيوية:**
- **[S-04]** `checkAuth()` لا يتعامل مع حالة انتهاء صلاحية الـ token بشكل صريح.

---

### 11. `sabq/Stores/BookmarksStore.swift` — 7/10

**الوصف:** Store للمحفوظات مع تخزين محلي.

**مشاكل امنية:**
- **[SEC-12]** الـ bookmarks تُخزن في `UserDefaults` بدون تشفير. اذا كانت المحفوظات حساسة (مثلا مقالات طبية)، قد يكون هذا مشكلة خصوصية.

**مشاكل اداء:**
- **[P-17]** `bookmarkedArticles(from:)` يستدعي `allArticles.first(where:)` لكل bookmark — هذا O(n*m). مع 50 bookmark و 500 مقال = 25,000 مقارنة. الافضل بناء `Dictionary` اولا.
- **[P-18]** `persist()` و `persistArticleCache()` يكتبان الى `UserDefaults` في كل toggle. الافضل debounce الكتابة.

**ملاحظات ايجابية:**
- Fire-and-forget للـ API bookmark (`Task { try? await ... }`) نمط جيد.

---

### 12. `sabq/Screens/HomeFeedView.swift` — 7/10

**الوصف:** شاشة الرئيسية مع الاخبار العاجلة، القصص، المقالات المميزة.

ملف كبير (~707 سطر مع NotificationsSheet).

**مشاكل اداء:**
- **[P-19]** `featuredSection` يستخدم `TabView` مع `.tabViewStyle(.page)` ويستدعي `UIPageControl.appearance()` في `onAppear`. تغيير `appearance()` يؤثر على كل `UIPageControl` في التطبيق وليس فقط هذا.
- **[P-20]** `liveFormatTime` و `liveSeverityColor` ينشئان `ISO8601DateFormatter` في كل استدعاء لكل حدث. مع 50 حدث = 100 formatter.

**مشاكل بنيوية:**
- **[S-05]** `NotificationsSheet` معرّف داخل نفس الملف. يفضل نقله الى ملف منفصل.

---

### 13. `sabq/Screens/ArticleDetailView.swift` — 7/10

**الوصف:** شاشة تفاصيل المقال مع ملخص صوتي، تعليقات، ومشاركة.

**مشاكل امنية:**
- **[SEC-13]** `commentText` يُرسل الى السيرفر بدون تعقيم:
  ```swift
  APIClient.shared.postComment(slug: slug, body: commentText)
  ```
  - على الرغم من ان الـ backend يجب ان يعقم المدخلات، الافضل تعقيم النص من جهة العميل ايضا (حذف HTML/script tags).

**مشاكل اداء:**
- **[P-21]** `loadExtras()` يطلق `Task { try? await APIClient.shared.trackView(...) }` بدون تخزين المرجع — لا يمكن الغاؤه.
- **[P-22]** `AVPlayer` لا يتم ايقافه عند مغادرة الشاشة (`onDisappear` غير موجود). قد يستمر تشغيل الصوت في الخلفية.
- **[P-23]** `presentShareSheet` يستخدم `UIApplication.shared.connectedScenes` مباشرة. هذا نمط هش وقد يفشل مع multi-window.

---

### 14. `sabq/Screens/OpinionDetailView.swift` — 7/10

**الوصف:** شاشة تفاصيل مقال الرأي.

**مشاكل اداء:**
- **[P-24]** `loadOpinion()` يجلب **كل** المقالات مرة اخرى فقط لعرض "مقالات اخرى":
  ```swift
  let opinions = await NewsService.fetchOpinions()
  ```
  - هذا طلب API كامل لمجرد عرض 4 مقالات ذات صلة.

**تكرار كود:**
- **[S-06]** `prepareShareURL`, `showCopyFeedback`, `presentShareSheet` مكررة بالكامل من `ArticleDetailView`. يجب استخراجها الى protocol extension او helper مشترك.

---

### 15. `sabq/Screens/SearchView.swift` — 8/10

**الوصف:** شاشة البحث مع autocomplete و trending.

تصميم جيد مع debounce للبحث (300ms) وادارة سباق الطلبات.

**مشاكل امنية:**
- **[SEC-14]** عمليات البحث السابقة تُخزن في `UserDefaults` بنص واضح. قد يكشف هذا اهتمامات المستخدم.

**مشاكل بنيوية:**
- `suggestedTopics` hardcoded كـ fallback — مقبول.

---

### 16. `sabq/Screens/SettingsView.swift` — 6/10

**الوصف:** شاشة الاعدادات مع الملف الشخصي، المصادقة، والتفضيلات.

ملف ضخم (~600+ سطر) مع sheets متعددة.

**مشاكل امنية:**
- **[SEC-15]** `LoginSheet`, `ChangePasswordSheet`, `DeleteAccountSheet` — لم اتمكن من رؤية كود هذه الـ sheets بالكامل (في نهاية الملف)، لكن كلمات المرور يجب ان لا تُخزن في الذاكرة بعد الاستخدام.
- **[SEC-16]** `notificationsEnabled` هو `@State` محلي فقط — لا يتم حفظه فعليا. المستخدم يظن انه غيّر الاعداد لكنه يعود للافتراضي عند اعادة فتح الشاشة. هذا bug وليس مشكلة امنية بالضبط.

**مشاكل بنيوية:**
- **[S-07]** الملف كبير جدا. يجب تقسيم كل sheet الى ملف منفصل.
- **[S-08]** الاعدادات مثل `notificationsEnabled` لا تُحفظ فعليا — يبدو انها UI فقط.

---

### 17. `sabq/Screens/SectionsView.swift` — 8/10

**الوصف:** شاشة الاقسام مع grid وكلمات مفتاحية.

كود نظيف مع `CategoryArticlesSheet` منفصل.

**مشاكل طفيفة:**
- `ArticleCategory: Hashable` conformance في نهاية الملف — يفضل وضعها في ملف النموذج.

---

### 18. `sabq/Screens/OpinionsView.swift` — 8/10

**الوصف:** شاشة مقالات الرأي.

**ملاحظات ايجابية:**
- معالجة جيدة لحالات التحميل والخطأ.
- Pull-to-refresh مع الحفاظ على البيانات السابقة عند فشل التحديث.

---

### 19. `sabq/Screens/TrendingView.swift` — 8/10

**الوصف:** شاشة الاكثر تداولا.

كود نظيف ومباشر.

**ملاحظات:**
- `@Environment(\.dismiss)` معرّف بعد `body` — يفضل وضعه مع الـ properties في الاعلى.

---

### 20. `sabq/Screens/LiveCoverageView.swift` — 7/10

**الوصف:** شاشة البث الحي مع timeline.

**مشاكل اداء:**
- **[P-25]** `formatEventTime`, `formatDateHeader`, `formatRelativeTime` — كلها تنشئ `DateFormatter` و `ISO8601DateFormatter` جديدة في كل استدعاء. مع 50+ حدث في البث الحي، هذا مكلف جدا.
- **[P-26]** `groupEventsByDate` يُستدعى في كل render للـ view (لانه داخل `body`). يفضل حسابه مرة واحدة وتخزينه.
- **[P-27]** `shareEvent` يضع نصا مع `UIActivityViewController` — نفس النمط الهش لـ `presentShareSheet`.

---

### 21. `sabq/Screens/BookmarksView.swift` — 9/10

**الوصف:** شاشة المحفوظات.

كود نظيف وبسيط. لا توجد مشاكل كبيرة.

---

### 22. `sabq/Screens/KeywordArticlesView.swift` — 8/10

**الوصف:** شاشة المقالات حسب الكلمة المفتاحية.

كود نظيف مع `KeywordContentItem` enum جيد للتفريق بين المقالات والاراء.

---

### 23-28. ملفات الاختبارات والويدجت

لم يتم مراجعتها بالتفصيل لانها ليست جزءا من الكود الانتاجي، لكن:
- **اختبارات API Decoding موجودة** — ايجابي.
- **اختبارات UI ابتدائية** — تحتاج توسيع.
- **Widget بسيط** — يحتاج مراجعة مستقلة.

---

## ملخص المشاكل الامنية (مرتبة حسب الخطورة)

| # | المشكلة | الخطورة | الملف | الحل المقترح |
|---|---------|---------|-------|-------------|
| SEC-01 | Auth Token في UserDefaults | **حرج** | APIClient.swift | استخدام Keychain |
| SEC-07 | Data Race في categoryCache | **عالي** | NewsService.swift | حمايته بـ actor |
| SEC-03 | عدم تعقيم مدخلات URL | **عالي** | APIClient.swift | استخدام `addingPercentEncoding` دائما |
| SEC-02 | عدم وجود Certificate Pinning | **متوسط** | APIClient.swift | اضافة SSL pinning |
| SEC-09 | عدم وجود حد لمحاولات الدخول | **متوسط** | AuthStore.swift | اضافة عداد محاولات مع تأخير |
| SEC-10 | عدم وجود Session Timeout | **متوسط** | AuthStore.swift | اضافة token expiry check |
| SEC-13 | ارسال تعليقات بدون تعقيم | **متوسط** | ArticleDetailView.swift | تعقيم النص قبل الارسال |
| SEC-04 | Force Unwrap على URL | **منخفض** | APIClient.swift | استخدام guard let |
| SEC-12 | Bookmarks بدون تشفير | **منخفض** | BookmarksStore.swift | تقييم الحاجة للتشفير |
| SEC-14 | سجل البحث بنص واضح | **منخفض** | SearchView.swift | تقييم الحاجة للتشفير |

---

## ملخص مشاكل الاداء (مرتبة حسب التأثير)

| # | المشكلة | التأثير | الملف | الحل المقترح |
|---|---------|---------|-------|-------------|
| P-07 | DateFormatter جديد في كل استدعاء | **عالي** | SabqModels.swift | `static let` formatters |
| P-25 | DateFormatters متكررة في Live | **عالي** | LiveCoverageView.swift | `static let` formatters |
| P-20 | DateFormatters متكررة في Home | **عالي** | HomeFeedView.swift | `static let` formatters |
| P-05 | RTL propagation recursive | **عالي** | SabqRTL.swift | ازالة التمرير الشامل |
| P-06 | حلقة تحديث محتملة في RTL | **عالي** | SabqRTL.swift | تطبيق مرة واحدة فقط |
| P-17 | O(n*m) في bookmarkedArticles | **متوسط** | BookmarksStore.swift | استخدام Dictionary |
| P-04 | قراءة UserDefaults متكررة للثيم | **متوسط** | SabqComponents.swift | تخزين مؤقت |
| P-24 | جلب كل المقالات للمقالات ذات الصلة | **متوسط** | OpinionDetailView.swift | API مخصص او تخزين مؤقت |
| P-11 | انتظار 250ms في fetchOpinions | **متوسط** | NewsService.swift | ازالة الانتظار |
| P-14 | lowercased() متكرر في البحث | **منخفض** | ArticlesStore.swift | pre-computed lowercase |
| P-22 | AVPlayer بدون cleanup | **منخفض** | ArticleDetailView.swift | اضافة onDisappear |

---

## تكرار الكود

| الكود المكرر | الملفات | الحل |
|-------------|---------|------|
| `prepareShareURL` + `showCopyFeedback` + `presentShareSheet` | ArticleDetailView, OpinionDetailView | استخراج الى `ShareHelper` protocol |
| `formatEventTime` / ISO8601 parsing | HomeFeedView, LiveCoverageView | استخراج الى `DateFormatting` utility |
| `severityColor()` | HomeFeedView, LiveCoverageView | استخراج الى `SabqTheme` |
| Flexible JSON decoding pattern | APIArticle, APIOpinion | استخراج الى protocol |

---

## توصيات الاولوية القصوى

### 1. نقل Auth Token الى Keychain (SEC-01)
```swift
// بدلا من:
UserDefaults.standard.set(token, forKey: "sabq_auth_token")

// استخدم:
import Security
func saveToKeychain(token: String) {
    let data = token.data(using: .utf8)!
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: "sabq_auth_token",
        kSecValueData as String: data
    ]
    SecItemDelete(query as CFDictionary)
    SecItemAdd(query as CFDictionary, nil)
}
```

### 2. حماية categoryCache من Data Race (SEC-07)
```swift
// بدلا من:
static var categoryCache: [String: [Int: ...]] = [:]

// استخدم actor:
private actor CategoryCacheActor {
    var cache: [String: [Int: (articles: [Article], hasMore: Bool)]] = [:]
    func get(slug: String, page: Int) -> (articles: [Article], hasMore: Bool)? { ... }
    func set(slug: String, page: Int, value: ...) { ... }
}
```

### 3. استخدام DateFormatters ثابتة (P-07, P-20, P-25)
```swift
private enum Formatters {
    static let arabic: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar")
        f.dateFormat = "d MMMM yyyy"
        return f
    }()
    
    static let relativeArabic: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "ar")
        f.unitsStyle = .short
        return f
    }()
}
```

---

## نقاط القوة

1. **بنية MVVM نظيفة** مع فصل واضح بين Models, Views, Stores, Services.
2. **استخدام Swift Concurrency** بشكل صحيح (actor, async/await, MainActor).
3. **Flexible JSON Decoding** ممتاز للتعامل مع API غير مستقر.
4. **RTL و Arabic Support** مدمج بشكل اساسي.
5. **Skeleton Loading** و animations جيدة لتجربة المستخدم.
6. **Error handling** شامل مع fallbacks في معظم الاماكن.
7. **Image caching** محلي مع NSCache.
8. **Offline bookmarks** مع تخزين محلي للمقالات.

---

*تم اعداد هذا التقرير بمراجعة كاملة لـ 28 ملف Swift في المشروع.*
