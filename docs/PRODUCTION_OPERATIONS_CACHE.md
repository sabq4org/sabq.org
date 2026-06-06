# ملاحظات تشغيل الإنتاج: الكاش والإقلاع

> **الإنتاج الحالي (2026-06):** Cloudflare Pages (`sabq.org`) + Railway (`api.sabq.org`).  
> انتقلنا من Replit في منتصف مايو 2026. التفاصيل: [`DEPLOYMENT_STATUS.md`](DEPLOYMENT_STATUS.md).

## Redis في الإنتاج

- `REDIS_URL` **اختياري** — يُضبط على **Railway** (ليس على Cloudflare Pages).
- **بدون Redis:** الجلسات في PostgreSQL (`sessions`)؛ SSE والإشعارات وEditor Presence تعمل داخل ذاكرة العملية الواحدة — مقبول مع **replica واحدة** على Railway.
- **مع Redis:** يقلل ضغط DB للجلسات؛ **مطلوب عملياً** عند تشغيل أكثر من نسخة Backend (pub/sub بين pods).
- **التحقق:** سجلات Railway عند الإقلاع — `[Session] Using Redis store` أو `Using PostgreSQL store (add REDIS_URL...)`.
- **محلي:** `docker-compose.yml` يوفّر Redis؛ `npm run dev` بدون Docker لا يحتاجه.

## أعمال الإقلاع

- تجنب نقل أعمال صيانة ثقيلة إلى مسار بدء الخادم مباشرة.
- أي فهرسة، تنظيف، أو إعادة حساب كبيرة يجب أن تعمل كـ job منفصل أو maintenance run.
- قبل إضافة أي عمل عند الإقلاع، قس أثره على زمن بدء حاوية Railway وعلى قاعدة البيانات.

## قاعدة الرجوع

- أي تحسين تشغيل يجب أن يكون قابلاً للتعطيل بمتغير بيئة أو عكسه في PR مستقل.
- لا تغييرات schema في هذا المسار إلا بإضافة حقول فقط وبحسب Workflow C في `AGENTS.md`.

