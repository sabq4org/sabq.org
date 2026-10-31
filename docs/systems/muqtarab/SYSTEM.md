# المُقترَب (`muqtarab`)

> آخر مراجعة: 2026-10-31 | المالك: editorial

## الغرض
منصة مشاركة القرّاء والزوايا الإخبارية مع مراجعة تحريرية وتجهيز حسابات الكتّاب وتجربة قراءة تحريرية متقدمة للزوايا والمواضيع.

## الحدود
- **داخل النطاق:** خدمات/مسارات `muqtarab*`، الصفحات العامة للزوايا والمواضيع والكتّاب (`Muqtarab`, `MuqtarabDetail`, `TopicDetail`, `WriterProfilePage`)، لوحات المراجعة، صلاحيات `muqtarab.*`.
- **خارج النطاق:** التعليقات العامة على المقالات (`comments`).

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/services/muqtarab*.ts`, `server/routes/muqtarab*.ts`, `server/routes.ts` (`/api/muqtarab/*`) |
| Web (Public) | `client/src/pages/Muqtarab.tsx`, `client/src/pages/MuqtarabDetail.tsx`, `client/src/pages/TopicDetail.tsx`, `client/src/pages/WriterProfilePage.tsx`, `client/src/lib/muqtarab.ts`, `client/src/lib/angleTheme.ts` |
| iOS (Reader) | `sabq app ios/sabq/Screens/MuqtarabView.swift`, `sabq app ios/sabq/Components/MuqAngleIdentity.swift`, `sabq app ios/sabq/Services/MuqtarabModels.swift` |
| Web (Dashboard) | `client/src/pages/dashboard/DashboardMuqtarab.tsx`, `client/src/pages/dashboard/MuqtarabReview.tsx` |
| Docs | `docs/MUQTARAB.md`, `docs/MUQTARAB_IOS_PLAN.md` |

## عقود مهمة / Gotchas
- فرّق بين `muqtarab.own.view` (كاتب) و`muqtarab.manage` (تحرير).
- إشعارات البريد/التطبيق جزء من التجهيز — لا تكسرها بصمت.
- **هوية iOS (معاينة 2026-10-31):** رأس الزاوية وشارة الموضوع والموجز والوسوم تستمد اللون من `colorHex` والأيقونة من `iconKey` كما في الويب. الغلاف الفارغ لا يتحول إلى رابط الموقع؛ تظهر هوية الزاوية مكان المساحة الفارغة. تُضبط درجة لون النص للتباين، ويبقى متن الموضوع محايدًا بمحاذاة اليمين. اختبارات `MuqAngleIdentityTests` تغطي الألوان والروابط الفارغة. لا تغيير لعقد API؛ نقل المعاينة إلى Android مؤجل حتى اعتمادها.
- صفحة تفاصيل الموضوع (`TopicDetail.tsx`) تتبع نظام تصميم القراءة العام (`article-detail.css` + متغيرات `angleTheme`) مع شريط تحسين القراءة (حجم الخط، وضع الورق/الهادئ، وضع التركيز `FocusReader`، الموجز الصوتي `ArticleSummary`، فهرس المحاور التلقائي، مشاركة الاقتباس المحدد، والتنقل المتسلسل بين مواضيع الزاوية).

## صحة وتشغيل
- لوحة: `/dashboard/muqtarab`
- الواجهة العامة: `/muqtarab`، `/muqtarab/:slug`، `/muqtarab/:angleSlug/topic/:topicSlug`
- AI اختياري عبر `muqtarab.ai`

## عند التعديل
- [x] قرأت هذا الملف + `docs/MUQTARAB.md` عند تغيير المنتج
