# تقرير الاستكشاف E2 — عقد بيانات الموجز اليومي

> المصدر: مدقق_عقد_البيانات. الأدلة بصيغة path:line.

## 1) المعالجات والمصادقة
- **العربي:** `GET /api/ai/daily-summary` — `server/routes/smartInterests.ts:175`.
- **الإنجليزي (منفصل):** `GET /api/en/ai/daily-summary` — `server/routes.ts:28338`.
- كلاهما خلف `requireAuth`: 401 `{message:"Unauthorized"}` لغير المسجّل (`server/rbac.ts:187-190`).
- مستخدم غير موجود: 404 `{message:"User not found"}`.
- **بلا نشاط 24 ساعة: 404 `{message:"لا توجد نشاطات...", hasActivity:false}`** (`smartInterests.ts:215-220`).
- خطأ داخلي: 500 `{message:"فشل في إنشاء الملخص اليومي"}`.
- مصدر البيانات: جدول `userEvents` (read/save/like/comment + metadata.readDuration/scrollDepth).

## 2) مخطط استجابة 200 العربية (`smartInterests.ts:425-433`)
| الحقل | Nullability | ملاحظات |
|---|---|---|
| `hasActivity` | مضمون true | العميل لا يقرأه حالياً |
| `personalizedGreeting` | مضمون | userName, articlesReadToday, readingTimeMinutes (قد يكون 0), topCategories (حد أقصى 2، قد تفرغ), readingMood (تحليلي/فضولي/سريع/نقدي) |
| `metrics` | مضمون | articlesRead, readingTimeMinutes, completionRate (=متوسط scrollDepth), articlesBookmarked, articlesLiked, commentsPosted, percentChangeFromYesterday (**=100 قسراً إذا كان أمس صفراً**) |
| `interestAnalysis.topCategories` | قد يكون فارغاً | `{name,count}[]` حد أقصى 3 |
| `interestAnalysis.topicsThatCatchAttention` | قد يكون فارغاً | حد أقصى 5 |
| `interestAnalysis.suggestedArticles` | قد يكون فارغاً | حد أقصى 3؛ الحقول: id,title,slug,englishSlug?,imageUrl? و⚠️ **`category` بينما العميل يتوقع `categoryName`** (`smartInterests.ts:364`) → الشارات تظهر فارغة |
| `timeActivity.hourlyBreakdown` | دائماً 24 عنصراً | الأصفار موجودة |
| `timeActivity.peakReadingTime` | 0-23 | |
| `timeActivity.lowActivityPeriod` | 0 احتياطياً | يُعرض «12 ص» بشكل خادع |
| `timeActivity.aiSuggestion` | مضمون | نصوص شرطية ثابتة |
| `aiInsights` | مضمون | readingMood, dailyGoal, focusScore |
| `generatedAt` | مضمون ISO | **العميل لا يعرضه** |

## 3) ⚠️ عقد السيرفر الإنجليزي غير متطابق (خلل فعلي)
`server/routes.ts:28538-28542` يرجع:
```ts
interestAnalysis = { categoryBreakdown, topicsThatCatchAttention, suggestedCategories }
```
بينما الصفحة الإنجليزية تقرأ `topCategories` و`suggestedArticles` (`EnglishDailyBrief.tsx:413,444`) → **TypeError — الصفحة الإنجليزية معطلة**.
كما أن `readingMood` يأتي بقيم إنجليزية (Analytical/Curious/Fast/Critical).
**القرار المعتمد:** توحيد العقد الإنجليزي ليطابق العربي (`topCategories` + `suggestedArticles` من enArticles) — مهمة backend ضمن السرب.

## 4) سيناريوهات الحالات التي يجب أن يغطيها التصميم
1. **Loading** — skeleton.
2. **401 غير مسجّل** — يجب وضع ضيف/دعوة تسجيل (وليس «لا توجد بيانات»).
3. **404 hasActivity:false** — حالة فارغة مع CTA للأخبار.
4. **500** — حالة خطأ مع زر إعادة محاولة (refetch جاهز).
5. **نشاط جزئي/صفري:** KPIs صفرية، topCategories فارغ، اقتراحات فارغة، نشاط في ساعة واحدة (رسم مسطّح).
6. **حالات حدّية:** percentChange=100 المضللة، lowActivityPeriod=0، readingTimeMinutes=0 رغم وجود قراءات.

## 5) الصفحة الإنجليزية الحالية (فروق عن العربية)
- داخل `EnglishLayout` (لا Header/Footer)، ترويسة h1 يدوية بدل AccountSectionHeader.
- بلا شريط KPIs العلوي، بلا حراس `?? 0`، رسم h-64 بلا reversed (LTR).
- بطاقة ترحيب أبسط، aiInsights إلزامي في الـ interface.

## 6) SmartSummaryBlock (منفصل)
- لا تستهلكه صفحة الموجز؛ يستخدم `/api/ai/insights/today` (عقد مختلف + كاش 60ث).
- يملك **وضع ضيف أنيق**: بانر تسجيل (`SmartSummaryBlock.tsx:108-156`) — نمط يستحق النقل للموجز، ويربط إلى `/daily-brief`.
