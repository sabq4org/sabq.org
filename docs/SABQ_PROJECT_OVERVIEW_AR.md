# مشروع صحيفة "سبق الذكية" — وثيقة تعريفية تقنية شاملة

> مرجع هندسي تفصيلي لإعادة بناء منصة إخبارية مماثلة (مثل "عاجل الإلكترونية") على بيئة Replit، مستند إلى المعمارية الفعلية المنشورة على [sabq.org](https://sabq.org).
>
> **الإصدار**: 2.0 — *موسّع* | **آخر تحديث**: 20 أبريل 2026

---

## 📋 جدول المحتويات

1. [مقدمة تعريفية](#1-مقدمة-تعريفية)
2. [برومبت تأسيسي لـ Replit Agent](#2-برومبت-تأسيسي-جاهز-للنسخ-إلى-replit-agent)
3. [هيكلية النظام الكاملة](#3-هيكلية-النظام-الكاملة)
4. [تفاصيل لوحة التحكم](#4-تفاصيل-لوحة-التحكم-adminapp-والخدمات-الإدارية)
5. [واجهة المستخدم (Frontend)](#5-واجهة-المستخدم-frontend)
6. [طبقة API والخدمات الخلفية](#6-طبقة-api-والخدمات-الخلفية)
7. [نموذج البيانات](#7-نموذج-البيانات-shared-schema)
8. [التقنيات الكاملة](#8-التقنيات-الكاملة)
9. [الـ Workflows والنشر](#9-الـ-workflows-والنشر-الكامل)
10. [إرشادات التخصيص لمشروع مماثل](#10-إرشادات-التخصيص-لمشروع-عاجل-الإلكترونية)
11. [الأمان وأفضل الممارسات](#11-الأمان-وأفضل-الممارسات)
12. [المراقبة والصيانة](#12-المراقبة-والصيانة-التشغيلية)
13. [ملاحق وموارد](#13-ملاحق-وموارد-مساعدة)

---

## 1. مقدمة تعريفية

**سبق الذكية** (Sabq Smart) منصة إخبارية ثلاثية اللغة (العربية/الإنجليزية/الأردية) مبنية على Replit، مدعومة بطبقة ذكاء اصطناعي عميقة لتخصيص المحتوى، توليد الموجزات، التصنيف، والترجمة الآلية.

### الأرقام الإجمالية للمشروع

| المؤشر | القيمة |
|---|---:|
| جداول قاعدة البيانات | **250+** |
| صفحات React في الواجهة | **127** |
| مكونات React | **314+** |
| ملفات routes في Express | **54** |
| لغات الواجهة | **3** (ar / en / ur) |
| تكاملات AI | **3** (Anthropic, OpenAI, Gemini) |
| تكاملات خارجية | Twilio, Stripe, Tap Payments, ElevenLabs, Google TTS, SendGrid |
| نتيجة جاهزية الوكلاء | **100/100** على [isitagentready.com](https://isitagentready.com) |

### الأهداف المحققة

- **سرعة النشر**: من فكرة الخبر إلى الصفحة الرئيسية في أقل من دقيقة عبر مساعد التحرير الذكي.
- **تخصيص فردي**: خوارزمية مطابقة (Match Score) تعرض لكل قارئ نسبة توافق الخبر مع اهتماماته.
- **جاهزية الوكلاء (Agent-Native)**: متوافق مع RFC 8288/9727/9728، MCP، Agent Skills، WebMCP.
- **بنية مستقرة للإنتاج**: تخدم آلاف القراء مع كاش متعدد الطبقات (Cloudflare Worker + Edge Cache + Server Cache).
- **تطبيق محمول**: غلاف Capacitor لـ Android و iOS من نفس قاعدة الكود.

---

## 2. برومبت تأسيسي جاهز للنسخ إلى Replit Agent

> 📌 انسخ هذا البرومبت كاملاً وألصقه في محادثة Replit Agent جديدة لبناء منصة "عاجل الإلكترونية" أو أي مشروع إخباري مشابه.

```
ابنِ لي منصة إخبارية إلكترونية احترافية بهوية "عاجل الإلكترونية" بنفس
معايير صحيفة "سبق الذكية" (sabq.org). المتطلبات الكاملة:

═══ المعمارية ═══
- Full-stack JavaScript على Replit (Node.js 20 + Postgres 16).
- Backend: Express 4 + TypeScript على البورت 5000.
- Frontend: React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui.
- Database: Drizzle ORM 0.39 على Postgres (Neon Serverless).
- Routing: wouter للواجهة، Express routes للـ API.
- State: TanStack Query v5، react-hook-form + zod للنماذج.
- Auth: Replit OIDC + جلسات في Postgres.
- Deploy: Reserved VM autoscale، نطاق مخصص عبر Cloudflare.

═══ النموذج (shared/schema.ts) ═══
ابنِ الجداول التالية أولاً قبل أي شيء:
1. users, sessions, roles, permissions, role_permissions, user_roles
2. categories (سلوغ، اسم بلغات متعددة، أيقونة، لون، parent_id)
3. articles (slug، title، subtitle، excerpt، content (TipTap JSON)،
   featured_image، category_id، author_id، status (draft/review/published)،
   published_at، view_count، seo (jsonb)، tags (text[])،
   ai_summary، ai_keywords، embedding (vector))
4. comments (article_id، user_id، parent_id، content، status، sentiment)
5. reactions (article_id، user_id، type)
6. bookmarks، reading_history
7. tags، topics، entities
8. notifications_inbox، push_devices، push_campaigns
9. ad_accounts، campaigns، ad_groups، creatives، impressions، clicks
10. activity_logs، audit_logs

استخدم لكل جدول:
- `createInsertSchema(table).omit({ id, createdAt })`
- `type Insert{Name} = z.infer<typeof insert{Name}Schema>`
- `type {Name} = typeof {table}.$inferSelect`

═══ طبقة التخزين (server/storage.ts) ═══
أنشئ interface IStorage يحوي كل عمليات CRUD لكل جدول.
نفّذ DatabaseStorage تستخدم Drizzle. لا تستدعِ Drizzle مباشرة من routes.

═══ API Routes (server/routes.ts) ═══
- GET  /api/articles?page&limit&category&lang
- GET  /api/articles/:slug
- POST /api/articles (محمي + RBAC)
- GET  /api/categories
- GET  /api/categories/:slug/articles
- POST /api/comments
- POST /api/reactions
- POST /api/bookmarks/toggle
- GET  /api/me/reading-history (مستخدم مسجل دخول)
- POST /api/me/reading-history (مزامنة دفعة)
- GET  /api/feed/personalized (خوارزمية المطابقة)
- GET  /api/breaking-ticker/active
- GET  /api/search?q
- و routes الإدارة تحت /api/admin/*

كل route يجب أن:
1. يتحقق من CSRF (POST/PATCH/DELETE).
2. يستخدم Zod للتحقق من body.
3. يستدعي storage.* وليس db.* مباشرة.
4. يعيد JSON منظم.

═══ الواجهة (client/src/) ═══
صفحات أساسية تحت client/src/pages/:
- Home.tsx (Hero + Breaking Ticker + Personalized Feed + Categories Grid)
- ArticleDetail.tsx (محتوى + تعليقات + توصيات + موجز صوتي)
- CategoryPage.tsx (قائمة مقالات الفئة)
- SearchPage.tsx
- Login.tsx، Register.tsx، Profile.tsx
- Bookmarks.tsx، ReadingHistory.tsx
- AdminLayout.tsx (محمي) يحوي:
  - Dashboard.tsx (KPIs، live visitors)
  - ArticlesManagement.tsx، ArticleEditor.tsx (TipTap)
  - CategoriesManagement.tsx
  - UsersManagement.tsx
  - CommentsModeration.tsx
  - PushNotifications.tsx
  - BreakingTickerManager.tsx
  - AnalyticsDashboard.tsx

مكونات مشتركة في client/src/components/:
- Header، Footer، Sidebar (shadcn)
- ArticleCard، CategoryPills، Breadcrumbs
- AIRecommendations، MatchBadge
- ThemeToggle، LanguageSwitcher
- CommentsList، CommentForm
- AdSlot

استخدم:
- `useQuery({ queryKey: ['/api/articles'] })` بدون queryFn (الافتراضي مضبوط).
- `useMutation` مع `apiRequest` و invalidateQueries.
- `useForm` + `zodResolver` لكل النماذج.
- `data-testid` على كل عنصر تفاعلي.

═══ الذكاء الاصطناعي ═══
أنشئ server/ai-manager.ts يوزّع المهام:
- توليد عنوان وموجز → Anthropic Claude
- ترجمة آلية → Gemini
- تصنيف وتوسيم → OpenAI
- توصيات شخصية → embeddings + cosine similarity

أنشئ server/services/recommendationEngine.ts يستخدم:
- user_affinities (نقاط لكل فئة)
- user_dynamic_interests (كلمات مفتاحية متابعة)
- reading_history آخر 30 يوماً
- cosine similarity على embeddings

═══ التخصيص الجمالي ═══
- ألوان "عاجل" (مثلاً أحمر داكن primary): عدّل --primary في
  client/src/index.css بصيغة H S% L% (بدون hsl()).
- شعار "عاجل" في client/public/logo.svg.
- خط Tajawal/Cairo للعربية، Inter للإنجليزية.
- دعم RTL/LTR تلقائي.
- Dark mode كامل عبر class strategy.

═══ المتغيرات السرية المطلوبة ═══
DATABASE_URL، SESSION_SECRET، REPL_ID، ISSUER_URL،
OPENAI_API_KEY، ANTHROPIC_API_KEY، GEMINI_API_KEY،
ELEVENLABS_API_KEY، GOOGLE_TTS_CREDENTIALS_JSON،
TWILIO_ACCOUNT_SID، TWILIO_AUTH_TOKEN، TWILIO_PHONE_NUMBER،
STRIPE_SECRET_KEY، VITE_STRIPE_PUBLIC_KEY.

═══ ميزات إضافية مطلوبة ═══
1. Breaking Ticker مباشر عبر WebSocket.
2. تعليقات بمراجعة AI آلية + قائمة كلمات محظورة.
3. موجز صوتي (TTS) لكل مقال — ElevenLabs أساسي + Google fallback.
4. نشرة بريد آلية يومية.
5. Push Notifications عبر Web Push API.
6. Bookmarks + Reading History تتزامن بين الأجهزة.
7. SEO كامل: sitemap.xml، robots.txt، Schema.org JSON-LD،
   Open Graph، Twitter Cards.
8. Agent-Ready: ملفات /.well-known/api-catalog،
   /.well-known/mcp/server-card.json، Link headers،
   Markdown content negotiation.

═══ معايير الجودة ═══
- لا تستخدم أي emoji في الـ UI.
- مكونات shadcn حصراً للأزرار، البطاقات، النماذج.
- ارتفاعات موحّدة للعناصر التفاعلية (min-h-9 افتراضي).
- spacing ثابت (small/medium/large فقط).
- ثلاث مستويات لون نص (default/secondary/tertiary).
- borders بشكل دائري كامل (border-l-4 ممنوع على عناصر rounded).
- hover-elevate / active-elevate-2 للتفاعلات بدلاً من hover:bg-*.
- data-testid على كل عنصر تفاعلي.

═══ ترتيب التنفيذ ═══
1. shared/schema.ts كامل أولاً.
2. server/storage.ts مع IStorage.
3. server/routes.ts للـ API الأساسي.
4. client/src/App.tsx + Router + ThemeProvider + QueryClientProvider.
5. الصفحات العامة (Home، ArticleDetail، Category).
6. لوحة التحكم.
7. تكاملات AI.
8. النشر + Cloudflare Worker.

ابدأ بالخطوة 1 الآن واسألني فقط عند نقاط القرار الكبرى
(مثل اختيار ألوان الهوية أو دمج خدمة دفع).
```

> 💡 **نصيحة**: قسّم البرومبت إلى مهام متتابعة عبر زر "Plan tasks" في Replit Agent بدلاً من تنفيذه دفعة واحدة، حتى تستطيع المراجعة بين كل مرحلة.

---

## 3. هيكلية النظام الكاملة

### 3.1 المخطط الشامل

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    القراء / الوكلاء الذكية / تطبيق الجوال                  │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Cloudflare Edge Layer                                                    │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐  │
│  │ SEO 404 Worker      │  │ Image Proxy Worker  │  │ DNS + WAF + SSL  │  │
│  │ • Prerender HP      │  │ • WebP/AVIF convert │  │ • DDoS shield    │  │
│  │ • Markdown negot.   │  │ • Resize            │  │ • HSTS + CSP     │  │
│  │ • Cache (60-300s)   │  │ • Cache (1y)        │  │                  │  │
│  └─────────────────────┘  └─────────────────────┘  └──────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Replit Reserved VM (Production Deployment)                               │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  Express App (port 5000) — server/bootstrap.ts → server/index.ts   │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │  │
│  │  │ HTTP Routes  │ │ WebSocket    │ │ Background   │ │ Vite SSR   │ │  │
│  │  │ /api/*       │ │ Live ticker  │ │ Workers      │ │ (dev only) │ │  │
│  │  │              │ │ Notifications│ │ • TTS gen    │ │            │ │  │
│  │  │              │ │ Live count   │ │ • Newsletter │ │            │ │  │
│  │  │              │ │              │ │ • Embeddings │ │            │ │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │  │
│  │                          │                                          │  │
│  │  ┌────────────────────────────────────────────────────────────────┐ │  │
│  │  │  Middleware Stack (order matters)                              │ │  │
│  │  │  Helmet → CORS → Rate Limit → CSRF → Session (Postgres) →     │ │  │
│  │  │  Cache Headers → Body Parser → Routes → Vite/Static → 404      │ │  │
│  │  └────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                      │  │
│  │  ┌────────────────────────────────────────────────────────────────┐ │  │
│  │  │  Service Layer (server/services/*, server/*Service.ts)         │ │  │
│  │  │  • AIManager (Anthropic / OpenAI / Gemini routing)             │ │  │
│  │  │  • RecommendationEngine                                         │ │  │
│  │  │  • EmbeddingsService (pgvector)                                │ │  │
│  │  │  • NotificationEngine (push + email + whatsapp)                │ │  │
│  │  │  • DigestService (daily/hourly summaries)                      │ │  │
│  │  │  • DeepAnalysisEngine                                          │ │  │
│  │  │  • SmartCategoriesEngine                                       │ │  │
│  │  │  • EventTrackingService                                        │ │  │
│  │  │  • AffinityService                                             │ │  │
│  │  │  • SimilarityEngine                                            │ │  │
│  │  └────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                      │  │
│  │  ┌────────────────────────────────────────────────────────────────┐ │  │
│  │  │  Storage Layer (server/storage.ts) — IStorage interface        │ │  │
│  │  │  جميع عمليات CRUD تمر عبر هذا interface                          │ │  │
│  │  └────────────────────────────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
        │                  │                  │                       │
        ▼                  ▼                  ▼                       ▼
┌───────────────┐  ┌─────────────────┐  ┌──────────┐  ┌──────────────────────┐
│ Neon Postgres │  │ Object Storage  │  │ Replit   │  │ External APIs        │
│ • 250+ table  │  │ (GCS-backed)    │  │ Auth     │  │ • OpenAI / Claude /  │
│ • pgvector    │  │ • /public/*     │  │ (OIDC)   │  │   Gemini             │
│ • pooled conn │  │ • /.private/*   │  │          │  │ • ElevenLabs TTS     │
│ • Branching   │  │                 │  │          │  │ • Google TTS         │
└───────────────┘  └─────────────────┘  └──────────┘  │ • Twilio (SMS/WA)    │
                                                       │ • Stripe / Tap Pay   │
                                                       │ • SendGrid / Mailgun │
                                                       └──────────────────────┘
```

### 3.2 خريطة المجلدات

```
sabq-smart/
├── client/                      # تطبيق React (Vite)
│   ├── public/                  # ملفات ثابتة (favicon، manifest، robots)
│   ├── index.html
│   └── src/
│       ├── main.tsx             # نقطة الدخول
│       ├── App.tsx              # Router + Providers
│       ├── index.css            # متغيرات Tailwind + ألوان الهوية
│       ├── mobile.css           # تخصيصات الجوال
│       ├── components/          # 314+ مكون
│       │   ├── ui/              # shadcn primitives
│       │   ├── admin/           # خاص بلوحة التحكم
│       │   ├── article/         # عرض المقال
│       │   ├── home/            # الصفحة الرئيسية
│       │   └── ...
│       ├── pages/               # 127 صفحة
│       │   ├── admin/           # صفحات لوحة التحكم الإدارية
│       │   ├── dashboard/       # لوحات الأدوات الفرعية
│       │   ├── ifox/            # نظام إدارة المحتوى الذكي
│       │   ├── correspondent/   # بوابة المراسلين
│       │   ├── publishers/      # بوابة الناشرين
│       │   └── *.tsx
│       ├── contexts/            # React contexts (Auth، Theme، Language)
│       ├── hooks/               # Custom hooks (useAuth، useToast، useFavorites)
│       ├── lib/                 # utilities (queryClient، apiRequest، seo، matchScore)
│       ├── nav/                 # تكوين القوائم
│       ├── config/              # ثوابت التطبيق
│       └── utils/
│
├── server/                      # خادم Express
│   ├── bootstrap.ts             # نقطة دخول الإنتاج
│   ├── index.ts                 # تكوين Express + middlewares
│   ├── vite.ts                  # تكامل Vite (لا تعدّله)
│   ├── routes.ts                # routes رئيسية (يستورد من routes/*)
│   ├── routes/                  # 54 ملف routes متخصص
│   ├── auth.ts                  # Replit OIDC + Passport
│   ├── csrf.ts                  # حماية CSRF
│   ├── db.ts                    # Drizzle client
│   ├── storage.ts               # IStorage interface + implementation
│   ├── ai-manager.ts            # موزّع طلبات AI
│   ├── ai/                      # services خاصة بـ AI
│   ├── services/                # خدمات أعمال إضافية
│   ├── cacheMiddleware.ts       # ترويسات الكاش
│   ├── agentReady.ts            # Agent-Native (Link headers، API catalog، MCP)
│   └── *.ts                     # خدمات متخصصة
│
├── shared/
│   └── schema.ts                # نموذج البيانات الموحّد (250+ جدول)
│
├── cloudflare-worker/           # Workers تنشر يدوياً
│   ├── seo-404-worker.js        # 404 صحيح + prerender + markdown negot.
│   ├── image-proxy-worker.js    # تحويل صور تلقائي
│   ├── deploy.sh                # سكربت نشر
│   └── wrangler.toml
│
├── android/                     # Capacitor — تطبيق Android
├── ios/                         # Capacitor — تطبيق iOS
├── capacitor.config.ts
│
├── migrations/                  # تتولّاها Drizzle Kit (لا تعدّلها يدوياً)
├── scripts/
│   └── post-merge.sh            # يعمل بعد كل دمج تلقائياً
│
├── docs/                        # وثائق المشروع (هذه الوثيقة منها)
├── e2e/                         # اختبارات End-to-End
├── public/                      # ملفات ثابتة عامة (sitemap، robots، .well-known)
│
├── package.json                 # 200+ dependency
├── vite.config.ts               # تكوين Vite (لا تعدّله)
├── tailwind.config.ts           # ألوان + plugins
├── drizzle.config.ts            # تكوين Drizzle (لا تعدّله)
├── tsconfig.json
├── components.json              # تكوين shadcn
├── .replit                      # تكوين Replit (modules، deployment، ports)
└── replit.md                    # ذاكرة المشروع للـ Agent
```

---

## 4. تفاصيل لوحة التحكم (`/admin/*`) والخدمات الإدارية

لوحة التحكم محمية بمصادقة + RBAC. الوصول عبر `/admin/login` ثم التوجيه إلى `/admin` (Dashboard).

### 4.1 الخريطة الكاملة للصفحات الإدارية

#### قسم المحتوى

| المسار | الملف | الوصف |
|---|---|---|
| `/admin/articles` | `pages/ArticlesManagement.tsx` | قائمة المقالات + فلاتر + إجراءات جماعية |
| `/admin/articles/new` | `pages/ArticleEditor.tsx` | محرر TipTap كامل + AI assistant |
| `/admin/articles/:id/edit` | `pages/ArticleEditor.tsx` | تحرير + قفل تعاوني عبر `article_edit_locks` |
| `/admin/articles/:id/preview` | `pages/ArticlePreview.tsx` | معاينة كاملة قبل النشر |
| `/admin/categories` | `pages/CategoriesManagement.tsx` | إدارة الفئات + الفئات الذكية |
| `/admin/topics` | `pages/dashboard/TopicsManagement.tsx` | الموضوعات (مجموعات مقالات) |
| `/admin/tags` | عبر API | إدارة الوسوم |
| `/admin/stories` | `pages/dashboard/StoriesAdmin.tsx` | الستوريز (مثل Instagram) |
| `/admin/media-library` | `pages/dashboard/MediaLibrary.tsx` | مكتبة الوسائط مع AI alt-text |
| `/admin/breaking-ticker` | `pages/dashboard/BreakingTickerManager.tsx` | إدارة الشريط العاجل |
| `/admin/world-days` | `pages/dashboard/WorldDaysManagement.tsx` | الأيام العالمية + اقتراحات AI |
| `/admin/calendar` | `pages/CalendarPage.tsx` | التقويم التحريري + جدولة |

#### قسم الذكاء الاصطناعي

| المسار | الملف | الوصف |
|---|---|---|
| `/admin/ai-tools` | `pages/dashboard/AITools.tsx` | مجموعة أدوات AI (تلخيص، ترجمة، توليد) |
| `/admin/smart-blocks` | `pages/dashboard/SmartBlocksPage.tsx` | كتل محتوى ذكية ديناميكية |
| `/admin/smart-links` | `pages/dashboard/SmartLinksManagement.tsx` | روابط داخلية تلقائية |
| `/admin/deep-analysis` | `pages/dashboard/DeepAnalysis.tsx` | تحليل عميق للأخبار |
| `/admin/data-stories` | `pages/DataStoryGenerator.tsx` | قصص بيانات بصرية |
| `/admin/auto-images` | `pages/AutoImageSettings.tsx` | توليد صور تلقائي بـ AI |
| `/admin/foreign-news` | `pages/dashboard/ForeignNewsMonitor.tsx` | رصد وترجمة أخبار أجنبية |
| `/admin/transcription` | `pages/dashboard/TranscriptionTool.tsx` | تفريغ صوتي للمقابلات |
| `/admin/sentiment-analytics` | `pages/dashboard/SentimentAnalytics.tsx` | تحليل مشاعر التعليقات |

#### قسم النشر والتواصل

| المسار | الملف | الوصف |
|---|---|---|
| `/admin/audio-newsletters` | `pages/AudioNewslettersDashboard.tsx` | نشرة صوتية كل 3 ساعات |
| `/admin/audio-briefs` | `pages/AudioBriefsDashboard.tsx` | موجزات صوتية للمقالات |
| `/admin/voice-management` | `pages/dashboard/VoiceManagement.tsx` | إدارة أصوات ElevenLabs |
| `/admin/push-notifications` | `pages/admin/PushNotifications.tsx` | حملات Web Push |
| `/admin/whatsapp` | `pages/admin/WhatsAppManagement.tsx` | تكامل واتساب Twilio |
| `/admin/email-templates` | `pages/admin/EmailTemplatesPage.tsx` | قوالب البريد |
| `/admin/email-agent` | `pages/EmailAgentManagement.tsx` | وكيل بريد ذكي يرد آلياً |
| `/admin/announcements` | `pages/dashboard/AnnouncementsManagement.tsx` | إعلانات داخلية للموظفين |
| `/admin/communications` | `pages/dashboard/CommunicationsManagement.tsx` | حملات تواصل جماعية |

#### قسم الإعلانات والمدفوعات

| المسار | الملف | الوصف |
|---|---|---|
| `/admin/ads-newsletter-analytics` | `pages/dashboard/adsNewsletterAnalytics.tsx` | تحليلات إعلانات النشرة |
| `/admin/native-ads` | `pages/dashboard/NativeAdsManagement.tsx` | إعلانات مدمجة في المحتوى |
| `/advertiser/dashboard` | `pages/AdvertiserPortalDashboard.tsx` | بوابة المعلنين |
| `/advertiser/payments` | `pages/AdvertiserPaymentCallback.tsx` | تكامل Stripe + Tap |
| `/admin/payments` | `pages/admin/PaymentsDashboard.tsx` | تقارير المدفوعات |
| `/admin/media-store/orders` | `pages/admin/MediaStoreOrders.tsx` | طلبات متجر الوسائط |

#### قسم المستخدمين والصلاحيات

| المسار | الملف | الوصف |
|---|---|---|
| `/admin/users` | `pages/AdminUsers.tsx` | إدارة الحسابات |
| `/admin/staff` | `pages/admin/StaffMembers.tsx` | الموظفون + الأدوار |
| `/admin/roles` | داخل StaffMembers | RBAC تفصيلي |
| `/admin/correspondent-applications` | `pages/admin/CorrespondentApplications.tsx` | طلبات المراسلين |
| `/admin/opinion-applications` | `pages/admin/OpinionAuthorApplications.tsx` | طلبات كتّاب الرأي |
| `/admin/profile` | `pages/dashboard/DashboardProfile.tsx` | ملف المسؤول |

#### قسم الإشراف على المحتوى

| المسار | الملف | الوصف |
|---|---|---|
| `/admin/comments-moderation` | `pages/admin/CommentsModeration.tsx` | مراجعة التعليقات |
| `/admin/ai-moderation` | `pages/admin/AIModerationDashboard.tsx` | إشراف آلي بـ AI |
| `/admin/suspicious-words` | `pages/admin/SuspiciousWordsManagement.tsx` | قائمة كلمات محظورة |
| `/admin/contact-messages` | `pages/dashboard/ContactMessagesManagement.tsx` | رسائل التواصل |
| `/admin/accessibility-insights` | `pages/admin/AccessibilityInsights.tsx` | رؤى الوصولية |

#### قسم التحليلات والإحصائيات

| المسار | الملف | الوصف |
|---|---|---|
| `/admin/analytics` | `pages/AnalyticsDashboard.tsx` | لوحة KPIs الرئيسية |
| `/admin/article-analytics` | `pages/dashboard/ArticleAnalyticsDashboard.tsx` | إحصائيات مقال محدد |
| `/admin/personalization-analytics` | `pages/dashboard/PersonalizationAnalytics.tsx` | تحليل التخصيص |
| `/admin/staff-productivity` | `pages/dashboard/StaffProductivity.tsx` | إنتاجية الموظفين |
| `/admin/activity-logs` | `pages/dashboard/ActivityLogsPage.tsx` | سجل النشاط الكامل |
| `/admin/ab-tests` | `pages/ABTestsManagement.tsx` | تجارب A/B |

#### قسم Mirqab (رصد الأخبار العاجلة)

| المسار | الملف | الوصف |
|---|---|---|
| `/admin/mirqab` | `pages/dashboard/MirqabDashboard.tsx` | رادار الأخبار العاجلة |
| `/admin/mirqab/algorithm-articles` | داخل mirqab/ | مقالات مولّدة آلياً |
| `/admin/mirqab/radar-alerts` | داخل mirqab/ | تنبيهات الرادار |

#### قسم iFox (نظام إدارة المحتوى الذكي)

| المسار | الملف | الوصف |
|---|---|---|
| `/ifox/dashboard` | `pages/ifox/` | لوحة iFox الرئيسية |
| `/ifox/editorial-calendar` | داخل ifox/ | تقويم تحريري متقدم |
| `/ifox/strategy-insights` | داخل ifox/ | رؤى استراتيجية |
| `/ifox/quality-checks` | داخل ifox/ | فحوصات جودة آلية |

### 4.2 خدمات لوحة التحكم — تفصيل الـ Routes

كل ملف routes في `server/routes/*.ts` مرتبط بمجموعة وظائف:

| ملف Route | المسار الأساسي | الوظيفة |
|---|---|---|
| `homepage.ts` | `/api/homepage-lite` | بيانات الصفحة الرئيسية المُسبقة التحضير |
| `articles` (في routes.ts) | `/api/articles` | CRUD المقالات |
| `audioNewsletterRoutes.ts` | `/api/audio-newsletters` | نشرات صوتية + TTS |
| `pushNotificationRoutes.ts` | `/api/push` | حملات Web Push |
| `liveNews.ts` | `/api/live-news` | أخبار مباشرة عبر WebSocket |
| `mirqab.ts` | `/api/mirqab` | نظام رصد الأخبار |
| `nativeAds.ts` | `/api/native-ads` | إعلانات مدمجة |
| `advertiserAuth.ts` | `/api/advertiser/*` | مصادقة المعلنين |
| `advertiserPayments.ts` | `/api/advertiser/payments` | مدفوعات الإعلانات |
| `tapPaymentRoutes.ts` | `/api/tap` | بوابة Tap Payments |
| `commentModeration.ts` | `/api/comments/moderate` | إشراف التعليقات |
| `themes.ts` | `/api/themes` | إدارة السمات الـ 4 |
| `pollsRoutes.ts` | `/api/polls` | استطلاعات الرأي |
| `whatsappAgent.ts` | `/api/whatsapp` | وكيل واتساب |
| `emailAgent.ts` | `/api/email-agent` | وكيل البريد |
| `keywordFollowing.ts` | `/api/follow/keyword` | متابعة كلمات مفتاحية |
| `socialFollowing.ts` | `/api/follow/social` | متابعة كتّاب |
| `interests.ts` | `/api/interests` | اهتمامات المستخدم |
| `smartInterests.ts` | `/api/smart-interests` | اهتمامات ذكية متعلّمة |
| `recommendation` (في routes.ts) | `/api/feed/personalized` | الموجز الشخصي |
| `abTests.ts` | `/api/ab-tests` | تجارب A/B |
| `advancedAnalytics.ts` | `/api/analytics/advanced` | تحليلات متقدمة |
| `trendingKeywords.ts` | `/api/trending` | الكلمات الرائجة |
| `worldDays.ts` | `/api/world-days` | الأيام العالمية |
| `gulfEvents.ts` | `/api/gulf-events` | أحداث خليجية |
| `editorPresence.ts` | `/api/editor-presence` | حضور المحررين |
| `focalPoints.ts` | `/api/focal-points` | نقاط تركيز الصور |
| `nanoBananaRoutes.ts` | `/api/nano-banana` | تكامل Gemini Nano Banana |
| `infographicAi.ts` | `/api/infographic` | إنفوجرافيك آلي |
| `dataStoryRoutes` (data-story-routes.ts) | `/api/data-stories` | قصص بيانات |
| `aiTasksRoutes.ts` | `/api/ai-tasks` | مهام AI مجدولة |
| `smartClassificationRoutes.ts` | `/api/classify` | تصنيف آلي |
| `smartInsightsRoutes.ts` | `/api/insights` | رؤى ذكية |
| `smartNewsletterRoutes.ts` | `/api/smart-newsletter` | نشرة بريد ذكية |
| `newsletterAnalyticsRoutes.ts` | `/api/newsletter/analytics` | تحليلات النشرة |
| `mediaStoreRoutes.ts` | `/api/media-store` | متجر الوسائط |
| `storeCustomerRoutes.ts` | `/api/store/customer` | عملاء المتجر |
| `stories.ts` | `/api/stories` | الستوريز |
| `storyCardsRoutes.ts` | `/api/story-cards` | بطاقات قصص |
| `tags.ts` | `/api/tags` | الوسوم |
| `systemSettings.ts` | `/api/system/settings` | إعدادات النظام |
| `setup.ts` | `/api/setup/*` | إعداد أولي |
| `twoFactorRoutes.ts` | `/api/2fa` | المصادقة الثنائية |
| `splitRoutesIndex.ts` | متعدد | تجميع routes فرعية |
| `mobileApiRoutes.ts` | `/api/mobile/*` | endpoints مخصصة للجوال |
| `notebookLmRoutes.ts` | `/api/notebook-lm` | تكامل NotebookLM |
| `paymentAnalytics.ts` | `/api/payments/analytics` | تحليلات المدفوعات |
| `rssFeedRoutes.ts` | `/api/rss` | تغذية RSS |
| `foreignNewsRoutes.ts` | `/api/foreign-news` | أخبار أجنبية |
| `autoImageRoutes.ts` | `/api/auto-image` | توليد صور آلي |
| `visualAiRoutes.ts` | `/api/visual-ai` | تحليل بصري |
| `thumbnailRoutes.ts` | `/api/thumbnail` | صور مصغّرة ديناميكية |
| `newsMap.ts` | `/api/news-map` | خريطة الأخبار |
| `edgeExistsRoute.ts` | `/api/edge-exists` | فحص وجود محتوى للـ Worker |
| `adminActivityLogs.ts` | `/api/admin/activity-logs` | سجل نشاط الإدارة |
| `testEmailTemplates.ts` | `/api/test/email-templates` | اختبار قوالب |
| `ifox/*` | `/api/ifox/*` | نظام iFox |

### 4.3 خدمات الخلفية الذكية

#### `server/services/recommendationEngine.ts`

```typescript
async function generateFeedForUser(userId: string, lang: 'ar'|'en'|'ur') {
  // 1. اجلب user_affinities (نقاط لكل فئة)
  const affinities = await storage.getUserAffinities(userId);

  // 2. اجلب user_dynamic_interests (كلمات مفتاحية)
  const interests = await storage.getUserDynamicInterests(userId);

  // 3. اجلب reading_history آخر 30 يوماً
  const history = await storage.getReadingHistoryWindow(userId, 30);

  // 4. احسب embedding لـ "بصمة المستخدم"
  const userEmbedding = await embeddingsService.computeUserEmbedding(history);

  // 5. ابحث عن أقرب N مقال (cosine similarity على pgvector)
  const candidates = await storage.findSimilarArticles(userEmbedding, 100);

  // 6. أعد ترتيب بـ Match Score (مزيج: تشابه + تطابق فئة + كلمات + حداثة)
  return candidates
    .map(article => ({
      ...article,
      matchScore: computeMatchScore(article, affinities, interests),
      matchReason: explainMatch(article, affinities, interests),
    }))
    .sort((a, b) => b.matchScore - a.matchScore);
}
```

#### `server/ai-manager.ts` — توزيع طلبات AI

```typescript
class AIManager {
  async summarizeArticle(text: string): Promise<string> {
    // Anthropic Claude — أفضل في العربية الفصحى
    return this.providers.anthropic.summarize(text);
  }

  async translateArticle(text: string, target: 'en'|'ur'): Promise<string> {
    // Gemini — أرخص + جودة عالية للترجمة
    return this.providers.gemini.translate(text, target);
  }

  async classifyArticle(text: string): Promise<Category[]> {
    // OpenAI GPT-4o-mini — أسرع للتصنيف
    return this.providers.openai.classify(text);
  }

  async generateImage(prompt: string): Promise<string> {
    // Gemini Nano Banana لتوليد الصور
    return this.providers.gemini.generateImage(prompt);
  }
}
```

#### `server/services/notificationEngine.ts`

يدير:
- تجميع الأحداث (`notification_queue`).
- إزالة التكرار (`notification_memory`).
- تقسيم الجمهور (`push_segments`).
- إرسال متعدد القنوات (Web Push + Email + WhatsApp).
- تتبّع التحويل (`notification_metrics`).

---

## 5. واجهة المستخدم (Frontend)

### 5.1 الصفحات العامة (للقرّاء)

| الصفحة | الملف | المحتوى |
|---|---|---|
| الرئيسية | `pages/Home.tsx` | Hero + Breaking Ticker + CategoryPills + PersonalizedFeed + Latest Articles |
| تفاصيل المقال | `pages/ArticleDetail.tsx` | المحتوى + موجز صوتي + تعليقات + توصيات + مشاركة |
| فئة | `pages/CategoryPage.tsx` | قائمة مقالات الفئة + فلاتر |
| بحث | `pages/SearchPage.tsx` | بحث Full-text + فلاتر متقدمة |
| كاتب | `pages/EntityDetail.tsx` | صفحة كاتب/شخصية |
| رأي | `pages/AIPublisher.tsx` | مقالات الرأي |
| فيديو | `pages/VideoPage.tsx` | محتوى مرئي |
| أرشيف | `pages/ArchivePage.tsx` | تصفح حسب التاريخ |
| المفضلة | `pages/Bookmarks.tsx` | المقالات المحفوظة |
| سجل القراءة | `pages/ReadingHistory.tsx` | آخر ما قرأت |
| الإشعارات | `pages/Notifications.tsx` | صندوق الإشعارات |
| الملف الشخصي | `pages/Profile.tsx` | بيانات المستخدم |
| تخصيص الاهتمامات | `pages/EditInterests.tsx` | اختيار فئات وكلمات |
| استكشاف مستخدمين | `pages/DiscoverUsers.tsx` | متابعة كتّاب/قرّاء |
| الموجز اليومي | `pages/DailyBrief.tsx` | ملخص يومي شخصي |

### 5.2 المكونات المركزية

```
client/src/components/
├── Header.tsx               # شريط علوي + بحث + قائمة لغات
├── Footer.tsx               # تذييل + روابط قانونية
├── CategoryPills.tsx        # شريط فئات أسفل الـ Header (desktop only)
├── BreakingTicker.tsx       # شريط أخبار عاجلة متحرك
├── ArticleCard.tsx          # بطاقة مقال (variants: compact, hero, list)
├── PersonalizedFeed.tsx     # موجز "أخبارك الذكية"
├── MatchBadge.tsx           # شارة نسبة المطابقة (compact على الجوال)
├── AIRecommendations.tsx    # توصيات في صفحة المقال
├── CommentsList.tsx         # قائمة تعليقات + ردود
├── CommentForm.tsx          # نموذج تعليق + AI moderation
├── ShareButtons.tsx         # مشاركة (Twitter, WhatsApp, Telegram)
├── BookmarkButton.tsx       # زر حفظ
├── ReactionBar.tsx          # تفاعلات (إعجاب، مفيد، مفاجئ)
├── AudioPlayer.tsx          # مشغّل موجز صوتي
├── ThemeToggle.tsx          # تبديل dark/light
├── LanguageSwitcher.tsx     # ar/en/ur
├── AdSlot.tsx               # عرض إعلانات native
├── SEO.tsx                  # ترويسات meta + JSON-LD
└── ui/                      # shadcn primitives
```

### 5.3 إدارة الحالة

```typescript
// client/src/lib/queryClient.ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const url = queryKey[0] as string;
        const params = queryKey.slice(1).filter(Boolean);
        const fullUrl = params.length
          ? `${url}/${params.join('/')}`
          : url;
        const res = await fetch(fullUrl, { credentials: 'include' });
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      },
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export async function apiRequest(method: string, url: string, body?: any) {
  const csrf = await getCsrfToken();
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await res.json();
  return res.json();
}
```

### 5.4 نمط الصفحة النموذجي

```typescript
// pages/ArticleDetail.tsx
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { queryClient } from "@/lib/queryClient";

export default function ArticleDetail() {
  const [, params] = useRoute("/article/:slug");
  const slug = params?.slug;

  const { data: article, isLoading } = useQuery<Article>({
    queryKey: ['/api/articles', slug],
    enabled: !!slug,
  });

  const bookmarkMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/bookmarks/toggle`, { articleId: article!.id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/me/bookmarks'] }),
  });

  if (isLoading) return <ArticleSkeleton />;
  if (!article) return <NotFound />;

  return (
    <article data-testid={`article-${article.id}`}>
      <SEO title={article.title} description={article.excerpt} />
      <h1 data-testid="text-article-title">{article.title}</h1>
      ...
    </article>
  );
}
```

### 5.5 السمات (Themes) الأربع

من Task #34: 4 سمات بصرية يختارها المستخدم وتحفظ على مستوى الحساب (Task #36)، تُطبَّق فورياً (Task #37) وعلى مستوى الموقع (Task #39):

1. **كلاسيكي** — أحمر سبق التقليدي.
2. **عصري** — رمادي + أخضر معتدل.
3. **ليلي عميق** — ألوان داكنة عالية التباين.
4. **رمضاني** — ذهبي + بنفسجي.

تُحفظ في `themes` table، وتُطبَّق عبر CSS variables في `:root`.

---

## 6. طبقة API والخدمات الخلفية

### 6.1 ترتيب middlewares (server/index.ts)

```typescript
app.use(helmet({ contentSecurityPolicy: { directives: {...} } }));
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(rateLimit({ windowMs: 15*60*1000, max: 1000 }));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use(session({ store: pgSession, secret: SESSION_SECRET, ... }));
app.use(passport.initialize());
app.use(passport.session());

// Routes خاصة بدون CSRF أولاً
app.get('/api/csrf-token', getCsrfToken);
app.use('/api', validateCsrfToken);  // CSRF لكل /api/* بعد ذلك

await registerRoutes(app, server);     // كل الـ API routes
setupAgentReady(app);                  // Link headers + markdown negot.

if (DEV) {
  await setupVite(app, server);        // Vite dev middleware
} else {
  serveStaticWithRocketLoaderFix(app); // ملفات Vite المبنية
}
```

### 6.2 نمط Route نموذجي

```typescript
// server/routes.ts
app.post('/api/articles',
  isAuthenticated,
  hasPermission('articles.create'),
  async (req: any, res) => {
    try {
      const data = insertArticleSchema.parse(req.body);
      const article = await storage.createArticle({
        ...data,
        authorId: req.user.id,
      });

      // أحداث ما بعد النشر
      await eventTrackingService.track('article.created', { articleId: article.id });
      await embeddingsService.indexArticle(article);
      await notificationEngine.notifyFollowers(article);

      res.json(article);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ errors: err.errors });
      }
      console.error(err);
      res.status(500).json({ error: 'Internal error' });
    }
  }
);
```

### 6.3 جاهزية الوكلاء (`server/agentReady.ts`)

```typescript
export function setupAgentReady(app: Express) {
  // 1) Link headers على كل صفحات HTML
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    const links = [
      `<${origin}/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
      `<${origin}/openapi.json>; rel="service-desc"`,
      `<${origin}/api-docs>; rel="service-doc"`,
      `<${origin}/.well-known/mcp/server-card.json>; rel="mcp-server-card"`,
      `<${origin}/.well-known/agent-skills/index.json>; rel="agent-skills"`,
    ];
    res.setHeader('Link', links.join(', '));
    next();
  });

  // 2) Markdown content negotiation
  app.use(async (req, res, next) => {
    if (!wantsMarkdown(req)) return next();
    const body = await renderMarkdown(req.path);
    if (!body) return next();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.send(body);
  });

  // 3) /.well-known/api-catalog (RFC 9727)
  app.get('/.well-known/api-catalog', (req, res) => {
    res.setHeader('Content-Type', 'application/linkset+json; charset=utf-8');
    res.json({ linkset: [...] });
  });

  // 4) /.well-known/openid-configuration (OIDC discovery)
  app.get('/.well-known/openid-configuration', (req, res) => { ... });

  // 5) /.well-known/oauth-protected-resource
  app.get('/.well-known/oauth-protected-resource', (req, res) => { ... });

  // 6) MCP server card
  app.get('/.well-known/mcp/server-card.json', (req, res) => { ... });
}
```

---

## 7. نموذج البيانات (`shared/schema.ts`)

### 7.1 الفئات الكبرى من 250+ جدول

| المجموعة | عدد الجداول | أمثلة |
|---|---:|---|
| المحتوى الأساسي | ~25 | articles, categories, tags, topics, comments, reactions |
| المحتوى متعدد اللغات | ~15 | en_articles, en_comments, ur_articles, ur_categories |
| المستخدمون والصلاحيات | ~12 | users, sessions, roles, permissions, role_permissions |
| التخصيص والتوصيات | ~20 | user_affinities, user_dynamic_interests, reading_history, recommendation_log |
| الإشعارات والتواصل | ~18 | notifications_inbox, push_devices, push_campaigns, whatsapp_tokens |
| الإعلانات | ~15 | campaigns, ad_groups, creatives, impressions, clicks, conversions |
| الذكاء الاصطناعي | ~25 | ai_recommendations, content_vectors, embeddings, deep_analyses, smart_blocks |
| الإحصائيات | ~20 | daily_stats, hourly_engagement_rollups, real_time_metrics, live_visitors |
| نظام Mirqab | ~6 | mirqab_entries, mirqab_radar_alerts, mirqab_sabq_index |
| نظام iFox | ~12 | ifox_settings, ifox_strategy_insights, ifox_quality_checks |
| الموظفون والمهام | ~15 | staff, tasks, subtasks, task_comments, calendar_events |
| المتجر والمدفوعات | ~12 | store_customers, store_cart_items, tap_payments, payment_alerts |
| الوسائط | ~8 | media_files, media_folders, image_assets, image_analysis |
| متفرقات | الباقي | knowledge_*, gulf_events, world_days, themes, system_settings |

### 7.2 مثال تعريف جدول كامل

```typescript
export const articles = pgTable("articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug").notNull().unique(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  excerpt: text("excerpt"),
  content: jsonb("content").$type<TipTapContent>().notNull(),
  featuredImage: varchar("featured_image"),
  imageFocalPoint: jsonb("image_focal_point").$type<z.infer<typeof imageFocalPointSchema>>(),
  categoryId: varchar("category_id").references(() => categories.id),
  authorId: varchar("author_id").references(() => users.id),
  status: varchar("status").$type<'draft'|'review'|'published'|'archived'>().default('draft'),
  publishedAt: timestamp("published_at"),
  viewCount: integer("view_count").default(0),
  readingTimeMinutes: integer("reading_time_minutes"),
  seo: jsonb("seo").$type<z.infer<typeof seoSchema>>(),
  seoMetadata: jsonb("seo_metadata").$type<z.infer<typeof seoMetadataSchema>>(),
  tags: text("tags").array(),
  keywords: text("keywords").array(),
  aiSummary: text("ai_summary"),
  aiSummaryAudio: varchar("ai_summary_audio"),
  embedding: vector("embedding", { dimensions: 1536 }),
  language: varchar("language").default('ar'),
  isBreaking: boolean("is_breaking").default(false),
  allowComments: boolean("allow_comments").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  publishedAtIdx: index('idx_articles_published_at').on(t.publishedAt),
  categoryIdx: index('idx_articles_category_id').on(t.categoryId),
  statusIdx: index('idx_articles_status').on(t.status),
}));

export const insertArticleSchema = createInsertSchema(articles).omit({
  id: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertArticle = z.infer<typeof insertArticleSchema>;
export type Article = typeof articles.$inferSelect;
```

---

## 8. التقنيات الكاملة

### 8.1 الواجهة (Frontend)

| الفئة | الحزمة | الإصدار | الاستخدام |
|---|---|---|---|
| إطار | react / react-dom | 18.3 | الواجهة |
| باني | vite | 6.4 | dev server + build |
| لغة | typescript | 5.6 | الأنواع |
| تنسيق | tailwindcss | 3.4 | utility classes |
| المكونات | @radix-ui/* + shadcn | — | primitives بدون رأي |
| توجيه | wouter | 3.3 | router خفيف 1.5KB |
| الحالة | @tanstack/react-query | v5 | server state |
| النماذج | react-hook-form + zod | — | تحقق نوعي |
| الأيقونات | lucide-react + react-icons/si | — | icons |
| التواريخ | date-fns | — | تنسيقات |
| المحرر | @tiptap/react + extensions | — | محرر مقالات |
| الرسوم | recharts | — | تحليلات |
| السحب | @dnd-kit/* | — | ترتيب بالسحب |
| الجوال | @capacitor/* | — | تطبيق native |

### 8.2 الخادم (Backend)

| الفئة | الحزمة | الاستخدام |
|---|---|---|
| إطار | express 4 | HTTP server |
| ORM | drizzle-orm 0.39 + @neondatabase/serverless | DB access |
| تحقق | zod + drizzle-zod | schemas |
| WebSocket | ws | real-time |
| جلسات | express-session + connect-pg-simple | جلسات في Postgres |
| مصادقة | passport + openid-client | OIDC |
| أمان | helmet + express-rate-limit + csurf | protection |
| AI | openai, @anthropic-ai/sdk, @google/genai | LLMs |
| TTS | elevenlabs, @google-cloud/text-to-speech | صوت |
| اتصالات | twilio, @sendgrid/mail | SMS/WA/Email |
| دفع | stripe | إعلانات + اشتراكات |
| تخزين | @google-cloud/storage | object storage |
| ملفات | multer + sharp | upload + resize |
| رفع AI | tesseract.js | OCR |
| تشفير | bcryptjs | كلمات سر |
| CSV | csv-parse, csv-stringify | تصدير |
| PDF | pdfkit | تقارير |

### 8.3 البنية التحتية

| الطبقة | الخدمة |
|---|---|
| استضافة | Replit Reserved VM (autoscale) |
| قاعدة البيانات | Neon Postgres Serverless |
| تخزين | Replit Object Storage (Google Cloud Storage backend) |
| CDN/Edge | Cloudflare (Workers، WAF، DNS) |
| المصادقة | Replit OIDC |
| البريد | SendGrid (transactional) + Mailgun (campaigns) |
| المراقبة | Replit Logs + Cloudflare Analytics |

---

## 9. الـ Workflows والنشر الكامل

### 9.1 الـ Workflow في التطوير

ملف `.replit`:

```toml
modules = ["nodejs-20", "web", "postgresql-16"]
run = "npm run dev"

[nix]
channel = "stable-24_05"
packages = ["imagemagick", "unzip", "jq", "chromium"]

[deployment]
deploymentTarget = "autoscale"
build = ["npm", "run", "build"]
run = ["node", "dist/bootstrap.js"]

[[ports]]
localPort = 5000
externalPort = 80
```

`package.json` scripts الأساسية:

```json
{
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "build": "vite build && esbuild server/bootstrap.ts --bundle --platform=node --outfile=dist/bootstrap.js",
    "start": "NODE_ENV=production node dist/bootstrap.js",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

عند تشغيل **Start application**:
1. `tsx` يشغّل `server/index.ts` بدون build.
2. Express يستمع على البورت 5000.
3. Vite middleware يخدم الواجهة بـ HMR.
4. WebSocket server يبدأ على نفس البورت.
5. خدمات الخلفية تبدأ (notification queue، scheduled jobs).

### 9.2 سير العمل لتعديل ميزة

```
┌──────────────────────────────────────────────────────────┐
│  1. عدّل shared/schema.ts إن لزم (جدول/عمود جديد)         │
│  2. شغّل: npm run db:push  (يزامن المخطط مع Postgres)     │
│  3. حدّث IStorage في server/storage.ts                   │
│  4. أضف route في server/routes.ts (مع Zod + RBAC)        │
│  5. اختبر API بـ curl                                     │
│  6. أنشئ/عدّل المكون في client/src/components/            │
│  7. أنشئ/عدّل الصفحة في client/src/pages/                 │
│  8. سجّل route في client/src/App.tsx (wouter)            │
│  9. Workflow يعيد التشغيل تلقائياً                         │
│  10. اختبر في المعاينة                                    │
│  11. اختر "Publish" للنشر إلى الإنتاج                     │
└──────────────────────────────────────────────────────────┘
```

### 9.3 سير النشر إلى الإنتاج

```
┌─────────────────────────────────────────────────────────────────┐
│ المطوّر يضغط زر "Publish" في Replit                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. Build phase                                                   │
│    • npm run build                                               │
│    • Vite يبني الواجهة → dist/public/                            │
│    • esbuild يبني الخادم → dist/bootstrap.js                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Deploy phase                                                  │
│    • نقل dist/ + node_modules إلى Reserved VM                    │
│    • تشغيل scripts/post-merge.sh (إن وُجد)                       │
│    • تشغيل: node dist/bootstrap.js                               │
│    • Health check على البورت 5000                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. DNS / Edge                                                    │
│    • Cloudflare يُمرّر الطلبات إلى Replit VM                      │
│    • SEO 404 Worker يعمل قبل origin                              │
│    • Image Proxy Worker لتحويل الصور                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Cache invalidation                                            │
│    • API: curl -X POST .../zones/.../purge_cache                 │
│    • Worker إن تغيّر: bash cloudflare-worker/deploy.sh           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                     ✅ موقع حي على sabq.org
```

### 9.4 سكربت ما بعد الدمج

`scripts/post-merge.sh` يعمل تلقائياً بعد كل دمج لمهمة:

```bash
#!/usr/bin/env bash
set -e

echo "▶ Running post-merge setup..."

# 1. تثبيت أي تبعيات جديدة
npm install --no-audit --no-fund

# 2. مزامنة المخطط إن تغيّر
if git diff HEAD~1 HEAD --name-only | grep -q "shared/schema.ts"; then
  npm run db:push --force
fi

# 3. تشغيل migrations مخصصة (إن وُجدت)
if [ -f scripts/run-pending-migrations.sh ]; then
  bash scripts/run-pending-migrations.sh
fi

echo "✓ Post-merge setup complete"
```

### 9.5 نشر Cloudflare Worker

```bash
# يتطلب: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID في Secrets
bash cloudflare-worker/deploy.sh
```

السكربت:
1. يجلب account ID من zone info.
2. يرفع `seo-404-worker.js` عبر Cloudflare API.
3. يربط الـ route `sabq.org/*` بالـ worker.

### 9.6 تطبيق Capacitor

```bash
# 1. بناء الواجهة
npm run build

# 2. مزامنة الويب مع Capacitor
npx cap sync

# 3. فتح في Android Studio
npx cap open android

# 4. أو iOS (يتطلب macOS + Xcode)
npx cap open ios
```

---

## 10. إرشادات التخصيص لمشروع "عاجل الإلكترونية"

### 10.1 خطة الـ Migration المقترحة (3 أيام)

#### اليوم 1 — التأسيس
- [ ] استنسخ Repl سبق أو ابدأ من البرومبت في القسم 2.
- [ ] غيّر اسم Repl إلى `aajel-news`.
- [ ] حدّث `replit.md` بوصف "عاجل".
- [ ] استبدل الشعار في `client/public/logo.svg` و `client/public/favicon.ico`.
- [ ] غيّر ألوان الهوية في `client/src/index.css`.
- [ ] أنشئ قاعدة بيانات جديدة (Replit يفعل ذلك تلقائياً).
- [ ] شغّل `npm run db:push`.
- [ ] أضف SESSION_SECRET + REPL_ID + ISSUER_URL.

#### اليوم 2 — المحتوى والتكاملات
- [ ] أنشئ الفئات الأولية (سياسة، اقتصاد، رياضة، تقنية…) عبر `/admin/categories`.
- [ ] أضف 10 مقالات تجريبية لاختبار التدفّق.
- [ ] اربط مفاتيح AI (OpenAI، Anthropic، Gemini).
- [ ] اختبر توليد الموجز التلقائي.
- [ ] اربط ElevenLabs لاختبار TTS.
- [ ] أعدّ Twilio إن أردت إشعارات WhatsApp.

#### اليوم 3 — النشر
- [ ] اضبط Cloudflare DNS على نطاق `aajel.com`.
- [ ] انشر عبر زر Publish.
- [ ] انشر Worker (مع تعديل `wrangler.toml`).
- [ ] اختبر [isitagentready.com](https://isitagentready.com) للتأكد من 100/100.
- [ ] فعّل Google Analytics + Search Console.

### 10.2 تخصيص الألوان

```css
/* client/src/index.css */
:root {
  /* الهوية الأصلية لسبق: أحمر */
  /* --primary: 0 70% 50%; */

  /* "عاجل" — مثلاً أحمر داكن مع لمسة برتقالية */
  --primary: 12 76% 45%;
  --primary-foreground: 0 0% 100%;

  --secondary: 215 25% 27%;
  --secondary-foreground: 0 0% 100%;

  --accent: 38 92% 50%;
  --accent-foreground: 220 13% 13%;
}

.dark {
  --primary: 12 76% 55%;
  /* ... */
}
```

### 10.3 إضافة قسم جديد عبر API

```bash
curl -X POST https://aajel.com/api/categories \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $(curl -s https://aajel.com/api/csrf-token | jq -r .token)" \
  -b cookies.txt \
  --data '{
    "slug": "digital-economy",
    "nameAr": "اقتصاد رقمي",
    "nameEn": "Digital Economy",
    "color": "#10b981",
    "icon": "TrendingUp"
  }'
```

### 10.4 إزالة ميزة لا تحتاجها

مثال: حذف نظام Mirqab بالكامل:

1. احذف `server/routes/mirqab.ts` وألغِ تسجيله من `server/routes.ts`.
2. احذف صفحات `client/src/pages/dashboard/MirqabDashboard.tsx` ومجلد `mirqab/`.
3. احذف الجداول من `shared/schema.ts` (`mirqab_*`).
4. شغّل `npm run db:push --force`.
5. احذف روابط Mirqab من قائمة لوحة التحكم.

### 10.5 إضافة لغة رابعة (مثال: الفرنسية)

1. **النموذج**:
   ```typescript
   // shared/schema.ts
   export const frArticles = pgTable("fr_articles", { /* نسخة من articles */ });
   export const frCategories = pgTable("fr_categories", { /* ... */ });
   ```
2. **الترجمات**: أنشئ `client/src/lib/i18n/fr.json`.
3. **Context**: أضف 'fr' في `LanguageContext.tsx`.
4. **Routes**: حدّث `server/routes.ts` ليتعامل مع `?lang=fr`.
5. **AI**: حدّث AI Manager لاستخدام Gemini للترجمة إلى الفرنسية.

---

## 11. الأمان وأفضل الممارسات

### 11.1 المتغيرات السرية

استخدم لوحة Secrets في Replit حصراً. **لا ترفع أي قيمة إلى git**.

| المفتاح | الإلزامية | الاستخدام |
|---|---|---|
| `DATABASE_URL` | ✅ | اتصال Neon |
| `SESSION_SECRET` | ✅ | تشفير الجلسات |
| `REPL_ID` + `ISSUER_URL` | ✅ | Replit OIDC |
| `OPENAI_API_KEY` | ⭕ | تصنيف + توليد |
| `ANTHROPIC_API_KEY` | ⭕ | عربية فصحى |
| `GEMINI_API_KEY` | ⭕ | ترجمة + صور |
| `ELEVENLABS_API_KEY` | ⭕ | TTS |
| `GOOGLE_TTS_CREDENTIALS_JSON` | ⭕ | TTS احتياطي |
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` | ⭕ | SMS/WhatsApp |
| `STRIPE_SECRET_KEY` | ⭕ | إعلانات |
| `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ZONE_ID` | ⭕ | نشر Workers |

### 11.2 الحماية المطبّقة

| الطبقة | التفاصيل |
|---|---|
| HTTPS | SSL تلقائي عبر Cloudflare + HSTS preload (سنتان) |
| CSP | محددة بصرامة في Helmet — راجع `server/index.ts` |
| CSRF | `server/csrf.ts` لكل POST/PATCH/DELETE تحت `/api/*` |
| Rate Limit | عام: 1000/15min، تسجيل دخول: 5/15min، تعليقات: 30/min |
| Session | في Postgres، secure + httpOnly + sameSite=lax |
| RBAC | `permissions` + `role_permissions` + `user_permission_overrides` |
| 2FA | `twoFactorRoutes.ts` — TOTP عبر Google Authenticator |
| كلمات السر | bcrypt مع salt rounds=12 |
| CSP frame-ancestors | `'self'` لمنع clickjacking |
| X-Content-Type-Options | nosniff |

### 11.3 قواعد قاعدة البيانات

**حرج**: لا تُغيّر نوع عمود primary key (serial ↔ varchar) — يكسر البيانات.

```typescript
// ✅ صحيح: حافظ على النمط الحالي
id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

// ❌ خطأ: تغيير النوع يولّد ALTER TABLE مدمّر
id: serial("id").primaryKey(), // كان varchar
```

استخدم `npm run db:push --force` لمزامنة آمنة. لا تكتب SQL migrations يدوياً.

### 11.4 المحتوى المُولَّد بـ AI

- **التحقق البشري**: أي محتوى من `/api/ai-tasks` يجب أن يمرّ بـ `status: 'pending_review'`.
- **سجل التدقيق**: `audit_logs` يحفظ كل تعديل + من قام به.
- **قائمة كلمات حساسة**: `suspicious_words` تمنع نشراً يحوي كلمات محظورة.

---

## 12. المراقبة والصيانة التشغيلية

### 12.1 السجلات

```bash
# سجلات الإنتاج (آخر ساعة)
# عبر أداة fetch_deployment_logs أو لوحة Replit

# مرشحات شائعة
ERROR | WARN | FATAL
"connection.*refused"
"timeout"
```

### 12.2 الفحوصات الدورية

| الفحص | الأمر | التكرار |
|---|---|---|
| صحة الموقع | `curl -I https://aajel.com/` | كل دقيقة (UptimeRobot) |
| API المقالات | `curl -s https://aajel.com/api/articles?limit=1` | كل 5 دقائق |
| Agent-Ready | https://isitagentready.com/?url=https://aajel.com | شهرياً |
| نسخ احتياطية Postgres | Neon يفعلها تلقائياً | يومياً |
| تحديث التبعيات | `npm outdated` | شهرياً |
| فحص أمني | `npm audit` | أسبوعياً |

### 12.3 KPIs لوحة التحكم

- **DAU / MAU** (مستخدمون نشطون).
- **Avg session duration**.
- **Pages per session**.
- **Bounce rate**.
- **Top categories / top articles**.
- **Live visitors** (real-time عبر WebSocket).
- **Push CTR** و **email open rate**.

---

## 13. ملاحق وموارد مساعدة

### 13.1 وثائق التقنيات

- [React 18](https://react.dev/) | [Vite](https://vitejs.dev/) | [TypeScript](https://www.typescriptlang.org/)
- [Drizzle ORM](https://orm.drizzle.team/) | [shadcn/ui](https://ui.shadcn.com/) | [Tailwind CSS](https://tailwindcss.com/)
- [TanStack Query](https://tanstack.com/query/latest) | [wouter](https://github.com/molefrog/wouter)
- [TipTap](https://tiptap.dev/) | [react-hook-form](https://react-hook-form.com/) | [Zod](https://zod.dev/)

### 13.2 خدمات الذكاء الاصطناعي

- [Anthropic Claude](https://docs.anthropic.com/) | [OpenAI](https://platform.openai.com/docs)
- [Google Gemini](https://ai.google.dev/) | [ElevenLabs](https://elevenlabs.io/docs)

### 13.3 البنية التحتية

- [Replit Deployments](https://docs.replit.com/deployments/overview)
- [Neon Postgres](https://neon.tech/docs) | [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Capacitor](https://capacitorjs.com/docs)

### 13.4 معايير جاهزية الوكلاء

- [RFC 8288 — Web Linking](https://www.rfc-editor.org/rfc/rfc8288)
- [RFC 9727 — API Catalog](https://www.rfc-editor.org/rfc/rfc9727)
- [RFC 9728 — OAuth Protected Resource Metadata](https://www.rfc-editor.org/rfc/rfc9728)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- [isitagentready.com](https://isitagentready.com/)

### 13.5 ملفات داخلية للرجوع

| الملف | المحتوى |
|---|---|
| `replit.md` | ذاكرة المشروع للـ Agent + قرارات معمارية |
| `design_guidelines.md` | إرشادات التصميم المرئي |
| `AUTHENTICATION_FLOW.md` | تدفق المصادقة المفصّل |
| `CALENDAR_SYSTEM.md` | نظام التقويم التحريري |
| `OBJECT-STORAGE-SETUP.md` | إعداد التخزين السحابي |
| `DATABASE_SETUP_INSTRUCTIONS_AR.md` | إعداد قاعدة البيانات |
| `DATABASE_COST_FORENSIC_REPORT.md` | تحليل تكاليف Neon |

---

## خاتمة

هذه الوثيقة تختزل تجربة بناء **سبق الذكية** إلى مرجع تنفيذي قابل للنسخ. عند تطبيقها على "عاجل الإلكترونية":

1. **ابدأ بالبرومبت في القسم 2** — أسرع طريقة لتأسيس البنية.
2. **التزم بترتيب الطبقات**: Schema → Storage → Routes → UI، لا تخلط.
3. **لا تستدعِ Drizzle مباشرة من routes** — مرّ دائماً عبر `IStorage`.
4. **حافظ على معايير الجاهزية للوكلاء** منذ اليوم الأول — أصعب إضافة لاحقاً.
5. **اختبر كل دمج** بـ `curl` قبل النشر — يوفّر ساعات تصحيح في الإنتاج.

— *وثيقة معدّة في 20 أبريل 2026، الإصدار 2.0 الموسّع، مستندة إلى الإصدار الإنتاجي الحالي من sabq.org.*
