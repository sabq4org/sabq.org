# تقرير أداء تطبيقات الموبايل الأصلية (Android + iOS) — 2026-05-29

> توثيق موحّد لمراجعة أداء **تطبيق Android الأصلي** (`android-native/`، Kotlin + Jetpack Compose)
> و**تطبيق iOS الأصلي** (`sabq app ios/`، SwiftUI). الهدف المعلن من المالك:
> **تسريع الإقلاع (launch) والتصفح (browsing)** — لا معالجة كراش.
>
> الويب موثّق منفصلاً في [`SABQ_ORG_PERFORMANCE_AUDIT_2026-05-28.md`](SABQ_ORG_PERFORMANCE_AUDIT_2026-05-28.md).

---

## 1. النطاق ومحاور المراجعة

غُطّيت خمسة محاور لكل منصة:

1. **زمن الإقلاع** (cold/warm start، وقت أول إطار، عمل الـmain thread عند البدء).
2. **سرعة فتح الصفحات والتنقّل** (شبكة، كاش، تحليل المحتوى، إعادة الرسم).
3. **الأداء العام** (الذاكرة، الـvirtualization، عمل الخيوط).
4. **الكود والمعمارية** (DI، الشبكة، التخزين، طبقات الكاش).
5. **القياس والمراقبة** (أدوات القياس وما يلزم لجمع أرقام فعلية).

---

## 2. ملخص المعمارية (مهم لفهم الأولويات)

| المنصة | المسار | الطبيعة |
|--------|--------|---------|
| `android-native/` | Kotlin + Compose + Hilt + OkHttp/Retrofit + Coil + DataStore | **أصلي بالكامل** |
| `sabq app ios/` | SwiftUI + URLSession actor + Keychain + Firebase | **أصلي بالكامل** |
| `ios/` | Capacitor (WebView يحمّل `sabq.org/lite`) | غلاف هجين — **ليس** التطبيق الأصلي |

> نقطة التباس متكررة: التطبيق الأصلي لـ iOS هو `sabq app ios/` (SwiftUI)،
> وليس مجلد `ios/` الهجين. المراجعة الأولى أخطأت بالتركيز على `ios/`، ثم
> صُحّحت لتشمل `sabq app ios/`.

---

## 3. ما نُفّذ فعلاً

### 3.1 Android — `commit 438b833`
`perf(mobile): تحسين أداء الإقلاع والتنقل لتطبيق Android الأصلي + iOS splash`
(2026-05-29، 11 ملف، +171/-58)

| التحسين | الملف | الأثر |
|---------|-------|-------|
| كاش توكن في الذاكرة + إزالة `runBlocking` من الـinterceptor الساخن | `data/auth/AuthTokenStore.kt`, `data/api/NetworkModule.kt` | لا حجب للخيط على كل طلب API |
| تأجيل عمل الإقلاع الثقيل (Firebase، FCM channel، تسجيل الجهاز، تهيئة التوكن) إلى coroutine خارج الـmain thread | `SabqApplication.kt` | تقليل وقت أول إطار في الإقلاع البارد |
| كاش قرص لـ OkHttp (20MB) يحترم `Cache-Control` | `data/api/NetworkModule.kt` | استجابات GET عامة أسرع/أوفلاين جزئي |
| throttle لتحديث الملف الشخصي (`ensureProfileFresh`, TTL=60s) | `data/AuthRepository.kt`, `feature/auth/AuthViewModel.kt` | منع نداءات `/members/profile` المكررة عبر الشاشات |
| نقل تحليل HTML للمقال خارج الـmain thread (`Dispatchers.Default`) | `feature/article/ArticleDetailScreen.kt` | إزالة jank عند فتح المقالات الطويلة |
| تثبيت هوية عناصر القوائم بـ `key(article.id)` | `feature/home/HomeFeedScreen.kt`, `bookmarks/BookmarksScreen.kt`, `category/CategoryArticlesScreen.kt` | إعادة تركيب أكفأ عند "تحميل المزيد"/التحديث |
| إزالة logs مطوّلة في المسارات الساخنة | `data/ArticleRepository.kt` | تقليل حِمل غير ضروري |

### 3.2 iOS الأصلي — `commit a02bdc6`
`perf(ios-native): تتبّع تطبيق iOS الأصلي + عرض تدريجي للرئيسية + رفع الإصدار`
(2026-05-29)

| التحسين | الملف | الأثر |
|---------|-------|-------|
| **عرض تدريجي للرئيسية** — عرض الخلاصة الأساسية فور وصول استجابة الصفحة الرئيسية بدل انتظار الترند/المباشر/الرأي | `sabq/Stores/ArticlesStore.swift` (`loadArticles`) | يختفي الـskeleton مبكّراً → إحساس أسرع بالإقلاع/فتح الرئيسية |
| إبقاء كاش التصنيفات حيّاً في التحميل الكاشي، ومسحه فقط عند سحب التحديث (`ignoreCache`) | `sabq/Stores/ArticlesStore.swift` | تنقّل فوري بين التصنيفات والرئيسية دون فرق يلاحظه المتابع |
| إعادة تتبّع مصادر `sabq app ios/` في git (تجاهل `build/`/`DerivedData/`/`xcuserstate` فقط) | `.gitignore`, `sabq app ios/**` | حماية من الحذف العرضي + ضمان وصول تعديلات الأداء عبر الفرع |
| رفع الإصدار `MARKETING_VERSION 9.9.2 → 9.9.3` وبناء `→ 2026052901` | `sabq.xcodeproj/project.pbxproj` | فتح قطار إصدار جديد بعد إغلاق 9.9.2 على App Store Connect |

#### iOS — Capacitor (`ios/`) — `commit 438b833` (ضمن `client/src/main.tsx`)
إخفاء شاشة البداية (splash) فور تحميل إضافة `@capacitor/splash-screen` دون انتظار بقية الإضافات، مع إبقاء `launchAutoHide=2.5s` كشبكة أمان.

### 3.3 ما وُجد مُحسَّناً سلفاً في iOS الأصلي (لم يحتج تعديلاً)
- `URLCache` مُفعّل (10MB ذاكرة / 50MB قرص) والتحميل الأولي يستخدم الكاش؛ سحب التحديث وحده يتجاوزه.
- التبويبات كسولة (`switch selectedTab`) فلا تُبنى الشاشات غير الظاهرة عند الإقلاع.
- جلب الرئيسية يبدأ مع تهيئة `ArticlesStore` (لا بعد ظهور الشاشة).
- الطلبات الخلفية في `.task` كلها best-effort بالتوازي عبر `async let` ولا تحجب الشاشة.

---

## 4. التحقق

- **Android:** `./gradlew compileDebugKotlin` نجح، لا أخطاء lint.
- **iOS:** `xcodebuild build -scheme sabq -destination 'generic/platform=iOS Simulator' -derivedDataPath build/DD CODE_SIGNING_ALLOWED=NO` → `** BUILD SUCCEEDED **` (قبل وبعد تعديل الكاش).
- لم تُجمع أرقام أداء فعلية بعد (تحتاج جهازاً + وحدة قياس) — انظر القسم 5.

---

## 5. بنود مؤجّلة (تحتاج جهازاً/أدوات قياس)

| البند | المنصة | لماذا مؤجّل |
|-------|--------|-------------|
| إعداد Macrobenchmark وجمع خط أساس للإقلاع | Android | يحتاج وحدة benchmark + جهاز فعلي |
| توليد Baseline Profile | Android | يحتاج Macrobenchmark + تشغيل على جهاز |
| Offline-first كامل عبر Room | Android | مؤجّل ريثما تُضبط ترويسات كاش الخادم + اختبار جهاز |
| قياس MetricKit / توقيتات الإقلاع | iOS | يحتاج تشغيل على جهاز فعلي وجمع تقارير |

---

## 6. قرار معماري معلّق (للمالك)

**iOS: الاستمرار على SwiftUI الأصلي أم اعتماد غلاف Capacitor رسمياً؟**

- الوضع الحالي: يوجد تطبيقان لـ iOS — أصلي (`sabq app ios/`) وهجين (`ios/`). `AGENTS.md` يشير إلى `ios/` كمسار رسمي، بينما العمل الفعلي والمرجع البصري لأندرويد يقوم على الأصلي.
- مطلوب حسم: أيّهما المسار الرسمي؟ ثم تحديث `AGENTS.md` و`CLAUDE.md` وفقه، وإزالة/أرشفة الآخر لتفادي الالتباس وتكرار الحذف العرضي.

---

## 7. مراجع

- commits: `438b833` (Android + iOS splash)، `a02bdc6` (iOS native + tracking + إصدار).
- تقرير أداء الويب: [`SABQ_ORG_PERFORMANCE_AUDIT_2026-05-28.md`](SABQ_ORG_PERFORMANCE_AUDIT_2026-05-28.md).
- إرشادات العمل: [`AGENTS.md`](../AGENTS.md)، [`CLAUDE.md`](../CLAUDE.md).

---

*أُنشئ: 2026-05-29 | يُحدَّث عند تنفيذ أي بند من القسمين 5 و6.*
