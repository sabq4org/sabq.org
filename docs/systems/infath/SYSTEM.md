# مزادات إنفاذ (`infath`)

> آخر مراجعة: 2026-10-28 | المالك: التحرير (الاعتماد) / المنصة (الصفحة واللوحة)

## الغرض
صفحة عامة على `/infath` تعرض المزادات العقارية التي يشرف عليها مركز الإسناد والتصفية «إنفاذ» أسبوعًا بأسبوع: حصاد الأسبوع حتى الآن، أقرب مزاد بعدّاد حسب المنطقة، جدول الأسبوع بالأيام والفئات، حصاد الأسبوع الماضي، رسم آخر 8 أسابيع، والأرشيف. البيانات يُدخلها حساب إنفاذ في لوحة سبق ويعتمدها محرر سبق.

## الحدود (In / Out of scope)
- داخل النطاق: المزادات العقارية فقط، الصفحة العامة، لوحة `/dashboard/infath`، دورة الإرسال والاعتماد، سجل التغييرات.
- خارج النطاق الآن: مزادات التركات والمنقولات والمركبات (لا تُدخل أبدًا)، بطاقة الواجهة الرئيسية `/` (موجودة في النسخة التجريبية `/v2` فقط حتى الآن)، التطبيقات، أخبار إنفاذ في سبق داخل الصفحة، تنبيه المحررين عند الإرسال، صورة مشاركة، تغذية آلية من إنفاذ. موقع infath.gov.sa يمنع الزواحف؛ لا جلب آلي منه.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Shared | `shared/infath.ts` — الثوابت (13 منطقة، الفئات، الصيغ)، تحقق zod، `summarizeWeek`، `auctionPhase`، `buildPublicView`، `pickCurrentWeek`، محلل اللصق من Excel |
| Backend | `server/services/infathService.ts`, `server/routes/infath.ts` (مسجّل في `splitRoutesIndex.ts`) |
| Web | `client/src/pages/InfathPage.tsx` + `client/src/styles/infath-page.css` + `client/src/components/infath/InfathLogo.tsx`; اللوحة `client/src/pages/dashboard/InfathManagement.tsx` |
| Web (بطاقة الواجهة) | `client/src/components/infath/InfathHomeCard.tsx` + `client/src/styles/infath-home-card.css`؛ تظهر في `/v2` فقط (`client/src/pages/HomeV2.tsx` يمرّر `showInfathCard` إلى `Home.tsx`)، و`/v2` noindex في `server/utils/noindexPaths.ts` و`functions/_middleware.js`. تقرأ `/api/infath` العام وتختفي بلا أسبوع منشور |
| Edge | كاش `/api/infath` 60 ثانية في `functions/_middleware.js`؛ عنوان ووصف `/infath` في `LOCALIZED_STATIC_PAGES` بـ `server/routes/edgeMeta.ts` |
| Schema | `infath_weeks`, `infath_changes` في `shared/schema.ts` و`migrations/20261028_infath_auctions.sql` |
| RBAC | `infath.submit` (حساب إنفاذ)، `infath.approve` (محرر سبق)، الدور `infath_partner` |

## الواجهات
| الطريقة | المسار | الصلاحية |
|---------|--------|----------|
| GET | `/api/infath?week=YYYY-MM-DD` | عام، `public, max-age=30, s-maxage=60`، 404 إن لا أسبوع معتمد |
| GET | `/api/infath/admin/weeks` | submit أو approve |
| POST | `/api/infath/admin/weeks` `{weekStart}` | submit أو approve |
| GET | `/api/infath/admin/weeks/:id` و`/:id/preview` | submit أو approve |
| PUT | `/api/infath/admin/weeks/:id/auctions` `{auctions, expectedUpdatedAt}` | submit أو approve |
| POST | `/api/infath/admin/weeks/:id/submit` | submit أو approve |
| POST | `/api/infath/admin/weeks/:id/approve` | approve فقط، ثم purge لـ `/infath` و`/api/infath` |
| POST | `/api/infath/admin/weeks/:id/return` `{note}` | approve فقط |

## عقود مهمة / Gotchas
- **الأسبوع من الأحد إلى السبت بتوقيت الرياض** (+03:00 ثابت). قيد CHECK في الجدول يرفض `week_start` ليس أحدًا. وقت المزاد يُخزن تاريخًا ووقتًا محليين (`date` + `time`) وتُحسب اللحظة بـ `auctionStartMs`.
- **الجمهور يقرأ اللقطة فقط:** `published_json` و`published_summary` تُكتبان عند الاعتماد. أي حفظ بعد الاعتماد يعيد الأسبوع `draft`، والصفحة العامة تبقى على آخر نسخة معتمدة حتى اعتماد جديد. المعاينة `/infath?preview=<id>` تعرض المسودة لأصحاب الصلاحية فقط.
- **الحالات:** draft → pending (إرسال) → approved أو returned (بملاحظة إلزامية). المحرر يستطيع اعتماد مسودة مباشرة. الإعادة لا تكون إلا من pending. كل انتقال وحفظ داخل معاملة مع `SELECT … FOR UPDATE` و`expectedUpdatedAt` → 409 عند كتابة قديمة.
- **النتائج:** `assetsSold` و`soldValue` (بالريال) فقط حين `resultStatus=held`، والمبيعة لا تتجاوز المعروضة. المزاد الملغى يُستبعد من العدّ ويظهر «أُلغي». حالة «جارٍ الآن» تقديرية: 3 ساعات من البداية ما لم تُسجل نتيجة.
- **الملخص يُحسب في مكان واحد** (`summarizeWeek`) للصفحة واللوحة واللقطة. «أعلى مزاد حصيلةً» هو المزاد الأعلى قيمة لا أصل منفرد.
- **حساب إنفاذ:** الدور `infath_partner` يحمل `infath.submit` فقط؛ بعد الدخول يُوجَّه إلى `/dashboard/infath` (`getDefaultRedirectPath`) والقائمة الجانبية لا تعرض له غير «مزادات إنفاذ». يُنشأ الحساب ويُسند الدور من لوحة المستخدمين.
- **sabq_runtime:** المنح `SELECT, INSERT, UPDATE` على الجدولين، لا `DELETE` (التطبيق لا يحذف). الترحيل يُشغَّل يدويًا في Neon قبل الدمج.
- 400 يعود بشكل `{message, errors: {اسم الحقل بالعربية: [رسائل]}}` ورسائل الصفوف تبدأ «الصف N:». الحد 300 مزاد في الأسبوع.
- التصميم منقول من النموذج المعتمد: فاتح فقط، IBM Plex Sans Arabic، أرقام لاتينية، لا بطاقات متراكبة. كل أنماط الصفحة تحت `.inf-page` (لا تستعمل أسماء أصناف Tailwind مثل `ring`).

## الاختبارات
`tests/unit/infath.test.ts` (التواريخ، الأرقام، التحقق، الملخص، اللصق، العرض العام)، `tests/unit/infathApi.test.ts` (الصلاحيات، الكاش، الـ purge، أشكال الأخطاء).
