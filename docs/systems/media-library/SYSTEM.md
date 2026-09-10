# مكتبة الوسائط (`media-library`)

> آخر مراجعة: 2026-09-04 | المالك: content

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
