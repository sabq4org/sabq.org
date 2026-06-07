# تقرير المراجعة الأمنية — منصّة سبق (2026-06-07)

> سرّي — للاستخدام الداخلي فقط.
> الحالة: **الإصلاحات الآمنة عالية القيمة مطبّقة** · البنود السلوكية مؤجّلة بانتظار قرار.
> آخر تحديث: 2026-06-07.

مراجعة كود ساكنة (Static Review + Taint Tracing) للمكدّس: Node/Express/TypeScript · React/Vite · PostgreSQL (Drizzle) · Cloudflare Pages + Railway.
لم يُجرَ اختبار اختراق فعلي ضد بيئة الإنتاج.

كل ثغرة في هذا الملف **مُتحقَّق منها مقابل الكود الفعلي**، ومع كل إصلاح فُحص أثره على مستدعي الواجهة (client callers) لتفادي كسر التدفقات الشرعية.

---

## مُطبَّق في هذه الدفعة

### S-01 — تجاوز حماية CSRF على مسارات حساسة (عالي)
- **الجذر:** `EXEMPT_PATHS` في [server/csrf.ts](../../server/csrf.ts) تستخدم مطابقة بادئة (`startsWith`). البادئة `/api/articles/` (وكذلك `/api/en/articles/`, `/api/ur/articles/`) أُضيفت لإعفاء عدّاد المشاهدات المجهول فقط، لكن البادئة أعفت **كل** المسارات المغيّرة للحالة تحتها: التعليقات، التفاعلات، الإشارات المرجعية، الوسوم، وتوليد المحتوى بالذكاء الاصطناعي.
- **الإصلاح:** إزالة البوادئ العريضة الثلاث، وإضافة `EXEMPT_REGEX` مُثبّت (`^...$`) يغطّي **فقط** المسارات التي تُرسَل عبر `sendBeacon`/`fetch` خام (لا تستطيع إرفاق ترويسة `x-csrf-token`):
  - `/api/articles/:id/view`، `/api/articles/:id/reading-time`
  - `/api/en/articles/:id/view`، `/api/ur/articles/:id/view`
- **تحقّق التوافق:** التعليقات/التفاعلات/الإشارات/الوسوم/إرسال الاختبار كلها تمرّ عبر `apiRequest` الذي يجلب رمز CSRF تلقائيًا للطرق المغيّرة للحالة (يعمل حتى للزوار المجهولين عبر `/api/csrf-token`).
- **كسر التُقط أثناء التحقق (غير مذكور في التقرير الأصلي):** [SwipeCard.tsx](../../client/src/components/lite/SwipeCard.tsx) كان يحفظ المقال عبر `fetch` خام بلا CSRF — حُوِّل إلى `apiRequest`.

### S-02 — SSRF عبر جلب صورة من عنوان يتحكّم به المستخدم (عالي)
- **الجذر:** `POST /api/thumbnails/generate` (حارس `isAuthenticated` فقط) بطريقة `ai-smart` يمرّر `imageUrl` من جسم الطلب إلى `fetch()` داخل [aiSmartThumbnailService.ts](../../server/services/aiSmartThumbnailService.ts) بلا تحقق — يتجاوز حارس SSRF الموجود في `thumbnailService.ts`.
- **الإصلاح:** أداة مشتركة جديدة [server/utils/safeImageUrl.ts](../../server/utils/safeImageUrl.ts) (`assertSafeImageUrl`): تفرض `https`، قائمة سماح للمضيفين (CF Images + R2/S3 العام + نطاق الإنتاج من المتغيّرات البيئية)، وترفض نطاقات IP الخاصة/الحلقية/link-local (`169.254.0.0/16` نقطة بيانات السحابة). مطبّقة قبل الجلب وخارج كتلة `try` الابتلاعية.

### S-03 — XSS مخزّن عبر إدراج HTML خام (متوسط)
- **الجذر:** [MuqtarabReview.tsx](../../client/src/pages/dashboard/MuqtarabReview.tsx) كانت تُدرج `preview.content?.rawHtml` عبر `dangerouslySetInnerHTML` بلا تعقيم.
- **الإصلاح:** تمرير عبر `DOMPurify.sanitize` (الحزمة `isomorphic-dompurify` مثبّتة ومستخدمة في معظم مسارات العرض الأخرى).

### S-06 — تسريب PII في السجلّات (منخفض)
- **الجذر:** `LocalStrategy`/`GoogleStrategy`/`AppleStrategy` في [server/auth.ts](../../server/auth.ts) ومسار الدخول في [server/routes.ts](../../server/routes.ts) تسجّل البريد/الاسم وتفاصيل المصادقة في الإنتاج بلا حارس.
- **الإصلاح:** قصر هذه السجلّات على `NODE_ENV !== 'production'`. (ملاحظة: `routes.ts:585` كان محميًا أصلًا — الخلل الحقيقي كان في `auth.ts`.)

### S-08 — إعفاء `/api/test/` من CSRF في الإنتاج (منخفض)
- **الإصلاح:** جعل إعفاء `/api/test/` متاحًا في بيئة التطوير فقط داخل `isExemptPath`.

---

## مؤجّل (يحتاج قرارًا — لا أثر له على ما رُفع)

| المعرّف | العنوان | السبب في التأجيل |
|---|---|---|
| S-04 | فحص توقيع الملف (magic bytes) بدل MIME | يضيف تبعية `file-type` ويمسّ عدة معالجات رفع |
| S-05 | فرض 2FA بعد OAuth + منع الربط التلقائي بالبريد | يغيّر تدفق تسجيل الدخول (UX) وقد يحتاج شاشة 2FA-بعد-OAuth |
| S-07 | قائمة سماح لرابط صورة البروفايل | قد يكسر أفاتار من CDN خارجي يدعمه الكود عمدًا |
| S-10 | تنبيهات `npm audit` (6 متوسطة عبر `uuid` المتعدّي) | صيانة دورية؛ ترقية قد تكون كاسرة في `@google-cloud/storage` |
| S-11 | تفكيك الملفات الضخمة (routes.ts / storage.ts) | معماري مستمر |

---

## تصحيحات على التقرير الأصلي
- **S-09** (إعفاء `/api/v1`): **مقبول وليس خطرًا** — مسارات الجوال تصادق عبر `Authorization: Bearer` ([mobileApiRoutes.ts:837](../../server/routes/mobileApiRoutes.ts#L837)) لا كوكي الجلسة، فهجوم CSRF (المعتمد على كوكي الجلسة) لا ينطبق.
- **S-06**: تسجيل `routes.ts:585` كان محميًا بحارس prod مسبقًا.
- **S-10**: `npm audit --omit=dev` = 6 تنبيهات **متوسطة** فقط، لا حرجة/عالية.

## نقاط قوة لوحظت
تجزئة كلمات المرور بـ bcrypt مع مقارنة آمنة وحدّ لمحاولات الدخول · CSRF بنمط الإرسال المزدوج ومقارنة `timingSafeEqual` وكوكي `httpOnly` · كوكي الجلسة `httpOnly + secure + SameSite + rolling` · الاستعلامات مُعاملِة عبر Drizzle · `updateUserSchema` لا يتضمّن role/roleId (لا تصعيد صلاحيات عبر mass-assignment) · `.env` خارج Git · DOMPurify في معظم مسارات العرض.
