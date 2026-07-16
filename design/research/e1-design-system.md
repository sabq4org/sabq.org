# تقرير الاستكشاف E1 — نظام التصميم الحالي للويب (مشروع سبق)

> المصدر: مدقق_نظام_التصميم (وكيل استكشاف). الأدلة بصيغة path:line.

## (1) الـ tokens المتاحة

### الألوان (HSL عبر CSS vars)

| Token | فاتح | داكن | الاستخدام |
|---|---|---|---|
| `--primary` | `203.9 88.3% 53.1%` (أزرق سبق) | `201.8 89.4% 63.1%` | الهوية الأساسية — `client/src/index.css:107`, `:300` |
| `--background` / `--foreground` | أبيض / `210 25% 7.8%` | `210 20% 7.8%` / فاتح | `index.css:73-75`, `:266-268` |
| `--card` | `180 6.7% 97.1%` (رمادي فاتح جداً) | `210 17.9% 11%` | سطح البطاقات — `index.css:79`, `:272` |
| `--card-border` | `220 18% 82%` | `210 15.7% 20%` | يُستخدم أساساً في الداكن — `index.css:83` |
| `--accent` (+ accent-blue/purple/green) | `211.6 51.4% 92.7%` | `204 54% 17%` | `tailwind.config.ts:56-63` |
| `--destructive` / `--success` / `--warning` / `--info` | — | — | `index.css:133-147` |
| `--chart-1..5` | أزرق، أخضر، كهرماني، أخضر2، وردي | نفسها | `index.css:159-163` |
| `--footer` | `220 15% 96%` | `210 18% 9.5%` | `index.css:119-121` |

### توكنات الذكاء الاصطناعي (الهوية الزرقاء المعتمدة)

| Token | فاتح | داكن |
|---|---|---|
| `--ai-primary` | `220 84% 53%` | `220 84% 60%` |
| `--ai-secondary` | `243 75% 59%` | `243 75% 65%` |
| `--ai-background` | `220 100% 97%` | `220 25% 10%` |
| `--ai-background-muted` | `220 100% 99%` | `220 20% 12%` |

`index.css:166-172`, `:350-357`. أدوات جاهزة: `.bg-ai-gradient`, `.bg-ai-gradient-soft`, `.text-ai-gradient`, `.border-ai-gradient`, `.ai-glow` — `index.css:1715-1737`.

### الزوايا والظلال والخطوط
- الزوايا: `lg=9px, md=6px, sm=3px` (`tailwind.config.ts:16-20`)، عملياً البطاقات `rounded-2xl` (16px) (`card.tsx:12`)، رقائق الأيقونات `rounded-full`.
- الظلال: `--shadow-*` شفافة — اللغة السائدة ظل خفيف جداً (`shadow-sm`) أو بلا ظل.
- الخط: `IBM Plex Sans Arabic` + fallback (`tailwind.config.ts:112-116`).
- Elevate: `--elevate-1` (0.03/0.04)، `--elevate-2` (0.08/0.09).

### الحركة المتوفرة (لا تخترع keyframes جديدة)
| الأداة | الوصف | الدليل |
|---|---|---|
| `.scroll-fade-in` | fade-in-up 0.6s + stagger تلقائي nth-child(1..5) | `index.css:1772-1792` |
| `hover-elevate` / `active-elevate` | طبقة تفتيح/تعتيم عند hover/active | `index.css:1394-1483` |
| `.animate-fade-in-up` + `.animation-delay-100..500` | دخول متدرج | `index.css:2741-2763` |
| `.ai-pulse`, `.ai-gradient-pulse`, `.ai-glow-border`, `.ai-float-icon` | عائلة حركات AI (مع prefers-reduced-motion) | `index.css:2085-2143` |
| `animate-accordion-down/up` | 0.2s | `tailwind.config.ts:136-140` |
| `stat-card-gradient-1..4` | تدرجات بطاقات إحصائية جاهزة | `index.css:2704-2726` |
| tailwindcss-animate | fade-in-0 zoom-in-95 slide-in-from-* | `tooltip.tsx:22` |

### أنظمة ثيم (حدود مهمة)
- **Visual Variants عامة** (`data-variant` على `<html>`): `ai-first` (افتراضي)، `magazine` (برتقالي + Tajawal + زوايا 0)، `classic` (أحمر)، `terminal` — تستبدل `--primary` والخط والزوايا عالمياً (`index.css:383-406`, `:1243-1300`). **أي لون/خط/زاوية ثابتة ستتكسر تحت هذه البدائل → tokens فقط.**
- Dashboard Theme Center و iFox: مقصورة على `/dashboard` والإدارة — لا تخص الموجز.

### مكوّنات ui
- Card: `rounded-2xl border bg-card border-card-border shadow-sm`، CardTitle `text-2xl font-semibold`، CardContent `p-6 pt-0`.
- Button: variants مع `hover-elevate active-elevate-2` مدمجة.
- Badge: `default/secondary/destructive/outline`.
- Progress: يقبل `indicatorClassName` (`progress.tsx:18-27`).
- Collapsible: Radix خام — التنسيق على عاتق الصفحة.

## (2) أنماط UI المكررة (لغة التصميم السائدة)
1. **هيدر صفحات الحساب الموحّد**: شريط `border-b border-primary/10 bg-ai-gradient-soft` + `container max-w-7xl` + `AccountSectionHeader` (أيقونة `rounded-lg bg-primary/10 p-2` + عنوان `text-2xl sm:text-3xl font-bold` + سطر فرعي + action). مستعمل في DailyBrief, FocusWeeklyReport, Profile, NotificationSettings.
2. **معادلة البطاقة**: `border-0 shadow-sm dark:border dark:border-card-border`.
3. **شبكة KPIs**: `grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 md:gap-4` + `MobileOptimizedKpiCard`.
4. **بطاقات المقاييس اليدوية**: أيقونة `h-12 w-12 rounded-full bg-{color}-500/10` + قيمة `text-2xl md:text-3xl font-bold`.
5. **أقسام قابلة للطي**: Collapsible + ghost sm + ChevronDown بـ rotate-180.
6. **رقائق badges ملوّنة**: `bg-primary/10 text-primary border-primary/20` ونظيراتها.
7. **هوية AI زرقاء** في الموقع؛ البنفسجي في DailyBrief نشاز.
8. **صناديق اقتراح AI**: `p-4 bg-primary/10 rounded-lg border border-primary/20` + Lightbulb.
9. **الأرقام لاتينية دائماً** `toLocaleString('en-US')` — عقد معلن في `lib/format.ts`، ويفضل `tabular-nums`.
10. **`data-testid` على كل عنصر** — اتفاقية إلزامية.
11. **الرسوم**: recharts بـ `hsl(var(--primary))`، RTL عبر `reversed` + `direction: rtl`.

## (3) ما يجب الالتزام به ليبدو التصميم أصيلاً
1. توكنات فقط، لا ألوان ثابتة (variants + داكن).
2. الأزرق هو هوية AI — استبدل البنفسجي بتوكنات `--ai-*`.
3. معادلة البطاقة: `rounded-2xl` + `border-0 shadow-sm` / `dark:border dark:border-card-border` + أيقونة `rounded-full bg-primary/10`.
4. الهيكل: Header + شريط `bg-ai-gradient-soft` + `container mx-auto max-w-7xl` + `dir="rtl"` + Footer.
5. الحركة المسموحة: scroll-fade-in, hover-elevate, transition-transform — بلا keyframes جديدة.
6. أرقام لاتينية + tabular-nums + data-testid.
7. صفحات التقارير أفسح (`space-y-10`, `p-6/p-8`) وبلا حدود في الفاتح — لا تستورد كثافة صفحة اللحظات.
