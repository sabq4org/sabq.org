# المصدر

- المستودع: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (صفحة skills.sh: nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max)
- المجلد: `.claude/skills/ui-ux-pro-max`
- الإصدار المنسوخ: commit `28b3b8dee8c976df4fa3e94aed4e092ad43fcb03` (2026-10-26)
- الرخصة: MIT (`LICENSE`)

## ما حُذف عند النسخ
أدوات صيانة البيانات لا يحتاجها البحث: `scripts/tests/`، `scripts/validate_data.py`،
`data/phosphor-icons-upstream.json`، `data/google-font-licenses.json`، `data/data-provenance.json`.

## ما عُدّل
- كتلة «قواعد سبق أولًا» في أول `SKILL.md`، وبداية الوصف.
- مسار الأمر صار `.claude/skills/ui-ux-pro-max/scripts/search.py` بدل `${CLAUDE_PLUGIN_ROOT}/...`.

## المراجعة الأمنية (2026-10-28)
السكربتات Python من المكتبة القياسية فقط: لا شبكة، ولا أوامر نظام، ولا قراءة متغيرات بيئة حساسة.
الكتابة الوحيدة على القرص عبر `--persist` (ممنوعة داخل المستودع حسب قواعد سبق).

## التحديث
انسخ المجلد من الإصدار الجديد، وأعد الحذف والتعديلات أعلاه، وراجع الفرق قبل الدمج.
