# غرفة عمليات سبق الذكية (`ops-room`)

> آخر مراجعة: 2026-08-24 | المالك: فريق التحرير التقني | **الحالة: تجريبية (prototype) — معزولة عن مسارات الإنتاج**

## الغرض
غرفة تشغيل مركزية يتبادل فيها وكلاء «فريق سبق الذكي» مهامًا تحريرية حقيقية عبر **سجل مهام مركزي ومخرجات منظمة** (لا دردشة حرة)، مع تتبع كامل لمسار كل مهمة، واعتماد بشري إلزامي. **لا نشر ولا إرسال خارجي في أي مسار** — صلاحية `ops_room.publish` محجوزة ولا ينفذها كود.

## المبدأ المعماري
- **المنسق** (`server/services/opsRoom/engine.ts`): نقي، فوق واجهة `OpsStore` (Drizzle في الإنتاج، ذاكرة في الاختبارات). ينظّم ويوزّع فقط.
- **المسارات تعريفية** (`shared/opsRoom.ts` → `OPS_ROUTES`): لكل نوع مهمة خطوات بمفاتيح وتبعيات وبوابات اعتماد؛ إضافة نوع = إضافة كائن. `validateRoute` يكشف الدورات.
- **الوكلاء** (`server/services/opsRoom/agents/`): كل وكيل = مدخلات مسموحة، أدوات مسموحة (يفرضها المحرك — أي أداة خارجها تُرفض)، مخطط zod للنتيجة، حد محاولات ومهلة، وشروط تصعيد. الأساسيون (راصد/موثّق/سبّاق/مراسل/قلم/ميزان/عدسة/ساعي) في `core.ts`، والبقية تعريفيون عبر `makePromptAgent` في `prompted.ts`.
- **لا قائمة انتظار خارجية**: الحالة في القاعدة + نبضة كرون كل 20ث على القائد (`server/jobs/opsRoomJob.ts`) + دفعة فورية بعد كل حدث. **المطالبة ذرية** (`UPDATE … WHERE status='ready' RETURNING`) فلا تُنفَّذ خطوة مرتين.
- **الأحداث** append-only في `ops_task_events` — ملخص تشغيلي قابل للتدقيق، بلا برومبت ولا أسرار (`redactSecrets`).

## نقاط الدخول
| الطبقة | المسار |
|---|---|
| الواجهة (تجريبية) | `/dashboard/ops-room` — `client/src/pages/dashboard/OpsRoom/` |
| API | `GET /api/admin/ops-room/overview`, `GET …/metrics`, `POST …/tasks`, `GET …/tasks/:id`, `POST …/tasks/:id/actions`, `POST …/pause`, `POST …/agents/:slug` — `server/routes/opsRoom.ts` |
| الخدمة | `server/services/opsRoom/index.ts` (نماذج القراءة، المقاييس، الإعدادات) |
| الجداول (إضافية) | `ops_tasks` (رئيسية + خطوات بـ`parent_id`)، `ops_task_events` |
| الإعدادات | `system_settings`: `ops_room.paused`، `ops_room.disabled_agents` |
| الصلاحيات | `OPS_PERMISSION_SEED` في `shared/opsRoom.ts` → `tsx scripts/seed-ops-room.ts` |

## الأنظمة المستهلَكة (قراءة/استدعاء فقط — لا تعديل عليها)
- **ai-hub**: `aiGateway.complete` بمفاتيح `ops-room-<agent>` (التكلفة تُحتسب في `ai_usage_logs`).
- **editorial**: `runEditorialTask` (edit/review/precheck) لسبّاق ومراسل وقلم وميزان.
- **radar**: `getItem` لقراءة مادة رادار كمصدر إشارة (اختياري)، و`webSearchService.buildVerificationContext` لموثّق.
- **media**: `visualAiService.analyzeImage` لعدسة (بحارس SSRF القائم).

## الحالات والانتقالات
`OPS_STATUS_TRANSITIONS` في `shared/opsRoom.ts` — أي قفزة خارج الجدول تُرفض (`OpsError 409`) ولا تُحفظ. حدود منع الحلقات: `OPS_MAX_REASSIGNMENTS=3` (بشري)، `OPS_MAX_AUTO_RETURNS=1` (ميزان→قلم).

## الحوكمة
- الإنسان صاحب القرار: كل مسار ينتهي ببوابة اعتماد؛ عدسة وساعي بعد الاعتماد وبوابتين مستقلتين؛ ساعي ينتج `sent:false` دائمًا؛ ريشة لا تعمل إلا بـ`generateImage=true` ولا تولّد فعليًا في هذه النسخة.
- المدخلات الخارجية تُعقَّم وتُغلَّف كبيانات (`sanitize.ts` + `OPS_GUARDRAILS_AR`).
- الصلاحيات مفصولة: view/create/edit/reassign/stop/agents.manage/outputs.view/approve/publish/settings، مع احترام wildcard `"*"`.

## مؤجل / قيود
- مصدر «حدث من أنظمة سبق» = إدخال `radarItemId` يدويًا؛ لا اشتراك تلقائي في أحداث الرادار (قرار لاحق).
- التعديل البشري للمخرج عبر JSON للحقول (نموذج بسيط)؛ محرر مرئي لاحقًا.
- مقاييس التكلفة تشمل مفاتيح `ops-room-*` فقط؛ استدعاءات `runEditorialTask` تُسجَّل تحت `editorial-unified-*`.
