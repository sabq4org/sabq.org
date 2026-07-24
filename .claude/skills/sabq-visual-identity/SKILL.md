---
name: sabq-visual-identity
description: هوية لوحة سبق البصرية — رموز الثيم بدل الألوان الصريحة، IBM Plex Sans Arabic، قواعد RTL، وهيكل DashboardPageShell/Header. استخدمها عند بناء أو تعديل أي صفحة/مكوّن في اللوحة.
---

# هوية لوحة سبق البصرية

## القاعدة الذهبية: رموز الثيم، لا ألوان صريحة

اللوحة تدعم ثيمات يبدّلها المستخدم (منها WhatsApp الأخضر وiFox) عبر متغيرات CSS. لذلك:

- استخدم `bg-primary` / `text-muted-foreground` / `border-border` وأخواتها فقط — **ممنوع** hex أو hsl صريح في صفحات اللوحة.
- الجو العام «هادئ»: أسطح `background`/`muted`/`card`، والـ primary لمسات خفيفة فقط (أيقونة الترويسة `bg-primary/10`، تدرجات ≤ 0.04) — التعبئات الصاخبة تتحول نيونًا مع ثيمات مثل WhatsApp.

## هيكل الصفحة القياسي

```tsx
<DashboardPageShell maxWidthClassName="max-w-[1600px]">
  <DashboardPageHeader icon={SomeIcon} title="..." description="..." actions={...} />
  {/* المحتوى: بطاقات rounded-2xl border-border bg-card */}
</DashboardPageShell>
```

- المكوّنان في `client/src/components/dashboard/` — لا تبنِ ترويسة يدوية جديدة.
- نجمة التفضيل تظهر عالميًا في AppBreadcrumbs — لا تفعّل `showFavoriteToggle` إلا لنجمة إضافية مقصودة.

## الخط والأرقام

- **IBM Plex Sans Arabic** هو خط الواجهة الوحيد (محمّل في index.html مع fallback مضبوط المقاييس لمنع القفز) — لا تضف خطوطًا أخرى ولا `font-family` محلية.
- تنسيق الأرقام يتبع `docs/NUMBER_FORMAT_STANDARD.md`.

## RTL

- الأساس `dir="rtl"` (تضبطه DashboardPageShell) — استخدم خصائص منطقية (`ps-`/`pe-`، `text-start`) لا `left/right` صريحة.
- النصوص العربية في strings الواجهة بلغة يومية بسيطة.

## قبل التنفيذ

أي عمل تصميمي ثقيل (صفحة جديدة كاملة، إعادة تصميم): اعرض mockup/خطة على المالك واحصل على الموافقة قبل البرمجة — قاعدة معتمدة.
