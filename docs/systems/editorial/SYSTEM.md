# نظام التحرير وغرف الأخبار (`editorial`)

> آخر مراجعة: 2026-07-17 | المالك: editorial

## الغرض
أدوات غرفة الأخبار اليومية: أقفال التحرير، حضور المحررين، تنبيهات رئيس التحرير، ونبض اللوحة.

## الحدود
- **داخل النطاق:** edit locks، editor presence/alerts، dashboard pulse، إشعارات تحريرية.
- **خارج النطاق:** توليد iFox، مكتبة الوسائط، المقترب (أنظمة مجاورة).

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `articleEditLocks`, `editorAlerts`, `editorPresence`, `dashboardPulse`, `editorialNotifications` |
| Web | `NewsroomPulseDashboard`, `EditorAlertsSettings` |
| Docs | `docs/editorial/` |

## التوثيق المرتبط
- `docs/editorial/sabq-unified-editorial-prompt.md`
- `docs/ai-prompts-article-editor.md`

## عقود مهمة / Gotchas
- أقفال التحرير TTL ≈ 10 دقائق مع heartbeat — غيابها يظهر «تعذر الحصول على قفل التحرير».
- لا تضعف صلاحيات التحرير دون مراجعة RBAC.

## صحة وتشغيل
- لوحة: `/dashboard/newsroom-pulse` (إن كانت مفعّلة في التنقل)
- لا استهلاك AI مباشر في هذا النظام

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] اختبرت مسار القفل/heartbeat إن لمسته
