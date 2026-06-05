# قسم مُقترب (Muqtarab) — التوثيق الكامل

> منصة **مُقترب** = زوايا تحليلية (Angles) يملكها كتّاب أفراد، وينشرون فيها مواضيع
> (Topics) بعد مراجعة الإدارة. هذا الملف هو المرجع الوحيد الشامل للقسم.
> آخر تحديث: 2026-06-05.

---

## 1) نظرة عامة

```
زائر يقدّم طلب زاوية ──► الإدارة توافق بنقرة واحدة
        │                        │
   [بريد: استلمنا طلبك]    يُنشأ: حساب (دور angle_writer) + الزاوية + [بريد: بيانات الدخول]
                                 │
                     الكاتب يدخل "زاويتي" (/dashboard/my-angle)
                                 │
                     يضيف موضوعاً (draft) ──► "إرسال للمراجعة" (pending_review)
                                 │                    │
                          [إشعار للمراجعين]    الإدارة في "مراجعة مواضيع مُقترب"
                                                      │
                            ┌─────────────────────────┼─────────────────────────┐
                       نشر (published)        إرجاع (needs_revision)        رفض (حذف)
                    [بريد+إشعار: نُشر]     [بريد+إشعار: يحتاج تعديل]   [بريد+إشعار: سبب عدم النشر]
```

**المفاهيم:**
- **Section**: قسم مُقترب نفسه (`sections.slug = "muqtarab"`).
- **Angle (زاوية)**: حاوية يملكها كاتب واحد (`angles.managerUserId`).
- **Topic (موضوع)**: محتوى داخل زاوية (`topics.angleId`)، يمرّ بسير مراجعة.
- **Angle Submission (طلب زاوية)**: طلب عام لإنشاء زاوية، يتحوّل إلى زاوية+حساب عند الموافقة.

---

## 2) نموذج البيانات (`shared/schema.ts`)

### `sections`
قسم حاوٍ. مُقترب = الصف الذي `slug = "muqtarab"`. أعمدة: `id, name, slug, description, createdAt`.

### `angles` (الزوايا)
| العمود | الوصف |
|---|---|
| `id` | UUID |
| `sectionId` | FK → sections |
| `nameAr` / `nameEn` | اسم الزاوية |
| `slug` | **إنجليزي** فريد (تحويل صوتي + لاحقة) — يُستخدم في الرابط |
| `colorHex` / `iconKey` | الهوية البصرية |
| `coverImageUrl` / `shortDesc` | غلاف ووصف |
| `sortOrder` / `isActive` | الترتيب والظهور |
| `managerUserId` | **FK → users — مالك الزاوية (الكاتب)** |

### `topics` (المواضيع)
| العمود | الوصف |
|---|---|
| `id`, `angleId` (FK cascade), `title`, `slug` (إنجليزي nanoid) | أساسية |
| `excerpt`, `content` (JSONB: `{blocks, rawHtml, plainText}`), `heroImageUrl`, `attachments`, `seoMeta` | المحتوى |
| **`status`** | `draft → pending_review → published / needs_revision / archived` |
| `publishedAt` | وقت النشر |
| **`createdBy`** (FK users) | مؤلّف الموضوع (الكاتب) |
| `updatedBy` | آخر من عدّل |
| **حقول المراجعة:** `submittedAt`, `reviewedBy`, `reviewedAt`, `reviewNotes` | سير المراجعة |

> `status` نوعه `text` على مستوى DB — الحالات الجديدة (`pending_review`/`needs_revision`)
> لا تحتاج migration على القاعدة، لكن الأعمدة الأربعة للمراجعة تحتاج `ALTER`/`db:push`.

### `angleSubmissions` (طلبات الزوايا)
معلومات شخصية (`fullName, phone, email, city`) + مقترح الزاوية (`angleName, angleCategory,
angleDescription, uniquePoints`) + خبرة (`writingExperience, previousArticlesUrl,
expectedArticlesPerMonth`) + **`status`** (`pending/approved/rejected`) + مراجعة
(`reviewerNotes, reviewedBy, reviewedAt`) + **`createdAngleId`** (يُربط بالزاوية عند الموافقة).

### `articleAngles`
جدول وصل many-to-many لربط مقالات عادية بزوايا (`articleId, angleId`).

---

## 3) الأدوار والصلاحيات (RBAC)

### دور `angle_writer` (كاتب الزاوية)
- مُعرّف في `server/seedRBAC.ts` + `shared/rbac-constants.ts` (`ROLE_PERMISSIONS_MAP`).
- يُسند للمستخدم عبر جدول **`user_roles`** عند الموافقة (وليس عمود `users.role` النصي وحده).
- **صلاحياته (الحد الأدنى عمداً):** `muqtarab.own.{view, topic.create, topic.edit, topic.submit}`
  + `dashboard.view` فقط — لا media/chat/analytics حتى لا تظهر عناصر إدارية في قائمته.
- يُزرع تلقائياً عند إقلاع الخادم عبر `seedRBAC()`.

### صلاحيات الإدارة
- المراجعة/الإدارة تستخدم `muqtarab.manage` و `muqtarab.publish` (للـ admin/editor).

### نقاط حسّاسة في الواجهة
- `client/src/lib/roleMapping.ts`: لا بد من `'angle_writer': 'angle_writer'` وإلا يُحلّ لـ `guest`
  فتظهر "نظرة عامة".
- `client/src/nav/nav.config.ts`:
  - عنصر `my_angle` (زاويتي) — `permissions: ["muqtarab.own.view"]`، مخفي عن admin/editor.
  - عنصرا `muqtarab` و `muqtarab_review` (للإدارة) — `muqtarab.manage`/`muqtarab.publish`.
  - حاوية `content` (المحتوى): `excludeRoles` تتضمّن `angle_writer` (تُخفي مكتبة الوسائط عنه).
- `DashboardLayout.tsx`: شريط `EditorPresenceBar` مخفي عن `angle_writer` و`opinion_author`.

### فرض الملكية (الأمان الحقيقي)
مسارات الكاتب تُحرَس بـ **الملكية** لا بالصلاحية فقط:
`angles.managerUserId === userId` و`topics.createdBy === userId` (انظر `checkOwnership` في
`muqtarabOwn.ts`).

---

## 4) واجهات الخادم (API)

### عامة (بلا مصادقة)
| المسار | الوصف |
|---|---|
| `GET /api/muqtarab/section` | قسم مُقترب |
| `GET /api/muqtarab/angles` | كل الزوايا النشطة |
| `GET /api/muqtarab/angles/:slug` | زاوية + مواضيعها المنشورة |
| `GET /api/muqtarab/angles/:angleSlug/topics` | مواضيع زاوية المنشورة |
| `GET /api/muqtarab/angles/:angleSlug/topics/:topicSlug` | موضوع منشور + الزاوية |
| `GET /api/muqtarab/topics/:slug` | موضوع بالـ slug (يتطلب `angleId`) |
| `GET /api/muqtarab/latest-topics` / `GET /api/muqtarab/topics/featured` | خلاصات الواجهة |
| `POST /api/angle-submissions` | **تقديم طلب زاوية (عام)** |

### طلبات الزوايا (إدارة — `muqtarab.manage`)
| المسار | الوصف |
|---|---|
| `GET /api/angle-submissions` (+`?status=`) | قائمة الطلبات |
| `GET /api/angle-submissions/:id` | طلب واحد |
| `PATCH /api/angle-submissions/:id` | **الموافقة بنقرة واحدة** (approved → تزويد كامل) أو الرفض (+ بريد) |
| `POST /api/angle-submissions/:id/create-angle` | تزويد من طلب مُعتمَد (احتياطي — يفوّض للخدمة) |
| `DELETE /api/angle-submissions/:id` | حذف الطلب |

### إدارة الزوايا (إدارة)
`POST /api/admin/muqtarab/angles` · `PUT /api/admin/muqtarab/angles/:id` ·
`DELETE /api/admin/muqtarab/angles/:id` · `GET /api/admin/muqtarab/angles/stats` (إحصاءات
المواضيع لكل زاوية) · `GET /api/admin/muqtarab/angles/:angleId/topics`.

### إدارة المواضيع (إدارة)
`POST /api/admin/muqtarab/topics` · `GET /PATCH /DELETE /api/admin/muqtarab/topics/:id`
(الحذف يقبل `{reason}` ويُشعر الكاتب) · `POST .../:id/publish` (يُشعر الكاتب) ·
`POST .../:id/unpublish`.

### مسارات الكاتب «زاويتي» (`requireAuth` + فحص ملكية) — `server/routes/muqtarabOwn.ts`
| المسار | الوصف |
|---|---|
| `GET /api/muqtarab/my-angle` | زاويتي + إحصاءات الحالات |
| `GET /api/muqtarab/my-angle/topics` | كل مواضيعي |
| `POST /api/muqtarab/my-angle/topics` | إنشاء (draft) — slug إنجليزي، `createdBy`=الكاتب |
| `PATCH /api/muqtarab/my-angle/topics/:id` | تعديل (draft/needs_revision فقط) |
| `POST /api/muqtarab/my-angle/topics/:id/submit` | إرسال للمراجعة (→ pending_review) + إشعار المراجعين |

### مراجعة الإدارة (`muqtarab.manage`) — `muqtarabOwn.ts`
| المسار | الوصف |
|---|---|
| `GET /api/admin/muqtarab/review-queue` | طابور المواضيع `pending_review` |
| `POST /api/admin/muqtarab/topics/:id/approve` | نشر (→ published) + بريد+إشعار للكاتب |
| `POST /api/admin/muqtarab/topics/:id/return` | إرجاع (→ needs_revision) + ملاحظات + بريد+إشعار |
| `POST /api/admin/muqtarab/topics/:id/reject` | رفض: بريد+إشعار السبب ثم **حذف الموضوع** |

---

## 5) الخدمات (server/services)

### `muqtarabProvisioning.ts` — الموافقة بنقرة واحدة
`provisionAngleFromSubmission(submissionId, reviewerId)` (idempotent):
1. إيجاد المستخدم بالبريد (مُطبَّع lowercase) أو إنشاء حساب جديد (`passwordHash`،
   `role="angle_writer"`، `mustChangePassword=true`).
2. إنشاء الزاوية (`managerUserId` = المستخدم، slug إنجليزي).
3. إسناد دور `angle_writer` عبر `user_roles` (+ إبطال كاش الصلاحيات/الجلسة).
4. ربط الطلب (`createdAngleId`).
5. إرسال **بريد بيانات الدخول**.

> أصلحت عطلاً جوهرياً: المسار القديم كان يستدعي 3 دوال storage غير موجودة
> (`getUserByEmail`/`getAllSections`/`createUser`) فيتعطّل دائماً، وكان يكتب الصلاحيات إلى
> عمود `customPermissions` غير موجود (no-op).

### `muqtarabEmails.ts` — قوالب الإيميلات (RTL، ستايل بطاقة سبق)
| الدالة | متى |
|---|---|
| `sendSubmissionReceivedEmail` | عند تقديم الطلب |
| *(بريد بيانات الدخول)* | داخل التزويد عند الموافقة |
| `sendTopicPublishedEmail` | عند نشر موضوع الكاتب |
| `sendTopicReturnedEmail` | عند الإرجاع للتعديل (+ ملاحظات) |
| `sendTopicRejectedEmail` | عند الرفض/الحذف (+ سبب) |
> الإرسال عبر **MailerSend** (`server/services/email.ts` → `sendEmailNotification`). يتطلب
> `MAILERSEND_API_KEY`؛ وإلا تفشل كل الإيميلات بصمت.

### `muqtarabNotifications.ts` — إشعارات داخلية (`notifications_inbox` + بثّ SSE)
`notifyReviewersOfPendingTopic` (للأدمن/المحررين عند الإرسال) ·
`notifyAuthorTopicPublished` / `notifyAuthorTopicReturned` / `notifyAuthorTopicRejected`
(للكاتب).

---

## 6) الواجهات (client/src/pages)

### عامة
- `Muqtarab.tsx` — `/muqtarab` (الزوايا + مواضيع مميزة)
- `MuqtarabDetail.tsx` — `/muqtarab/:slug` (زاوية + مواضيعها)
- `TopicDetail.tsx` — `/muqtarab/:angleSlug/topic/:topicSlug`
- `MuqtarabSubmit.tsx` — `/muqtarab/submit` (نموذج طلب زاوية — عام)

### لوحة التحكم (dashboard/)
- `DashboardMuqtarab.tsx` — `/dashboard/muqtarab` (إدارة الزوايا + **تنبيه وعمود "بانتظار المراجعة"**)
- `TopicsManagement.tsx` — `/dashboard/muqtarab/angles/:angleId/topics` (مواضيع زاوية؛ الحذف يطلب سبباً)
- `AngleSubmissionsManagement.tsx` — `/dashboard/muqtarab/submissions` (الطلبات؛ موافقة بنقرة)
- `MuqtarabReview.tsx` — `/dashboard/muqtarab/review` (طابور المراجعة: نشر/إرجاع/رفض)
- `MyAngle.tsx` — `/dashboard/my-angle` (**لوحة الكاتب**: إضافة/تعديل/إرسال مواضيعه)

محرّر المواضيع: `RichTextEditor` (المحتوى يُخزَّن `content.rawHtml`) + رفع غلاف عبر
`/api/media/upload` (يتطلب مصادقة فقط؛ يستخدم `ensureCsrfToken()` لتفادي 403).

---

## 7) الـ Slug والـ SEO

- **slug الزاوية**: تحويل صوتي إنجليزي من الاسم العربي + لاحقة فريدة (`server/utils/slugTransliterator.ts`
  → `transliterateToEnglish`). **slug الموضوع**: `generateEnglishSlug()` = `nanoid(7)` (مثل المقالات).
- **ميتا المشاركة + OG** على المسارين:
  - `server/seoInjector.ts` (مسار Replit المباشر): `handleMuqtarabAnglePage` + `handleMuqtarabTopicPage`
    (عنوان/وصف/صورة OG = heroImage، NewsArticle JSON-LD، 404 سليم للمفقود، noindex لغير المنشور).
  - `server/routes/edgeMeta.ts` (مسار Cloudflare — مسار الإنتاج للزواحف): معالجا زاوية + موضوع.
- التغييرات تخص **الجديد فقط**؛ الزوايا/المواضيع القديمة تحتفظ بسلقها لكن ميتا مشاركتها تعمل.

---

## 8) خريطة ملفات المصدر

| الملف | المسؤولية |
|---|---|
| `shared/schema.ts` | جداول `sections, angles, topics, articleAngles, angleSubmissions` |
| `shared/rbac-constants.ts` · `server/seedRBAC.ts` | دور `angle_writer` + صلاحياته |
| `server/routes.ts` | مسارات الطلبات + إدارة الزوايا/المواضيع (القديمة) |
| `server/routes/muqtarabOwn.ts` | مسارات الكاتب + مراجعة الإدارة + إحصاءات الزوايا |
| `server/routes/splitRoutesIndex.ts` | تسجيل `muqtarabOwn` |
| `server/services/muqtarabProvisioning.ts` | الموافقة بنقرة واحدة |
| `server/services/muqtarabEmails.ts` · `muqtarabNotifications.ts` | الإيميلات + الإشعارات |
| `server/seoInjector.ts` · `server/routes/edgeMeta.ts` | ميتا SEO/مشاركة |
| `server/utils/slugTransliterator.ts` | توليد slug إنجليزي |
| `client/src/lib/roleMapping.ts` · `client/src/nav/nav.config.ts` | حلّ الدور + عناصر القائمة |
| `client/src/components/DashboardLayout.tsx` | إخفاء أدوات المحررين عن الكاتب |
| `client/src/pages/**` | الواجهات (انظر §6) |
| `scripts/seed-angle-writer.ts` | بذر دور `angle_writer` يدوياً (idempotent) |

---

## 9) ملاحظات تشغيلية

1. **دور `angle_writer`** يُزرع تلقائياً عند إقلاع الخادم (`seedRBAC`). يدوياً:
   `DATABASE_URL=... npx tsx scripts/seed-angle-writer.ts`.
2. **أعمدة المراجعة في `topics`** لا تُطبَّق تلقائياً — شغّل `db:push` أو `ALTER` على **كل بيئة**:
   ```sql
   ALTER TABLE topics ADD COLUMN IF NOT EXISTS submitted_at timestamp;
   ALTER TABLE topics ADD COLUMN IF NOT EXISTS reviewed_by  varchar;
   ALTER TABLE topics ADD COLUMN IF NOT EXISTS reviewed_at  timestamp;
   ALTER TABLE topics ADD COLUMN IF NOT EXISTS review_notes text;
   CREATE INDEX IF NOT EXISTS idx_topics_status_submitted ON topics (status, submitted_at);
   ```
3. **عند تقليص صلاحيات الدور**، `seedRBAC` يضيف فقط ولا يحذف — احذف اليدوي:
   ```sql
   DELETE FROM role_permissions WHERE role_id = (SELECT id FROM roles WHERE name='angle_writer')
     AND permission_id IN (SELECT id FROM permissions WHERE code LIKE 'media%');
   ```
4. **الإيميلات** تتطلب `MAILERSEND_API_KEY` مضبوطاً ودومين مُوثّق.
5. **رفع الصور** (`/api/media/upload`) يتطلب مصادقة فقط — لا حاجة لمنح الكاتب `media.*`.
6. **سير المواضيع**: المواضيع غير المنشورة لا تتسرّب للواجهة العامة (المسارات العامة تُفلتر
   `status='published'`).
