# مكتبة الوسائط (`media-library`)

> آخر مراجعة: 2026-07-17 | المالك: content

## الغرض
تخزين وبحث وحوكمة أصول الوسائط؛ صور الأخبار عبر مسار R2 المتدرّج مع سقوط على Cloudflare Images.

## الحدود
- **داخل النطاق:** `media*.ts`, `newsImageStorageService`, مسارات المكتبة.
- **خارج النطاق:** `objectStorage` لملفات غير الصور (PDF/audio blobs) — مزود منفصل.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/services/media*.ts`, `newsImageStorageService.ts` |
| Web | `client/src/pages/dashboard/MediaLibrary.tsx` |
| Docs | `docs/R2_NEWS_IMAGES_ROLLOUT.md` |

## عقود مهمة / Gotchas
- لا تخلط `CLOUDFLARE_IMAGES_TOKEN` مع `CLOUDFLARE_API_TOKEN` (purge).
- قبل رفع TTL الكاش لـ `media.sabq.org` لسنة: لازم purge-on-delete.

## صحة وتشغيل
- لوحة: `/dashboard/media-library`
- راجع rollout percent عبر env

## عند التعديل
- [ ] قرأت هذا الملف + runbook R2 عند لمس التخزين
