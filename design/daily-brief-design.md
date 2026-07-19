# مواصفة إعادة تصميم صفحة «الموجز اليومي» (Daily Brief) — نهائية وحاسمة

> مرجع إلزامي لوكلاء التنفيذ. ممنوع أي قرار تصميمي خارج هذا المستند.
> النطاق: `client/src/pages/DailyBrief.tsx` (AR) · `client/src/pages/en/EnglishDailyBrief.tsx` (EN = مرآة 1:1) · مكونات جديدة `client/src/components/daily-brief/`.
> القرارات 1–10 من الـ Orchestrator مدمجة هنا بالكامل ولا تُفتح للنقاش.

## 1. الرؤية والمبادئ

الموجز اليومي صفحة «شخصية» لا لوحة بيانات: المستخدم أولاً (تحية وهوية ومزاج)، ثم أرقامه، ثم اهتماماته واقتراحاته، والمؤشرات الثقيلة في الأسفل مطوية. هوية الذكاء الاصطناعي زرقاء فقط عبر توكنات `--ai-*`؛ لا بنفسجي ولا وردي. كل شيء توكنات (داكن + 4 variants)، أرقام لاتينية `tabular-nums`، و`data-testid` على كل عنصر معنوي. لا keyframes جديدة — فقط `scroll-fade-in` و`hover-elevate` و`transition-transform` الموجودة.

## 2. خريطة الصفحة (حالة النجاح فقط)

| # | القسم | الغرض | شرط الظهور | الافتراضي |
|---|-------|-------|-----------|-----------|
| 0 | شريط الترويسة (Band) | تحية + تاريخ + تحديث/آخر تحديث | دائماً (كل الحالات) | مفتوح (ليس Collapsible) |
| 1 | بطاقة التحية + المزاج (Hero) | ملخص 24 ساعة + المزاج القرائي بسطر تفسيري | `kind:"ok"` | مفتوح |
| 2 | صف KPIs (4 بطاقات) | أرقام اليوم — **الصف الوحيد للأرقام** | `kind:"ok"` | مفتوح |
| 3 | الاهتمامات | فئات + مواضيع | `topCategories.length>0 \|\| topics.length>0` وإلا يُخفى كلياً | مفتوح (Collapsible) |
| 4 | الاقتراحات | بطاقات مقالات مصوّرة | `suggestedArticles.length>0` وإلا يُخفى كلياً | مفتوح (ليس Collapsible) |
| 5 | النشاط الزمني | رسم 24 ساعة + اقتراح AI | `kind:"ok"` | مفتوح (Collapsible) |
| 6 | مؤشرات الأداء التفصيلية | 6 بطاقات مقاييس | `kind:"ok"` | **مطوي (useState(false))** |
| 7 | لمسات AI | نسبة التركيز + هدف اليوم فقط | `aiInsights` موجود | مفتوح (Collapsible) |

## 3. الهيكل العام (Shell)

- **AR**: `<Header user={user}/>` → Band → `<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">` → `<Footer/>`. حاوية المحتوى في حالة النجاح: `<div className="space-y-10" dir="rtl">`.
- **EN**: داخل `<EnglishLayout>` (بلا Header/Footer)، نفس البنية الداخلية حرفياً، **بدون أي `dir` attribute** (LTR من الـ Layout)، وكل الروابط بادئة `/en`.
- **التوكن/اللون ممنوع ثابتاً**: ممنوع `text-green-500`/`red-500`/`purple-*`/`blue-500`/`orange-500` وأي `bg-{color}-500/10`. البدائل: `text-primary`/`bg-primary/10`، وللاتجاهات `text-success`/`text-destructive`، ولهوية AI توكنات `--ai-*` وأدواتها الجاهزة.

## 4. القسم 0 — شريط الترويسة (Band)

- Wrapper: `<div className="border-b border-primary/10 bg-ai-gradient-soft">` بداخله `<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">` بداخله `<div className="scroll-fade-in" dir="rtl">` (في EN: نفس div بدون `dir`).
- `AccountSectionHeader` بالـ props:
  - `icon={Sun}`
  - `title`: حالة النجاح = `${getGreeting()} ${userName}!` (userName من `summary.personalizedGreeting.userName`، يُحذف مع المسافة إن غاب) · التحميل = «جاري التحميل…» · الضيف/الفارغ/الخطأ = «موجزك اليومي».
  - `subtitle={todayFormatted}` — AR: `format(new Date(), 'EEEE، d MMMM yyyy', { locale: ar })` · EN: `'EEEE, MMMM d, yyyy'` بـ `enUS`.
  - `testId="text-daily-brief-title"`
  - `action` (في حالة النجاح فقط، يُحذف كلياً في باقي الحالات): `<div className="flex items-center gap-3">`:
    - `<span className="text-xs text-muted-foreground tabular-nums" data-testid="text-last-updated">آخر تحديث {format(new Date(summary.generatedAt), 'HH:mm')}</span>`
    - `<Button variant="outline" size="icon" className="rounded-full" onClick={handleRefresh} disabled={isLoading} data-testid="button-refresh-brief">` بداخله `<RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")}/>`.
- `getGreeting()`: AR: 5–12 «صباح الخير» وإلا «مساء الخير». EN: 5–12 "Good morning"، 12–17 "Good afternoon"، وإلا "Good evening".

## 5. القسم 1 — بطاقة التحية/المزاج (Hero) ⭐

هي واجهة الصفحة؛ تدمج الملخص والمزاج (المزاج يظهر هنا فقط — يُحذف من قسم AI).

- `<Card className="scroll-fade-in border-0 bg-ai-gradient-soft shadow-sm dark:border dark:border-card-border" data-testid="card-greeting">`
- `<CardContent className="p-6 md:p-8">` → `<div className="flex items-start gap-4 md:gap-6">`:
  1. **شريحة المزاج**: `<div className="h-16 w-16 md:h-20 md:w-20 shrink-0 rounded-full bg-primary/10 flex items-center justify-center" data-testid="icon-reading-mood">` بداخله `<MoodIcon mood={...} className="h-8 w-8 md:h-10 md:w-10 text-primary"/>`.
  2. **المتن** `<div className="flex-1 min-w-0">`:
     - `<p className="text-base md:text-lg leading-relaxed" data-testid="text-greeting-summary">` بقواعد حدّية:
       - `articlesReadToday>0 && readingTimeMinutes>0`: «قرأت خلال آخر 24 ساعة `<strong className="tabular-nums" data-testid="value-articles-today">{n}</strong>` مقالاً خلال `<strong className="tabular-nums" data-testid="value-reading-minutes">{m}</strong>` دقيقة»
       - `articles>0 && minutes===0`: نفس الجملة **بدون** جزء الدقائق.
       - `articles===0`: «لم تُسجَّل قراءات خلال آخر 24 ساعة — يومك القرائي يبدأ الآن.»
       - إن `topCategories.length>0` يُلحق: « — منها عن `<strong>{a}</strong>` و`<strong>{b}</strong>`» (فاصلة «و» قبل الأخير؛ كل عنصر `<span data-testid="text-top-category-{i}">`).
     - **سطر المزاج** `<div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="text-mood-description">`:
       `<Sparkles className="h-4 w-4 text-primary"/>` + `<span className="text-sm">مزاجك القرائي اليوم: <strong data-testid="value-reading-mood">"{mood}"</strong></span>` + `<span className="text-sm text-muted-foreground" data-testid="text-mood-explanation">{explanation}</span>`.
     - `explanation` من خريطة ثابتة client-side (تقبل المفتاحين AR/EN): تحليلي/Analytical → «تميل اليوم إلى المقالات المعمّقة والتحليلات.» · فضولي/Curious → «تتنقّل بفضول بين مواضيع متنوعة.» · سريع/Fast → «قراءة سريعة بوتيرة عالية — تلتقط الجوهر بسرعة.» · نقدي/Critical → «تتوقف عند التفاصيل وتزن وجهات النظر.» · افتراضي → «نمط قراءة متوازن اليوم.» (النصوص EN في جدول الترجمة §17).

## 6. القسم 2 — صف KPIs (الصف الوحيد — لا تكرار لاحقاً)

- `<div className="scroll-fade-in grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 md:gap-4">` بأربع `MobileOptimizedKpiCard`، جميعها بـ `iconColor="text-primary" iconBgColor="bg-primary/10" className="border-0 dark:border dark:border-card-border" ariaLive`:

| testId | Label (AR) | Icon | القيمة | قيمة الصفر المحفّزة |
|---|---|---|---|---|
| `kpi-articles-read` | المقالات المقروءة اليوم | BookOpen | `metrics.articlesRead` | «ابدأ أول مقال» |
| `kpi-reading-time` | وقت القراءة (دقيقة) | Clock | `metrics.readingTimeMinutes` | «دقائقك بانتظارك» |
| `kpi-completion-rate` | معدل الإكمال (%) | Target | `Math.round(completionRate)` | «أكمل مقالاً واحداً» |
| `kpi-engagement` | نقاط التفاعل | Activity | likes+comments+bookmarks | «تفاعل مع محتواك» |

- **قاعدة الصفر**: إذا القيمة الخام `=== 0` يُمرَّر النص المحفّز كـ `value` (بدون رقم). غير ذلك: `(n ?? 0).toLocaleString('en-US')`. ممنوع عرض رقمين لنفس المقياس في أي مكان آخر بالصفحة.

## 7. القسم 3 — الاهتمامات (Card + Collapsible، مفتوح)

- يُخفى القسم كاملاً إن `topCategories` و`topicsThatCatchAttention` كلاهما فارغان.
- `<Card className="border-0 shadow-sm dark:border dark:border-card-border" data-testid="card-interest-analysis">` بنمط Collapsible الموحّد (§13).
- `CardTitle className="flex items-center gap-2 text-2xl" data-testid="heading-interest-analysis"`: `<Sparkles className="h-6 w-6 text-primary"/>` + «اهتماماتك اليوم». `CardDescription className="mt-1 text-sm"`: «الفئات والمواضيع التي تصدّرت قراءتك خلال 24 ساعة».
- المحتوى `space-y-4`:
  - **الفئات** (إن وُجدت): `<div className="flex flex-wrap gap-2">` — كل عنصر `<Badge variant="outline" className="text-sm px-3 py-1 bg-primary/10 text-primary border-primary/20" data-testid="badge-category-{i}">` بالشكل `{name} (<span className="tabular-nums" data-testid="value-category-count-{i}">{count}</span>)`. **نمط لوني واحد للكل — ممنوع تدوير الألوان.**
  - **المواضيع** (إن وُجدت): `<h3 className="font-semibold mb-2" data-testid="label-topics-attention">مواضيع لفتت انتباهك</h3>` ثم badges `variant="outline"` افتراضية `data-testid="badge-topic-{i}"`.

## 8. القسم 4 — الاقتراحات (مستقل، يُخفى كلياً عند الغياب)

- ليس Collapsible ولا Card؛ يُخفى القسم بأكمله إن `suggestedArticles.length===0`.
- العنوان: `<h2 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-suggestions"><Lightbulb className="h-6 w-6 text-primary"/> مقترح لك</h2>` ثم `<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">` (الـ API يعيد 3 كحد أقصى).
- كل بطاقة = مكوّن `SuggestionCard` (§13): صورة `aspect-[16/9]` + badge الفئة + عنوان `line-clamp-2`، `hover-elevate`، رابط AR `/article/{englishSlug||slug}` · EN `/en/article/{englishSlug||slug}`.

## 9. القسم 5 — النشاط الزمني (Card + Collapsible، مفتوح)

- Card بمعادلة البطاقة، `data-testid="card-time-activity"`. العنوان: `<Zap className="h-6 w-6 text-primary"/>` + «نشاطك على مدار اليوم» (`heading-time-activity`).
- `CardDescription data-testid="text-activity-summary"` بقواعد:
  - `totalCount = Σ hourlyBreakdown[].count`. إن `totalCount===0` → يُخفى الوصف والرسم معاً ويبقى صندوق الاقتراح فقط.
  - الذروة تظهر دائماً عند `totalCount>0`: «أكثر أوقات قراءتك: `<strong data-testid="value-peak-time">{formatHour(peakReadingTime)}</strong>`».
  - الانخفاض يظهر **فقط** إن `lowActivityPeriod !== 0 && totalCount>0`: ` • أقل فترات التفاعل: <strong data-testid="value-low-time">…</strong>`.
- الرسم: §10. تحته صندوق الاقتراح: `<div className="mt-6 p-4 bg-primary/10 rounded-lg border border-primary/20" data-testid="box-ai-suggestion">` بداخله `<div className="flex items-start gap-3">`: `<Lightbulb className="h-5 w-5 shrink-0 mt-0.5 text-primary"/>` + `<p className="text-sm leading-relaxed"><strong>اقتراح AI:</strong> <span data-testid="text-ai-suggestion">{aiSuggestion}</span></p>`.
- `formatHour` AR: 0→«12 ص»، <12→`{h} ص`، 12→«12 م»، >12→`{h-12} م`. EN: AM/PM.

## 10. الرسم البياني (recharts — مواصفة حاسمة)

يُنفَّذ داخل مكوّن `HourlyActivityChart` (§13):
- الحاوية: `<div className="h-72 md:h-80 w-full" dir="ltr" data-testid="chart-hourly-activity">` (**`dir="ltr"` دائماً في اللغتين**).
- `<AreaChart data margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>`:
  - `<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))"/>`
  - `<XAxis dataKey="hour" tickFormatter={formatHour} tickLine={false} axisLine={false} interval={3} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} reversed={reversed}/>` — `reversed=true` في AR فقط.
  - `<YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11, style: { fontVariantNumeric: "tabular-nums" } }}/>`
  - `<Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)", direction: isRTL ? "rtl" : "ltr", textAlign: isRTL ? "right" : "left", fontSize: 12 }} labelStyle={{ color: "hsl(var(--foreground))" }} labelFormatter={(h)=>tooltipTitle(h)} formatter={(v)=>[`${v} ${valueSuffix}`, seriesName]}/>`
  - `<Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} fill="hsl(var(--primary))" fillOpacity={0.15} dot={false} activeDot={{ r: 4 }}/>`

## 11. القسم 6 — مؤشرات الأداء التفصيلية (Collapsible، **مطوي افتراضياً**)

- الرأس خارج البطاقات: `<div className="flex items-center justify-between gap-2 mb-4">` → `<h2 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-performance-metrics"><BarChart3 className="h-6 w-6 text-primary"/> مؤشرات الأداء التفصيلية</h2>` + زر الطي `button-toggle-metrics`.
- `<CollapsibleContent>` → `<div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 md:gap-4">` بست بطاقات `MetricCard` (§13):

| testId | Label AR | Icon | Subtext/Extra |
|---|---|---|---|
| `metric-articles-read` | المقالات المقروءة | BookOpen | سطر التغيّر (القواعد أدناه) |
| `metric-reading-time` | وقت القراءة الإجمالي | Clock | subtext «إجمالي دقائق آخر 24 ساعة»، القيمة `{n} دقيقة` |
| `metric-completion-rate` | معدل إكمال القراءة | Target | `<Progress value={completionRate} className="mt-2" data-testid="progress-completion-rate"/>`، القيمة `{n}%` |
| `metric-bookmarks` | المقالات المحفوظة | Bookmark | subtext «أغلبها عن {topCategories[0].name}» عند وجوده |
| `metric-likes` | الإعجابات | Heart | — |
| `metric-comments` | التعليقات | MessageSquare | — |

- **سطر التغيّر** (`text-change-articles`): يظهر فقط إذا `percentChangeFromYesterday !== 0 && percentChangeFromYesterday !== 100` (القيمة 100 قسرية = أمس صفر → تُخفى). الأيقونة: `TrendingUp className="h-4 w-4 text-success"` / `TrendingDown className="h-4 w-4 text-destructive"`. النص: «بزيادة/بانخفاض `{Math.abs(change)}%` عن أمس» بـ `tabular-nums`.
- **كل** شرائح الأيقونات هنا موحّدة: `h-12 w-12 rounded-full bg-primary/10` + أيقونة `h-6 w-6 text-primary`. ممنوع تلوين خاص بكل بطاقة.

## 12. القسم 7 — لمسات AI (Card + Collapsible، مفتوح)

- يظهر فقط عند وجود `aiInsights`. **المزاج محذوف منه نهائياً** (انتقل للـ Hero).
- `<Card className="border-0 bg-ai-gradient-soft shadow-sm dark:border dark:border-card-border" data-testid="card-ai-insights">`.
- العنوان: `<Sparkles className="h-6 w-6 text-primary"/>` + «لمسات الذكاء الاصطناعي» (`heading-ai-touches`) · الوصف: «تحليل ذكي لأدائك القرائي اليومي».
- المحتوى `space-y-4` — صندوقان مكدّسان بعرض كامل، كلاهما `rounded-lg bg-card p-4 md:p-6 shadow-sm`:
  1. `data-testid="box-focus-score"`: `<h3 className="font-semibold flex items-center gap-2"><Gauge className="h-5 w-5 text-primary"/> نسبة تركيزك اليوم</h3>` ثم `<div className="mt-3 flex items-center gap-3">`: `<Progress value={focusScore} className="flex-1" data-testid="progress-focus-score"/>` + `<span className="text-2xl font-bold tabular-nums text-ai-gradient" data-testid="value-focus-score">{n}%</span>`.
  2. `data-testid="box-daily-goal"`: `<h3 className="font-semibold flex items-center gap-2"><Target className="h-5 w-5 text-primary"/> هدفك المقترح لليوم</h3>` ثم `<p className="mt-2 text-sm leading-relaxed text-foreground/90" data-testid="text-daily-goal">{dailyGoal}</p>`.

## 13. نمط Collapsible الموحّد + المكوّنات الجديدة

**نمط الطي** (يُطبَّق حرفياً في الأقسام 3 و5 و6 و7):
```tsx
<Collapsible open={open} onOpenChange={setOpen}>
  {/* داخل CardHeader أو div الرأس */}
  <CollapsibleTrigger asChild>
    <Button size="sm" variant="ghost" data-testid="button-toggle-{section}">
      <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")}/>
    </Button>
  </CollapsibleTrigger>
  <CollapsibleContent>...</CollapsibleContent>
</Collapsible>
```

**مجلد جديد `client/src/components/daily-brief/`** (6 مكونات؛ الباقي داخل ملفي الصفحة):

| المكوّن | Props | ملاحظات |
|---|---|---|
| `MoodIcon.tsx` | `{ mood: string; className?: string }` | خريطة مزاج→lucide بمفاتيح AR+EN: تحليلي/Analytical→Brain، فضولي/Curious→Search، سريع/Fast→Zap، نقدي/Critical→Crosshair، افتراضي→BookOpen |
| `SuggestionCard.tsx` | `{ title, categoryName, imageUrl?: string\|null, href, index }` | `<Link>` يلف `<Card className="hover-elevate cursor-pointer h-full overflow-hidden border-0 shadow-sm dark:border dark:border-card-border">`؛ كتلة صورة `<div className="aspect-[16/9] w-full overflow-hidden bg-primary/10">`: `<img className="h-full w-full object-cover" loading="lazy" alt="" data-testid="img-suggestion-{i}">` أو عند غيابها `<Newspaper className="h-8 w-8 text-primary/40"/>` موسّطة؛ `CardContent p-4`: `<Badge variant="secondary" className="mb-2" data-testid="badge-suggestion-category-{i}">` + `<h4 className="font-semibold text-sm md:text-base leading-snug line-clamp-2" data-testid="text-suggestion-title-{i}">`؛ الرابط `data-testid="link-suggested-article-{i}"` |
| `MetricCard.tsx` | `{ testId, label, value, icon: LucideIcon, subtext?, progress?, change?: { direction: "up"\|"down", text } }` | معادلة البطاقة؛ `CardContent p-3 sm:p-4 md:p-6`؛ label `text-sm text-muted-foreground mb-2` (`label-*`)؛ value `text-2xl md:text-3xl font-bold tabular-nums` (`value-*`)؛ subtext `text-xs text-muted-foreground mt-1`؛ change row `flex items-center gap-1 mt-1` |
| `HourlyActivityChart.tsx` | `{ data, reversed, isRTL, formatHour, tooltipTitle, seriesName, valueSuffix }` | مواصفة §10 كاملة |
| `BriefStateView.tsx` | `{ variant: "empty"\|"error", title, description, action: { label, href? , onClick? }, arrowIcon }` | Card مركزية: `<CardContent className="flex flex-col items-center justify-center py-12 text-center">`؛ أيقونة `h-16 w-16 mb-4`: فارغ→`Eye text-muted-foreground`، خطأ→`AlertCircle text-destructive`؛ عنوان `text-2xl font-semibold mb-2`؛ وصف `text-muted-foreground mb-6`؛ زر Button default |
| `GuestBriefLanding.tsx` | `{ locale: "ar"\|"en" }` | §14 كاملة؛ الروابط داخلياً `/register`·`/login` (AR) و`/en/register`·`/en/login` (EN) |

## 14. الحالات الأربع

**آلية التفريع (حاسمة):** `queryFn` مخصص داخل كل صفحة (fetch مباشر بـ `credentials:"include"`، `retry:false` يبقى) يعيد:
`{ kind:"ok", data }` | `{ kind:"guest" }` (401) | `{ kind:"empty" }` (404/أي جسم فيه `hasActivity:false`) ويرمي Error لباقي الأخطاء. السبب: الـ fetcher الافتراضي يعيد `null` على 401 ويرمي برسالة بلا status على 404 — لا يصلح للتفريع.

1. **تحميل** (`isLoading`): بعد الباند `<div className="space-y-6" data-testid="loading-state">`: Card هيكل Hero (`CardContent p-6 md:p-8`: `Skeleton h-7 w-2/3` + `h-4 w-1/2 mt-3` + `h-4 w-1/3 mt-2`) → `grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4` بأربع `Skeleton className="h-20 rounded-2xl"` → Card هيكل `Skeleton h-40 w-full rounded-2xl`.
2. **ضيف** (`kind:"guest"`): عنوان الباند «موجزك اليومي» بلا action، وتحته `GuestBriefLanding` فقط:
   - **Hero تسويقي** `data-testid="guest-hero"`: Card بـ `bg-ai-gradient-soft` + معادلة البطاقة، `CardContent p-8 md:p-12 text-center`: شريحة `mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center` فيها `Sparkles h-8 w-8 text-primary`؛ `<h2 className="mt-4 text-2xl md:text-3xl font-bold" data-testid="guest-hero-title">موجزك اليومي، مصمَّم لك بالذكاء الاصطناعي</h2>`؛ `<p className="mx-auto mt-2 max-w-xl text-sm md:text-base text-muted-foreground" data-testid="guest-hero-description">سجّل مجاناً ليحلّل سبق قراءتك ويقترح لك ما يناسبك كل يوم.</p>`؛ صف CTAs `mt-6 flex flex-wrap items-center justify-center gap-3`: `Button` افتراضي asChild `data-testid="button-guest-register"` ← `/register` مع `UserPlus h-4 w-4` «إنشاء حساب مجاني» + `Button variant="outline"` asChild `data-testid="button-guest-login"` ← `/login` «تسجيل الدخول».
   - **شبكة قيم 2×2** `scroll-fade-in grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4`، أربع بطاقات بمعادلة البطاقة `data-testid="guest-value-{0..3}"` (`CardContent p-4 md:p-6`: شريحة `h-10 w-10 rounded-full bg-primary/10` بأيقونة `h-5 w-5 text-primary` + `h3 mt-3 font-semibold` + `p mt-1 text-sm text-muted-foreground`):
     0. Brain — «تحليل اهتماماتك» / «نقرأ سلوكك القرائي لنفهم ما يهمك فعلاً.»
     1. BarChart3 — «إحصاءات يومية شخصية» / «مقالاتك ودقائقك ومعدل إكمالك في لوحة واحدة.»
     2. Lightbulb — «اقتراحات ذكية» / «مقالات مختارة لك بناءً على مزاجك واهتماماتك.»
     3. Clock — «إيقاعك الزمني» / «اكتشف أفضل أوقات قراءتك وطوّر عادتك اليومية.»
   - **قائمة المزايا** Card `data-testid="guest-benefits"` (`CardContent p-6 md:p-8`): `<h3 className="font-semibold text-lg">بعد التسجيل تحصل على</h3>` ثم `<ul className="mt-4 space-y-3">` خمسة `<li className="flex items-center gap-3 text-sm md:text-base">` بأيقونة `Check h-4 w-4 shrink-0 text-primary`: «تحية شخصية باسمك كل يوم» · «تقرير مزاجك القرائي مع تفسيره» · «نسبة تركيزك وهدف يومي مقترح» · «رسم نشاطك على مدار الساعة» · «اقتراحات مقالات بصور تناسب ذوقك».
3. **فارغ** (`kind:"empty"`): `BriefStateView variant="empty"` — العنوان «لا يوجد نشاط بعد» · الوصف «ابدأ القراءة وسيظهر موجزك هنا خلال 24 ساعة.» · زر «استكشف الأخبار» ← `/news` (EN `/en/news`) مع `ArrowLeft` (AR) / `ArrowRight` (EN) `className="h-4 w-4"`. testids: `card-no-activity`, `text-no-activity-title`, `text-no-activity-description`, `button-explore-news`.
4. **خطأ** (غير ذلك): `BriefStateView variant="error"` — العنوان «تعذّر تحميل موجزك» · الوصف «حدث خطأ أثناء إنشاء الملخص. حاول مرة أخرى.» · زر «إعادة المحاولة» `onClick={refetch}` مع `RefreshCw h-4 w-4`. testids: `card-error`, `text-error-title`, `text-error-description`, `button-retry-brief`.

## 15. قواعد RTL/LTR (EN = مرآة)

- **ينعكس**: `dir` (rtl للمحتوى والباند في AR؛ لا شيء في EN) · محاذاة النصوص وترتيب flex/grid تلقائياً · أيقونة أسهم CTA (ArrowLeft↔ArrowRight) · `reversed` للمحور X · `direction/textAlign` للـ tooltip · `date-fns` locale (ar↔enUS) · بادئة الروابط `/en`.
- **لا ينعكس**: الأرقام (لاتينية + `tabular-nums` دائماً) · حاوية الرسم `dir="ltr"` · الأيقونات الدلالية · منطق `rotate-180` · ترتيب الأقسام · جميع `data-testid` (متطابقة في النسختين) · مفاتيح التخزين/queryKey.

## 16. الوضع الداكن

لا اختلافات خاصة بالصفحة سوى معادلة البطاقة المطبَّقة على كل Card (`border-0 shadow-sm dark:border dark:border-card-border`). `bg-ai-gradient-soft` و`text-ai-gradient` و`bg-card` و`popover/border` تتحول تلقائياً عبر التوكنات. لا `dark:` إضافية إطلاقاً.

## 17. خريطة الترجمة AR↔EN (كل نص ظاهر)

| AR | EN |
|---|---|
| صباح الخير / مساء الخير | Good morning / Good evening (+Good afternoon) |
| جاري التحميل… | Loading… |
| موجزك اليومي | Your Daily Brief |
| آخر تحديث | Updated |
| قرأت خلال آخر 24 ساعة {n} مقالاً خلال {m} دقيقة | In the last 24 hours you read {n} articles in {m} minutes |
| لم تُسجَّل قراءات خلال آخر 24 ساعة — يومك القرائي يبدأ الآن. | No reads logged in the last 24 hours — your reading day starts now. |
| — منها عن | — including |
| مزاجك القرائي اليوم: | Your reading mood today: |
| تميل اليوم إلى المقالات المعمّقة والتحليلات. | You're leaning toward in-depth pieces and analysis today. |
| تتنقّل بفضول بين مواضيع متنوعة. | You're hopping curiously across diverse topics. |
| قراءة سريعة بوتيرة عالية — تلتقط الجوهر بسرعة. | Fast-paced reading — you grasp the gist quickly. |
| تتوقف عند التفاصيل وتزن وجهات النظر. | You pause at details and weigh perspectives. |
| نمط قراءة متوازن اليوم. | A balanced reading pattern today. |
| المقالات المقروءة اليوم | Articles read today |
| وقت القراءة (دقيقة) | Reading time (min) |
| معدل الإكمال (%) | Completion rate (%) |
| نقاط التفاعل | Engagement points |
| ابدأ أول مقال | Start your first article |
| دقائقك بانتظارك | Your minutes await |
| أكمل مقالاً واحداً | Finish one article |
| تفاعل مع محتواك | Engage with a story |
| اهتماماتك اليوم | Your interests today |
| الفئات والمواضيع التي تصدّرت قراءتك خلال 24 ساعة | Categories and topics that topped your reading in 24 hours |
| مواضيع لفتت انتباهك | Topics that caught your attention |
| مقترح لك | Suggested for you |
| نشاطك على مدار اليوم | Your activity through the day |
| أكثر أوقات قراءتك: | Peak reading time: |
| أقل فترات التفاعل: | Lowest activity period: |
| اقتراح AI: | AI suggestion: |
| مؤشرات الأداء التفصيلية | Detailed performance metrics |
| المقالات المقروءة | Articles read |
| وقت القراءة الإجمالي | Total reading time |
| إجمالي دقائق آخر 24 ساعة | Total minutes in the last 24 hours |
| دقيقة | min |
| معدل إكمال القراءة | Reading completion |
| المقالات المحفوظة | Bookmarked articles |
| أغلبها عن | Mostly about |
| الإعجابات / التعليقات | Likes / Comments |
| بزيادة {n}% عن أمس / بانخفاض {n}% عن أمس | Up {n}% from yesterday / Down {n}% from yesterday |
| لمسات الذكاء الاصطناعي | AI insights |
| تحليل ذكي لأدائك القرائي اليومي | Smart analysis of your daily reading |
| نسبة تركيزك اليوم | Your focus score today |
| هدفك المقترح لليوم | Your suggested daily goal |
| موجزك اليومي، مصمَّم لك بالذكاء الاصطناعي | Your daily brief, designed for you by AI |
| سجّل مجاناً ليحلّل سبق قراءتك ويقترح لك ما يناسبك كل يوم. | Sign up free and let Sabq analyze your reading and suggest what fits you, every day. |
| إنشاء حساب مجاني / تسجيل الدخول | Create free account / Sign in |
| تحليل اهتماماتك | Interest analysis |
| نقرأ سلوكك القرائي لنفهم ما يهمك فعلاً. | We read your reading behavior to learn what truly matters to you. |
| إحصاءات يومية شخصية | Personal daily stats |
| مقالاتك ودقائقك ومعدل إكمالك في لوحة واحدة. | Your articles, minutes, and completion rate in one place. |
| اقتراحات ذكية | Smart suggestions |
| مقالات مختارة لك بناءً على مزاجك واهتماماتك. | Articles picked for you based on your mood and interests. |
| إيقاعك الزمني | Your time rhythm |
| اكتشف أفضل أوقات قراءتك وطوّر عادتك اليومية. | Discover your best reading times and build your daily habit. |
| بعد التسجيل تحصل على | After signing up you get |
| تحية شخصية باسمك كل يوم | A personal greeting with your name every day |
| تقرير مزاجك القرائي مع تفسيره | Your reading mood report with its explanation |
| نسبة تركيزك وهدف يومي مقترح | Your focus score and a suggested daily goal |
| رسم نشاطك على مدار الساعة | A chart of your around-the-clock activity |
| اقتراحات مقالات بصور تناسب ذوقك | Article suggestions with images that match your taste |
| لا يوجد نشاط بعد | No activity yet |
| ابدأ القراءة وسيظهر موجزك هنا خلال 24 ساعة. | Start reading and your brief will appear here within 24 hours. |
| استكشف الأخبار | Explore news |
| تعذّر تحميل موجزك | We couldn't load your brief |
| حدث خطأ أثناء إنشاء الملخص. حاول مرة أخرى. | Something went wrong while building your summary. Try again. |
| إعادة المحاولة | Try again |
| الساعة {h} | {h} (tooltip title) |
| مقال / المقالات (tooltip) | articles / Articles |
| ص / م (ساعات) | AM / PM |

## 18. عقد البيانات المعتمد (الموحّد AR/EN)

`DailySummary`: `interestAnalysis.suggestedArticles[]` بحقول `id,title,slug,englishSlug?,categoryName,imageUrl?` — الحقل **`categoryName`** (وليس `category`). EN تستهلك `/api/en/ai/daily-summary` بنفس العقد تماماً. حراس `?? 0` إلزامية في النسختين. `readingMood` قد يصل بمفاتيح عربية أو إنجليزية — `MoodIcon` وخريطة التفسير تدعمان الاثنين.

## 19. ما لا يتغيّر

- `Header`/`Footer`/`EnglishLayout` والمسارات (`/daily-brief`, `/en/daily-brief`) وكل روابط `/news`, `/login`, `/register`.
- queryKeys: `["/api/ai/daily-summary"]`, `["/api/en/ai/daily-summary"]`, `["/api/auth/user"]` ومنطق `handleRefresh` (invalidate + refetch).
- `MobileOptimizedKpiCard` و`AccountSectionHeader` ومكونات `ui/*` — استهلاك فقط، بلا تعديل.
- لا dependencies جديدة، لا keyframes جديدة، لا ألوان ثابتة، لا تعديل على `index.css` أو `tailwind.config.ts`.
