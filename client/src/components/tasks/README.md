# AddTaskQuickPane Component

مكون إضافة مهام سريع بنمط Todoist الاحترافي مع دعم كامل لـ RTL والوضع المظلم.

## المميزات الرئيسية

### ✨ الحالات (States)
1. **Collapsed (مطوي)**: سطر واحد للإدخال السريع
2. **Expanded (موسع)**: نموذج كامل مع جميع الخيارات

### 🎯 التفاعل
- **Enter** على العنوان → إنشاء سريع (title فقط)
- **Click** على أي زر ذكي → توسع تلقائي للنموذج
- **Focus** على input العنوان → توسع تلقائي
- **Framer Motion** للانتقالات الناعمة

### 🔧 الأزرار الذكية
1. **تاريخ الاستحقاق** - مع Calendar Picker
2. **الأولوية** - أربعة مستويات (منخفضة، متوسطة، عالية، عاجلة)
3. **المسؤول** - اختيار من قائمة المستخدمين

## الاستخدام

### مثال بسيط

```tsx
import { AddTaskQuickPane } from '@/components/tasks';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';

function MyTasksPage() {
  const createMutation = useMutation({
    mutationFn: async (data: Partial<InsertTask>) => {
      return await apiRequest('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
    },
  });

  return (
    <div>
      <AddTaskQuickPane
        onSubmit={createMutation.mutateAsync}
        isPending={createMutation.isPending}
      />
    </div>
  );
}
```

### مثال مع Subtask

```tsx
import { AddTaskQuickPane } from '@/components/tasks';

function TaskWithSubtasks() {
  const [parentTaskId, setParentTaskId] = useState<string | null>(null);

  return (
    <div>
      {parentTaskId && (
        <AddTaskQuickPane
          onSubmit={createMutation.mutateAsync}
          isPending={createMutation.isPending}
          creatingSubtaskFor={parentTaskId}
          onCancel={() => setParentTaskId(null)}
        />
      )}
    </div>
  );
}
```

## Props

```typescript
interface AddTaskQuickPaneProps {
  onSubmit: (data: Partial<InsertTask>) => Promise<void>;
  isPending?: boolean;
  creatingSubtaskFor?: string | null;
  onCancel?: () => void;
}
```

### Props Details

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `onSubmit` | `(data: Partial<InsertTask>) => Promise<void>` | ✅ | دالة معالجة إرسال المهمة الجديدة |
| `isPending` | `boolean` | ❌ | حالة التحميل - يعطل جميع العناصر أثناء الإرسال |
| `creatingSubtaskFor` | `string \| null` | ❌ | معرف المهمة الأب عند إنشاء مهمة فرعية |
| `onCancel` | `() => void` | ❌ | دالة معالجة الإلغاء |

## البيانات المُرسلة

عند الإرسال السريع (Enter):
```typescript
{
  title: string,
  status: "todo",
  priority: "medium",
  parentTaskId?: string
}
```

عند الإرسال الكامل:
```typescript
{
  title: string,
  description?: string,
  status: "todo" | "in_progress" | "review" | "completed" | "archived",
  priority: "low" | "medium" | "high" | "critical",
  dueDate?: string, // ISO string
  assignedToId?: string,
  parentTaskId?: string
}
```

## التحقق (Validation)

- **العنوان**: مطلوب (min 1 character)
- **الوصف**: اختياري
- **التاريخ**: اختياري (يجب أن يكون في المستقبل)
- **الأولوية**: افتراضي "medium"
- **المسؤول**: اختياري

## Data Test IDs

جميع العناصر التفاعلية تحتوي على `data-testid` للاختبار:

- `card-add-task-quick-pane` - Card الرئيسية
- `input-task-title` - حقل العنوان
- `textarea-task-description` - حقل الوصف
- `button-task-due-date` - زر تاريخ الاستحقاق
- `button-task-priority` - زر الأولوية
- `button-task-assignee` - زر المسؤول
- `button-priority-${value}` - أزرار اختيار الأولوية
- `button-assignee-${userId}` - أزرار اختيار المسؤول
- `button-assignee-none` - زر إزالة المسؤول
- `button-task-cancel` - زر الإلغاء
- `button-task-submit` - زر الإرسال
- `button-clear-due-date` - زر إزالة التاريخ

## التصميم

- ✅ RTL Support كامل
- ✅ Dark Mode Support تلقائي
- ✅ Responsive Design
- ✅ Framer Motion Animations
- ✅ Shadcn UI Components
- ✅ Accessibility Features

## الملاحظات

1. المكون يستخدم `useQuery` لجلب قائمة المستخدمين تلقائياً
2. جميع الحقول تُخزن في form state باستخدام react-hook-form
3. التحقق يتم باستخدام Zod schema
4. الانتقالات السلسة باستخدام Framer Motion
5. Auto-focus على حقل العنوان عند التوسع

## المتطلبات

```json
{
  "react-hook-form": "^7.x",
  "framer-motion": "^10.x",
  "@hookform/resolvers": "^3.x",
  "zod": "^3.x",
  "date-fns": "^2.x",
  "@tanstack/react-query": "^5.x"
}
```
