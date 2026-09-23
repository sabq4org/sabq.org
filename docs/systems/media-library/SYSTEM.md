# مكتبة الوسائط (`media-library`)

> آخر مراجعة: 2026-09-07 | المالك: content

## الغرض
تخزين وبحث وحوكمة وأوصاف أصول الوسائط. توليد الصور من المحرر يُنسب لنظام `editorial`.

## مفاتيح AI (حصرية)
`media-caption`

## عقود مهمة
- لا تخلط `CLOUDFLARE_IMAGES_TOKEN` مع `CLOUDFLARE_API_TOKEN`.
- راجع `docs/R2_NEWS_IMAGES_ROLLOUT.md` قبل تغيير الكاش/التخزين.

## Webhook متجر الوسائط
- `POST /api/media-store/webhook` فقط معفى من CSRF، مع مطابقة query/trailing slash/case مثل Express؛ بقية عمليات المتجر تبقى محمية. المصدر هو `req.rawBody` الذي تحفظه `express.json.verify`، أو Buffer الراوتر المعزول؛ لا يُعاد بناء JSON من كائن محلل.
- `services/mediaStoreWebhook.ts` يتحقق من `hashstring` وفق [عقد Tap الرسمي للـCharge](https://developers.tap.company/docs/webhook): الحقول المرتبة، مبلغ SAR بدقتين، وHMAC-SHA256 باستخدام `TAP_SECRET_KEY` المستخدم أصلًا لإنشاء العملية. لا يعتمد على HMAC للجسم الكامل أو ترويسة `hash` أو مفتاح webhook مختلف. المبلغ/العملة هنا خاصان بمتجر SAR الحالي.
- `metadata.orderId` غير مغطى بتوقيع Tap؛ يجب مطابقته مع `order.paymentChargeId` والمبلغ المخزنين، ثم التحقق المستقل عبر Retrieve Charge من المعرف/المبلغ/العملة والحالة. لا يغير Webhook طلبًا تجاوز انتظار الدفع؛ والتحديث مشروط بالحالة ومعرف العملية لتفادي تكرار الأحداث عند التسابق.
- اختبارات `mediaStoreWebhook.test.ts` تمر عبر ترتيب Express الفعلي (JSON ثم CSRF ثم الراوتر)، بمفاتيح وبيانات صناعية وRetrieve Charge وهمي؛ لم تُنفذ دفعة مالية أو مكالمة Tap حية.
- المساران القديمان `/api/payments/webhook` و`/api/advertiser-payments/webhook` خارج هذه الدفعة، ويحتاجان مراجعة مستقلة لعقد التوقيع وترتيب middleware؛ لم يتغير `tapPaymentService.verifyWebhookSignature` المشترك.

## عند التعديل
- [ ] قرأت هذا الملف + runbook R2 عند لمس التخزين

## قياس رفع الوسائط — 2026-09-07
- مسار `/api/media/upload` يعيد `X-Request-ID` ويسجل مراحل استقبال الجسم والتحقق والمزوّد والتخزين وقاعدة البيانات والـhash، بما فيها انقطاع العميل. القياس يبدأ عند دخول route بعد الوسائط العامة، ولا يثبت وحده زمن الشبكة قبل Railway أو زمن session middleware السابق للمسار.
- لا تسجل أدوات القياس اسم الملف أو payload أو بيانات المشتركين. حدود الحجم والمصادقة ومسار التخزين لم تتغير.

## عقد مخطط M09 — 2026-09-07

- `article_media_assets.alt_text` مطلوب في ORM، وتتحقق مسارات POST/PATCH من قيمة غير فارغة قبل الكتابة مع fallback صريح عند الغياب؛ `NULL` الصريح يُرفض. ملف `migrations/20260907_validate_required_media_fields.sql` مخصص للتنفيذ الإداري بعد نشر التحقق واختبار الاستعادة؛ لا يعمل عند إقلاع التطبيق.
- تبقى الحقول الاختيارية الأخرى كما هي؛ enforcement في قاعدة البيانات يأتي لاحقًا بعد النشر وفحص NULL على فرع الاستعادة.
