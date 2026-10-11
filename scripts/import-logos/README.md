# استيراد مكتبة الشعارات (salogos → R2 + Neon)

ينقل سجلات الشعارات من ملف JSON إلى:
- **R2**: bucket `sabq-news-images` تحت `logos/{id}/{variant}.{ext}` ← `https://media.sabq.org/logos/...`
- **Neon**: جدولا `logos` (سجل لكل شعار بكل حقوله الأصلية) و`logo_assets` (سطر لكل ملف بحالة الرفع).

## المرة الأولى فقط: الجداول
بمالك الجداول (ليس `sabq_runtime`) في Neon SQL Editor:
`migrations/20261007_logo_library.sql` — آمن للتكرار، ويمنح `sabq_runtime` قراءة/كتابة/تحديث بلا حذف.

## التشغيل (ويُعاد بأمان)
من مجلد المستودع المربوط بـ Railway (`railway status` → sabq.org / production):

```bash
railway run -s sabq.org -e production -- sh -c 'LOGOS_DATABASE_URL="$DATABASE_URL" npx tsx scripts/import-logos/import.ts --file ~/Downloads/sabq.txt --out outputs/logo-import'
```

| خيار | المعنى |
|---|---|
| `--dry-run` | تنزيل وفحص فقط، بلا كتابة في R2 أو Neon |
| `--retry-failed` | إعادة تجريب الملفات التي حالتها `failed` |
| `--verify-only` | التحقق والتقرير فقط (العدد + HEAD لكل رابط) |
| `--concurrency N` | التنزيلات المتوازية (افتراضي 6) |
| `--limit N` | أول N سجل فقط (للتجربة) |

المتغيرات: `LOGOS_DATABASE_URL` و`NEWS_IMAGES_R2_ACCOUNT_ID` و`NEWS_IMAGES_R2_ACCESS_KEY_ID` و`NEWS_IMAGES_R2_SECRET_ACCESS_KEY` و`NEWS_IMAGES_R2_BUCKET_NAME` و`NEWS_IMAGES_R2_PUBLIC_URL`.

## لماذا إعادة التشغيل آمنة
- البيانات الوصفية `ON CONFLICT (id) DO UPDATE` — لا تكرار.
- الملف المرفوع (`status = 'uploaded'`) يُتخطى. مفتاح R2 ثابت، فلو انقطع التشغيل بين الرفع والتسجيل يُكتب الملف فوق نفسه.
- الفاشل لا يوقف السكربت؛ يُسجَّل بسببه في `logo_assets.error` و`failures.csv`.

## الاستخدام عند إضافة خبر
`primary_url` هو الرابط المعتمد (SVG إن وُجد وإلا PNG). وحّد نص البحث بـ `normalizeArabicForSearch` من `shared/logoSearch.ts`:

```sql
SELECT display_id, title, primary_url, png_url
FROM logos
WHERE search_text ILIKE '%' || $1 || '%' OR tags && $2::text[]
ORDER BY download_count DESC
LIMIT 20;
```
