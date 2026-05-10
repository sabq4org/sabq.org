# مثال دمج AddTaskQuickPane في TasksPage

## الخطوات

### 1. استيراد المكون

```typescript
import { AddTaskQuickPane } from '@/components/tasks';
```

### 2. إضافة المكون في TasksPage

استبدل الـ Dialog الحالي أو أضف المكون في أعلى قائمة المهام:

```typescript
export default function TasksPage() {
  const { toast } = useToast();
  const [creatingSubtaskFor, setCreatingSubtaskFor] = useState<string | null>(null);
  
  // ... existing code ...

  const createMutation = useMutation({
    mutationFn: async (data: Partial<InsertTask>) => {
      return await apiRequest('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/statistics'] });
      toast({
        title: "تم الإنشاء",
        description: "تم إنشاء المهمة بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل إنشاء المهمة",
        variant: "destructive",
      });
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ListTodo className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold">مركز المهام</h1>
            </div>
            <p className="text-muted-foreground mt-2">
              إدارة المهام والمتابعة
            </p>
          </div>
        </div>

        {/* Add Task Quick Pane */}
        <AddTaskQuickPane
          onSubmit={createMutation.mutateAsync}
          isPending={createMutation.isPending}
          creatingSubtaskFor={creatingSubtaskFor}
          onCancel={() => setCreatingSubtaskFor(null)}
        />

        {/* Statistics Cards */}
        {/* ... existing statistics code ... */}

        {/* Tasks Table */}
        {/* ... existing table code ... */}
      </div>
    </DashboardLayout>
  );
}
```

### 3. استخدام مع Subtasks

عند النقر على زر "إضافة مهمة فرعية" في الجدول:

```typescript
const handleCreateSubtask = (parentId: string) => {
  setCreatingSubtaskFor(parentId);
  // يمكن التمرير تلقائياً إلى AddTaskQuickPane
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
```

### 4. إلغاء إنشاء Subtask

```typescript
const handleCancelSubtask = () => {
  setCreatingSubtaskFor(null);
};

<AddTaskQuickPane
  onSubmit={createMutation.mutateAsync}
  isPending={createMutation.isPending}
  creatingSubtaskFor={creatingSubtaskFor}
  onCancel={handleCancelSubtask}
/>
```

## مثال كامل مبسط

```typescript
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AddTaskQuickPane } from "@/components/tasks";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InsertTask } from "@shared/schema";

export default function TasksPage() {
  const { toast } = useToast();
  const [creatingSubtaskFor, setCreatingSubtaskFor] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (data: Partial<InsertTask>) => {
      return await apiRequest('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({
        title: "تم الإنشاء",
        description: "تم إنشاء المهمة بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل إنشاء المهمة",
        variant: "destructive",
      });
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <h1 className="text-3xl font-bold">مركز المهام</h1>
        
        <AddTaskQuickPane
          onSubmit={createMutation.mutateAsync}
          isPending={createMutation.isPending}
          creatingSubtaskFor={creatingSubtaskFor}
          onCancel={() => setCreatingSubtaskFor(null)}
        />

        {/* باقي محتوى الصفحة */}
      </div>
    </DashboardLayout>
  );
}
```

## نصائح

1. **وضع المكون**: ضعه مباشرة أسفل العنوان وفوق الإحصائيات
2. **Subtasks**: عند النقر على "إضافة مهمة فرعية"، مرر `parentId` إلى `creatingSubtaskFor`
3. **التمرير التلقائي**: استخدم `window.scrollTo()` للتمرير إلى المكون عند إنشاء subtask
4. **الإلغاء**: تأكد من إعادة تعيين `creatingSubtaskFor` عند الإلغاء أو النجاح
5. **الإشعارات**: استخدم toast لعرض رسائل النجاح/الخطأ

## الميزات الإضافية

### Auto-scroll عند إنشاء Subtask

```typescript
const handleCreateSubtask = (parentId: string) => {
  setCreatingSubtaskFor(parentId);
  
  // التمرير إلى أعلى الصفحة
  setTimeout(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 100);
};
```

### عرض رسالة توضيحية

```typescript
{creatingSubtaskFor && (
  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
    <p className="text-sm text-blue-600 dark:text-blue-400">
      إضافة مهمة فرعية للمهمة: {getParentTaskName(creatingSubtaskFor)}
    </p>
  </div>
)}

<AddTaskQuickPane
  onSubmit={createMutation.mutateAsync}
  isPending={createMutation.isPending}
  creatingSubtaskFor={creatingSubtaskFor}
  onCancel={() => setCreatingSubtaskFor(null)}
/>
```
