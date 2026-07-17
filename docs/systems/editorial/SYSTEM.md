# نظام التحرير وغرف الأخبار (`editorial`)

> آخر مراجعة: 2026-07-17 | المالك: editorial

## الغرض
غرفة الأخبار اليومية (أقفال، حضور، تنبيهات، نبض) **وأدوات التحرير بالذكاء الاصطناعي** التي يستخدمها المحررون يومياً: عناوين، توليد/مساعدة مقالات، تصنيف، SEO، روابط ذكية، صور.

## الحدود
- **داخل النطاق:**
  - تشغيل غرفة الأخبار: edit locks، editor presence/alerts، dashboard pulse
  - استهلاك AI التحريري عبر Gateway (انظر `aiFeatureKeys` في السجل)
- **خارج النطاق (أنظمة مجاورة لها مفاتيحها الخاصة):**
  - iFox (`ifox-*`)
  - المقترب (`muqtarab-ai`)
  - الرادار (`radar`)
  - عُمق (`deep-analysis`)
  - أخبار البطولات (`world-cup-news`, `sportmonks-news`)
  - النشرات الصوتية والتعليقات

> ملاحظة: ظهور «لا استخدام AI مسجّل اليوم» يعني أن المفاتيح مربوطة لكن لا صفوف في `ai_usage_logs` لهذا اليوم — وليس أن التحرير بلا ذكاء اصطناعي.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend غرفة الأخبار | `articleEditLocks`, `editorAlerts`, `editorPresence`, `dashboardPulse` |
| Backend AI تحريري | `aiArticleGenerator`, `journalist-agent-ai`, أدوات content-tools عبر Gateway |
| Web | `NewsroomPulseDashboard`, `EditorAlertsSettings`, `SmartJournalist` |
| Docs | `docs/editorial/` |

## التوثيق المرتبط
- `docs/editorial/sabq-unified-editorial-prompt.md`
- `docs/ai-prompts-article-editor.md`

## عقود مهمة / Gotchas
- أقفال التحرير TTL ≈ 10 دقائق مع heartbeat.
- أي استدعاء نموذج جديد من المحرر يجب أن يمر AI Gateway بمفتاح `featureKey` معروف ويُسجَّل في usage.
- لا تُكرَّر مفاتيح أنظمة مجاورة هنا حتى لا يُحسب الاستهلاك مرتين في كتالوج الأنظمة.

## صحة وتشغيل
- لوحة غرفة الأخبار: `/dashboard/newsroom-pulse`
- استهلاك AI: مجموع مفاتيح `aiFeatureKeys` في السجل مقابل `ai_usage_logs` لليوم

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] إن أضفت أداة AI تحريرية: أضفت `featureKey` في السجل + defaults Gateway
- [ ] اختبرت مسار القفل/heartbeat إن لمسته
