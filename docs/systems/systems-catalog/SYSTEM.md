# كتالوج الأنظمة (`systems-catalog`)

> آخر مراجعة: 2026-07-17 | المالك: platform

## الغرض
سجل موحّد للأنظمة، حوكمة توثيق، قاعدة Agents، وجرد (ملفات + استهلاك AI اليوم) في لوحة التحكم.

## الحدود
- **داخل النطاق:** `docs/systems/**`, السكربت، الخدمة، المسار، صفحة اللوحة، قاعدة Cursor.
- **خارج النطاق:** صحة التكاملات الخارجية (`/dashboard/integrations`) وAiHub التفصيلي — يُعرض ملخص فقط.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Registry | `docs/systems/registry.json` |
| Script | `scripts/systems-inventory.mjs` |
| Backend | `server/services/systemsCatalogService.ts`, `server/routes/systemsCatalog.ts` |
| Web | `client/src/pages/dashboard/SystemsCatalogPage.tsx` |
| Agent rule | `.cursor/rules/systems-docs-gate.mdc` |

## عقود مهمة / Gotchas
- السجل JSON فقط (بدون اعتماد yaml جديد).
- أرقام الملفات من `pathGlobs` — globs فضفاضة تضلّل الجرد.
- استهلاك AI يعتمد على `aiFeatureKeys` مقابل `ai_usage_logs`؛ مفاتيح غير مستخدمة = أصفار.

## صحة وتشغيل
- لوحة: `/dashboard/systems-catalog`
- CLI: `node scripts/systems-inventory.mjs`

## عند التعديل
- [ ] حدّثت `registry.json` و`SYSTEM.md` معاً
- [ ] شغّلت السكربت وتأكدت من أعداد منطقية
