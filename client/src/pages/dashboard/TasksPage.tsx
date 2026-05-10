import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AddTaskQuickPane, TaskViewDialog, TaskEditDialog } from "@/components/tasks";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  ListTodo, 
  Edit, 
  Trash2, 
  Eye, 
  Search, 
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  AlertCircle,
  CheckCircle2,
  ListPlus,
  Newspaper,
  Wrench,
  Users,
  Video,
  FileText,
  Rocket,
  Palette,
  LucideIcon
} from "lucide-react";
import { format, isPast } from "date-fns";
import { ar } from "date-fns/locale";
import type { Task, InsertTask } from "@shared/schema";

interface TaskStatistics {
  total: number;
  in_progress: number;
  overdue: number;
  completed: number;
}

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

const statusOptions = [
  { value: 'all', label: 'الكل' },
  { value: 'todo', label: 'قيد الانتظار' },
  { value: 'in_progress', label: 'قيد العمل' },
  { value: 'review', label: 'مراجعة' },
  { value: 'completed', label: 'مكتملة' },
] as const;

const priorityOptions = [
  { value: 'all', label: 'الكل' },
  { value: 'low', label: 'منخفضة' },
  { value: 'medium', label: 'متوسطة' },
  { value: 'high', label: 'عالية' },
  { value: 'critical', label: 'عاجلة' },
] as const;

const statusLabels: Record<string, string> = {
  todo: 'قيد الانتظار',
  in_progress: 'قيد العمل',
  review: 'مراجعة',
  completed: 'مكتملة',
  archived: 'مؤرشفة',
};

const priorityLabels: Record<string, string> = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية',
  critical: 'عاجلة',
};

function getStatusVariant(status: string): "default" | "secondary" | "outline" {
  switch (status) {
    case 'completed':
      return 'default';
    case 'in_progress':
      return 'secondary';
    default:
      return 'outline';
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'low':
      return 'text-gray-600';
    case 'medium':
      return 'text-blue-600';
    case 'high':
      return 'text-orange-600';
    case 'critical':
      return 'text-red-600';
    default:
      return 'text-gray-600';
  }
}

function getPriorityBackground(priority: string): string {
  switch (priority) {
    case 'critical':
      return 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/30';
    case 'high':
      return 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/30';
    case 'medium':
      return 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900/30';
    case 'low':
      return 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/30';
    default:
      return 'bg-gray-50 dark:bg-gray-950/20 border-gray-200 dark:border-gray-900/30';
  }
}

function getCategoryIcon(department: string | null, category: string | null): LucideIcon {
  const dept = (department || '').toLowerCase();
  const cat = (category || '').toLowerCase();
  
  if (dept.includes('تحرير') || cat.includes('editorial') || cat.includes('تحرير')) {
    return Newspaper;
  }
  if (dept.includes('تقنية') || dept.includes('تطوير') || cat.includes('technical') || cat.includes('تقنية')) {
    return Wrench;
  }
  if (dept.includes('سوشيال') || dept.includes('اجتماعي') || cat.includes('social') || cat.includes('سوشيال')) {
    return Users;
  }
  if (dept.includes('فيديو') || cat.includes('video') || cat.includes('فيديو')) {
    return Video;
  }
  if (cat.includes('design') || cat.includes('تصميم')) {
    return Palette;
  }
  if (cat.includes('improvement') || cat.includes('تحسين')) {
    return Rocket;
  }
  
  return FileText;
}

function getPriorityBadgeVariant(priority: string): "default" | "destructive" | "outline" {
  switch (priority) {
    case 'critical':
      return 'destructive';
    case 'high':
      return 'default';
    default:
      return 'outline';
  }
}

// Component for rendering subtasks
interface SubtaskRowProps {
  parentTask: Task;
  users: User[];
  onDelete: (id: string) => void;
  onCreateSubtask: (parentId: string) => void;
  onView: (taskId: string) => void;
  onEdit: (taskId: string) => void;
  onComplete: (taskId: string, completed: boolean) => void;
}

function SubtaskRow({ parentTask, users, onDelete, onCreateSubtask, onView, onEdit, onComplete }: SubtaskRowProps) {
  const { data: subtasks } = useQuery<Task[]>({
    queryKey: ['/api/tasks', 'subtasks', parentTask.id],
    queryFn: async () => {
      const res = await fetch(`/api/tasks?parentTaskId=${parentTask.id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch subtasks');
      const data = await res.json();
      return data.tasks || [];
    },
  });

  const getUserName = (userId: string | null) => {
    if (!userId) return 'غير مسند';
    const user = users.find(u => u.id === userId);
    if (!user) return 'غير معروف';
    return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
  };

  if (!subtasks || subtasks.length === 0) {
    return null;
  }

  return (
    <>
      {subtasks.map((subtask) => {
        const dueDateValue = subtask.dueDate ? new Date(subtask.dueDate) : null;
        const taskIsOverdue = dueDateValue && dueDateValue < new Date() && subtask.status !== 'completed';
        
        return (
          <TableRow key={subtask.id} data-testid={`row-subtask-${subtask.id}`} className="bg-muted/30">
            <TableCell>
              <Checkbox
                checked={subtask.status === 'completed'}
                onCheckedChange={(checked) => onComplete(subtask.id, checked as boolean)}
                data-testid={`checkbox-complete-${subtask.id}`}
              />
            </TableCell>
            <TableCell className="font-medium pr-12" data-testid={`text-title-${subtask.id}`}>
              <div className="flex items-center gap-2">
                <div className="h-px w-6 bg-border" />
                <div>
                  <div>{subtask.title}</div>
                  {subtask.description && (
                    <div className="text-sm text-muted-foreground line-clamp-1">
                      {subtask.description}
                    </div>
                  )}
                </div>
              </div>
            </TableCell>
            <TableCell data-testid={`badge-status-${subtask.id}`}>
              <Badge variant={getStatusVariant(subtask.status)}>
                {statusLabels[subtask.status]}
              </Badge>
            </TableCell>
            <TableCell data-testid={`badge-priority-${subtask.id}`}>
              <span className={getPriorityColor(subtask.priority)}>
                {priorityLabels[subtask.priority]}
              </span>
            </TableCell>
            <TableCell data-testid={`text-assignee-${subtask.id}`}>
              {getUserName(subtask.assignedToId)}
            </TableCell>
            <TableCell data-testid={`text-due-date-${subtask.id}`}>
              {dueDateValue ? (
                <div className="flex items-center gap-2">
                  <span className={taskIsOverdue ? 'text-red-600' : ''}>
                    {format(dueDateValue, 'PPP', { locale: ar })}
                  </span>
                  {taskIsOverdue && (
                    <AlertCircle className="h-4 w-4 text-red-600" data-testid={`icon-overdue-${subtask.id}`} />
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">غير محدد</span>
              )}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onView(subtask.id)}
                  data-testid={`button-view-${subtask.id}`}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(subtask.id)}
                  data-testid={`button-edit-${subtask.id}`}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(subtask.id)}
                  data-testid={`button-delete-${subtask.id}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}

// Component for rendering main task row with improved design
interface TaskRowWithSubtasksProps {
  task: Task;
  dueDateValue: Date | null;
  taskIsOverdue: boolean;
  isExpanded: boolean;
  CategoryIcon: LucideIcon;
  users: User[];
  completeMutation: any;
  toggleExpand: (taskId: string) => void;
  setViewTaskId: (id: string) => void;
  setEditTaskId: (id: string) => void;
  setDeleteId: (id: string) => void;
  handleCreateSubtask: (parentId: string) => void;
}

function TaskRowWithSubtasks({
  task,
  dueDateValue,
  taskIsOverdue,
  isExpanded,
  CategoryIcon,
  users,
  completeMutation,
  toggleExpand,
  setViewTaskId,
  setEditTaskId,
  setDeleteId,
  handleCreateSubtask,
}: TaskRowWithSubtasksProps) {
  const subtasksCount = task.subtasksCount || 0;

  const getUserName = (userId: string | null) => {
    if (!userId) return 'غير مسند';
    const user = users.find(u => u.id === userId);
    if (!user) return 'غير معروف';
    return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
  };

  const hasSubtasks = subtasksCount > 0;

  return (
    <>
      <TableRow 
        key={task.id} 
        data-testid={`row-task-${task.id}`}
        className={`group border rounded-lg p-3 ${getPriorityBackground(task.priority)}`}
      >
        <TableCell>
          <Checkbox
            checked={task.status === 'completed'}
            onCheckedChange={(checked) => completeMutation.mutate({ 
              taskId: task.id, 
              completed: checked as boolean
            })}
            disabled={completeMutation.isPending}
            data-testid={`checkbox-complete-${task.id}`}
          />
        </TableCell>
        <TableCell data-testid={`text-title-${task.id}`}>
          <div className="flex items-center gap-2">
            {hasSubtasks && (
              <button
                onClick={() => toggleExpand(task.id)}
                className="flex-shrink-0"
                data-testid={`button-expand-task-${task.id}`}
              >
                <ChevronDown 
                  className={`h-4 w-4 transition-transform ${isExpanded ? '' : '-rotate-90'}`} 
                />
              </button>
            )}
            <CategoryIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-semibold">{task.title}</span>
                {hasSubtasks && (
                  <Badge variant="outline" className="text-xs">
                    {subtasksCount}
                  </Badge>
                )}
              </div>
              {task.description && (
                <div className="text-sm text-muted-foreground line-clamp-2 mt-1">
                  {task.description}
                </div>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell data-testid={`badge-status-${task.id}`}>
          <Badge variant={getStatusVariant(task.status)}>
            {statusLabels[task.status]}
          </Badge>
        </TableCell>
        <TableCell data-testid={`badge-priority-${task.id}`}>
          <span className={getPriorityColor(task.priority)}>
            {priorityLabels[task.priority]}
          </span>
        </TableCell>
        <TableCell data-testid={`text-assignee-${task.id}`}>
          {getUserName(task.assignedToId)}
        </TableCell>
        <TableCell data-testid={`text-due-date-${task.id}`}>
          {dueDateValue ? (
            <div className="flex items-center gap-2">
              <span className={taskIsOverdue ? 'text-red-600' : ''}>
                {format(dueDateValue, 'PPP', { locale: ar })}
              </span>
              {taskIsOverdue && (
                <AlertCircle className="h-4 w-4 text-red-600" data-testid={`icon-overdue-${task.id}`} />
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">غير محدد</span>
          )}
        </TableCell>
        <TableCell>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewTaskId(task.id)}
              data-testid={`button-view-${task.id}`}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditTaskId(task.id)}
              data-testid={`button-edit-${task.id}`}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => completeMutation.mutate({ 
                taskId: task.id, 
                completed: task.status !== 'completed'
              })}
              disabled={completeMutation.isPending}
              data-testid={`button-complete-${task.id}`}
            >
              <CheckCircle2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDeleteId(task.id)}
              data-testid={`button-delete-${task.id}`}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {isExpanded && (
        <SubtaskRow 
          key={`subtask-${task.id}`}
          parentTask={task} 
          users={users} 
          onDelete={setDeleteId}
          onCreateSubtask={handleCreateSubtask}
          onView={setViewTaskId}
          onEdit={setEditTaskId}
          onComplete={(taskId, completed) => completeMutation.mutate({ taskId, completed })}
        />
      )}
    </>
  );
}

// Mobile Task Card Component
interface MobileTaskCardProps {
  task: Task;
  users: User[];
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onComplete: (id: string, completed: boolean) => void;
}

function MobileTaskCard({ task, users, onView, onEdit, onDelete, onComplete }: MobileTaskCardProps) {
  const Icon = getCategoryIcon(task.department, task.category);
  const bgClass = getPriorityBackground(task.priority);
  
  const getUserName = (userId: string | null) => {
    if (!userId) return 'غير مسند';
    const user = users.find(u => u.id === userId);
    if (!user) return 'غير معروف';
    return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
  };
  
  return (
    <Card className={`${bgClass} border rounded-lg p-4 mb-3`} data-testid={`card-mobile-task-${task.id}`}>
      {/* Header: Icon + Title + Priority Badge */}
      <div className="flex items-start gap-3 mb-2">
        <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base line-clamp-2" data-testid={`text-title-${task.id}`}>
            {task.title}
          </h3>
          {task.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
              {task.description}
            </p>
          )}
        </div>
        <Badge variant={getPriorityBadgeVariant(task.priority)} className="flex-shrink-0" data-testid={`badge-priority-${task.id}`}>
          {priorityLabels[task.priority]}
        </Badge>
      </div>

      {/* Meta Info: Status + Due Date + Assignee + Subtasks Count */}
      <div className="flex flex-wrap gap-2 mb-3 text-sm">
        <Badge variant={getStatusVariant(task.status)} data-testid={`badge-status-${task.id}`}>
          {statusLabels[task.status]}
        </Badge>
        {task.subtasksCount && task.subtasksCount > 0 && (
          <Badge variant="secondary" className="text-xs" data-testid={`badge-subtasks-${task.id}`}>
            {task.subtasksCount} مهام فرعية
          </Badge>
        )}
        {task.dueDate && (
          <span className="text-muted-foreground" data-testid={`text-due-date-${task.id}`}>
            {format(new Date(task.dueDate), 'PPP', { locale: ar })}
          </span>
        )}
        {task.assignedToId && (
          <span className="text-muted-foreground" data-testid={`text-assignee-${task.id}`}>
            👤 {getUserName(task.assignedToId)}
          </span>
        )}
      </div>

      {/* Action Buttons - ALWAYS VISIBLE */}
      <div className="flex items-center gap-2 pt-2 border-t">
        <Button size="sm" variant="ghost" onClick={() => onView(task.id)} data-testid={`button-view-${task.id}`}>
          <Eye className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onEdit(task.id)} data-testid={`button-edit-${task.id}`}>
          <Edit className="h-4 w-4" />
        </Button>
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={() => onComplete(task.id, task.status !== 'completed')}
          data-testid={`button-complete-${task.id}`}
        >
          <CheckCircle2 className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDelete(task.id)} data-testid={`button-delete-${task.id}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
        <div className="flex-1"></div>
        <Checkbox
          checked={task.status === 'completed'}
          onCheckedChange={(checked) => onComplete(task.id, checked as boolean)}
          data-testid={`checkbox-complete-${task.id}`}
        />
      </div>
    </Card>
  );
}

export default function TasksPage() {
  const { toast } = useToast();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewTaskId, setViewTaskId] = useState<string | null>(null);
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [creatingSubtaskFor, setCreatingSubtaskFor] = useState<string | null>(null);
  
  const limit = 20;

  // Fetch tasks statistics
  const { data: statistics } = useQuery<TaskStatistics>({
    queryKey: ['/api/tasks/statistics'],
    queryFn: async () => {
      const res = await fetch('/api/tasks/statistics', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch statistics');
      return await res.json();
    },
  });

  // Fetch parent tasks only (tasks without a parent)
  const { data: tasksData, isLoading, isError, refetch } = useQuery<{ tasks: Task[]; total: number; totalPages: number }>({
    queryKey: ['/api/tasks', 'parent', page, searchQuery, statusFilter, priorityFilter, assigneeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        parentTaskId: 'null', // Fetch only parent tasks
      });
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      if (priorityFilter && priorityFilter !== 'all') params.append('priority', priorityFilter);
      if (assigneeFilter && assigneeFilter !== 'all') params.append('assignedToId', assigneeFilter);

      const res = await fetch(`/api/tasks?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch tasks');
      return await res.json();
    },
  });

  // Fetch users for assignee select
  const { data: usersRaw } = useQuery<User[]>({
    queryKey: ['/api/users'],
    queryFn: async () => {
      const res = await fetch('/api/users', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch users');
      return await res.json();
    },
  });
  const users = Array.isArray(usersRaw) ? usersRaw : [];

  const createMutation = useMutation({
    mutationFn: async (data: Partial<InsertTask>) => {
      return await apiRequest('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/statistics'] });
      
      const isSubtask = !!variables.parentTaskId;
      
      toast({
        title: "تم الإنشاء",
        description: isSubtask ? "تم إنشاء المهمة الفرعية بنجاح" : "تم إنشاء المهمة بنجاح",
      });
      
      // Hybrid mode: Don't clear creatingSubtaskFor here
      // Let "إنهاء" button handle exit from subtask mode
      // This allows creating multiple subtasks in sequence
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل إنشاء المهمة",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/tasks/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/statistics'] });
      toast({
        title: "تم الحذف",
        description: "تم حذف المهمة بنجاح",
      });
      setDeleteId(null);
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل حذف المهمة",
        variant: "destructive",
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: string; completed: boolean }) => {
      return await apiRequest(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: completed ? 'completed' : 'todo',
          completedAt: completed ? new Date().toISOString() : null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/statistics'] });
      toast({
        title: "تم التحديث",
        description: "تم تحديث حالة المهمة بنجاح",
      });
    },
  });

  const toggleExpand = (taskId: string) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const handleCreateSubtask = (parentId: string) => {
    setCreatingSubtaskFor(parentId);
    // Scroll to top to show AddTaskQuickPane
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  const getParentTaskName = (parentId: string | null) => {
    if (!parentId) return null;
    const parentTask = tasksData?.tasks.find(t => t.id === parentId);
    return parentTask?.title || null;
  };

  const getUserName = (userId: string | null) => {
    if (!userId) return 'غير مسند';
    const user = users.find(u => u.id === userId);
    if (!user) return 'غير معروف';
    return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
  };

  const isOverdue = (dueDate: Date | null, status: string) => {
    if (!dueDate || status === 'completed') return false;
    return isPast(dueDate);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ListTodo className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold" data-testid="heading-tasks">
                مركز المهام
              </h1>
            </div>
            <p className="text-muted-foreground mt-2">
              إدارة المهام والمتابعة
            </p>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card data-testid="card-stat-total">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ListTodo className="h-4 w-4" />
                إجمالي المهام
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold" data-testid="text-stat-total">
                {(statistics?.total ?? 0).toLocaleString('en-US')}
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-stat-in-progress">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                قيد العمل
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-blue-600" data-testid="text-stat-in-progress">
                {(statistics?.in_progress ?? 0).toLocaleString('en-US')}
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-stat-overdue">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                متأخرة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-red-600" data-testid="text-stat-overdue">
                {(statistics?.overdue ?? 0).toLocaleString('en-US')}
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-stat-completed">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                مكتملة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-green-600" data-testid="text-stat-completed">
                {(statistics?.completed ?? 0).toLocaleString('en-US')}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Add Task Quick Pane */}
        <AddTaskQuickPane
          onSubmit={createMutation.mutateAsync}
          isPending={createMutation.isPending}
          creatingSubtaskFor={creatingSubtaskFor}
          onCancel={() => setCreatingSubtaskFor(null)}
        />

        {/* Filters Section */}
        <Card data-testid="card-filters">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              الفلاتر
            </CardTitle>
            <CardDescription>تصفية المهام حسب المعايير</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="relative">
                <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث في العنوان والوصف..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="pr-10"
                  data-testid="input-search"
                />
              </div>

              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger data-testid="select-status-filter">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={priorityFilter}
                onValueChange={(value) => {
                  setPriorityFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger data-testid="select-priority-filter">
                  <SelectValue placeholder="الأولوية" />
                </SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={assigneeFilter}
                onValueChange={(value) => {
                  setAssigneeFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger data-testid="select-assignee-filter">
                  <SelectValue placeholder="المسؤول" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="unassigned">غير مسند</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {`${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Error State */}
        {isError && (
          <Card data-testid="card-error">
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
              <p className="text-destructive text-lg font-medium mb-2">حدث خطأ أثناء تحميل المهام</p>
              <p className="text-muted-foreground mb-4">يرجى المحاولة مرة أخرى</p>
              <Button onClick={() => refetch()} variant="outline" data-testid="button-retry">
                إعادة المحاولة
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Tasks Table */}
        {!isError && (
          <Card>
            <CardHeader>
              <CardTitle>جميع المهام</CardTitle>
              <CardDescription>
                عرض ({(tasksData?.tasks?.length ?? 0).toLocaleString('en-US')}) من ({(tasksData?.total ?? 0).toLocaleString('en-US')}) مهمة
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  جاري التحميل...
                </div>
              ) : !tasksData?.tasks || tasksData.tasks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ListTodo className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>لا توجد مهام</p>
                  <p className="text-sm">انقر على "مهمة جديدة" للبدء</p>
                </div>
              ) : (
                <>
                  {/* Mobile View - Cards */}
                  <div className="md:hidden space-y-3">
                    {tasksData.tasks.map((task) => (
                      <MobileTaskCard
                        key={task.id}
                        task={task}
                        users={users}
                        onView={setViewTaskId}
                        onEdit={setEditTaskId}
                        onDelete={(id) => { setDeleteId(id); }}
                        onComplete={(id, completed) => {
                          completeMutation.mutate({ taskId: id, completed });
                        }}
                      />
                    ))}
                  </div>

                  {/* Desktop View - Table (hidden on mobile) */}
                  <div className="hidden md:block overflow-x-auto -mx-4 sm:mx-0">
                    <div className="inline-block min-w-full align-middle">
                      <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right w-12">إكمال</TableHead>
                          <TableHead className="text-right">العنوان</TableHead>
                          <TableHead className="text-right">الحالة</TableHead>
                          <TableHead className="text-right">الأولوية</TableHead>
                          <TableHead className="text-right">المسؤول</TableHead>
                          <TableHead className="text-right">تاريخ الاستحقاق</TableHead>
                          <TableHead className="text-right">الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                    <TableBody>
                      {tasksData.tasks.map((task) => {
                      const dueDateValue = task.dueDate ? new Date(task.dueDate) : null;
                      const taskIsOverdue = !!(dueDateValue && dueDateValue < new Date() && task.status !== 'completed');
                      const isExpanded = expandedTasks.has(task.id);
                      const CategoryIcon = getCategoryIcon(task.department, task.category);
                      
                      return (
                        <TaskRowWithSubtasks
                          key={task.id}
                          task={task}
                          dueDateValue={dueDateValue}
                          taskIsOverdue={taskIsOverdue}
                          isExpanded={isExpanded}
                          CategoryIcon={CategoryIcon}
                          users={users}
                          completeMutation={completeMutation}
                          toggleExpand={toggleExpand}
                          setViewTaskId={setViewTaskId}
                          setEditTaskId={setEditTaskId}
                          setDeleteId={setDeleteId}
                          handleCreateSubtask={handleCreateSubtask}
                        />
                      );
                    })}
                    </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Pagination */}
                  {tasksData && tasksData.totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <div className="text-sm text-muted-foreground">
                        صفحة {page.toLocaleString('en-US')} من {tasksData.totalPages.toLocaleString('en-US')}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page === 1}
                          data-testid="button-previous-page"
                        >
                          <ChevronRight className="h-4 w-4 ml-2" />
                          السابق
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage(p => Math.min(tasksData.totalPages, p + 1))}
                          disabled={page === tasksData.totalPages}
                          data-testid="button-next-page"
                        >
                          التالي
                          <ChevronLeft className="h-4 w-4 mr-2" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* View Task Dialog */}
        {viewTaskId && (
          <TaskViewDialog
            taskId={viewTaskId}
            onClose={() => setViewTaskId(null)}
          />
        )}

        {/* Edit Task Dialog */}
        {editTaskId && (
          <TaskEditDialog
            taskId={editTaskId}
            onClose={() => setEditTaskId(null)}
            onSuccess={() => {
              refetch();
            }}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle data-testid="dialog-title-delete">تأكيد الحذف</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من حذف هذه المهمة؟ لا يمكن التراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
