# GitHub Project Board — Sabq Roadmap

دليل إنشاء لوح المشاريع المركزي للتنسيق بين المنصات الثلاث (Web, iOS, Android).

> هذا الملف يصف **اللوح المراد إنشاؤه** ضمن GitHub Organization `sabq4org`. أنشئه يدوياً أو عبر `gh project create` بعد دمج هذا الـ PR.

---

## الهدف

لوح واحد يوحّد:
- Umbrella Issues (الميزات الكاملة)
- Sub-PRs لكل منصة
- Bugs العابرة للمنصات
- Parity Gaps

ليصير عند الفريق رؤية واحدة لـ "أين كل ميزة في كل منصة الآن".

---

## التكوين

### الاسم
**Sabq Roadmap**

### نوع اللوح
`Board` (Kanban) — مع إمكانية التحويل إلى `Roadmap` أو `Table` view لاحقاً.

### الأعمدة

| العمود | الوصف |
|--------|-------|
| **Backlog** | أفكار ومهام لم تُبدأ بعد |
| **Spec** | في طور التصميم والتحديد (UI/API/Schema) قبل أي كود |
| **Backend** | تعديل schema/API قيد التنفيذ |
| **iOS** | تطوير iOS بعد جاهزية الـ backend |
| **Android** | تطوير Android (يطابق iOS) |
| **Web** | تطوير الويب (تصميم مستقل، parity وظيفي) |
| **In Apple Review** | iOS build مرفوع وينتظر مراجعة Apple |
| **Shipped** | متوفر على جميع المنصات المستهدفة |

### الحقول المخصصة (Custom Fields)

| الحقل | النوع | القيم |
|-------|------|-------|
| **Platform** | Multi-select | `web`, `ios`, `android`, `backend`, `shared` |
| **Priority** | Single-select | `P1`, `P2`, `P3`, `P4` |
| **Sprint** | Text | مثال: `2026-05-W4` |
| **Type** | Single-select | `feature`, `bug`, `parity`, `improvement`, `chore` |

---

## أوامر `gh` للإنشاء السريع

```bash
# يتطلب صلاحية إدارة Projects على org
gh auth refresh -s project,read:project

# إنشاء اللوح
gh project create --owner sabq4org --title "Sabq Roadmap"

# (بعد الإنشاء، أضف الأعمدة والحقول من الـ UI أو via gh project field-create)
```

---

## قواعد الاستخدام

### عند فتح Umbrella Issue
1. أضفها للوح في عمود **Backlog**
2. اضبط `Type=feature`, `Priority=Pn`, `Platform=<منصاتها>`
3. ضع `Sprint` لو محددة

### عند بدء التنفيذ
- انقل البطاقة إلى **Spec** عند البدء بكتابة الـ Spec
- ثم **Backend** بمجرد بدء أول PR على الـ backend
- ثم **iOS** → **Android** → **Web** بالترتيب الموصى به في AGENTS.md
- ثم **In Apple Review** عند رفع TestFlight build
- ثم **Shipped** بعد توفّر الميزة على جميع المنصات المستهدفة

### عند فتح PR
أضف في وصف الـ PR:
```
Part of #<umbrella-issue>
```
لربط الـ PR ببطاقة الـ Umbrella على اللوح.

### عند ظهور Parity Gap
- استخدم template [`.github/ISSUE_TEMPLATE/parity_gap.md`](../.github/ISSUE_TEMPLATE/parity_gap.md)
- أضفها للوح في عمود المنصة الناقصة مباشرة (تخطّ Backlog/Spec — الـ spec موجود على المنصة الأصل)

---

## Views المقترحة (بعد الإنشاء)

| View | الغرض |
|------|------|
| `By Platform` | جدول مرتب حسب Platform — لرؤية ما هو نشط على كل منصة |
| `Sprint` | بطاقات السبرنت الحالي فقط (filter: Sprint = current) |
| `In Apple Review` | بطاقات معلقة على Apple — لمتابعة يومية |
| `Parity Gaps` | filter: Type = parity — لأسبوعية الـ Parity Audit (يوم الخميس) |

---

*آخر تحديث: 2026-05-23*
