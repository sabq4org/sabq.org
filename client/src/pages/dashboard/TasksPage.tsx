import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
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
import { useAuth, hasPermission } from "@/hooks/useAuth";
import { apiRequest, queryClient, apiUrl } from "@/lib/queryClient";
import { 
  ListTodo, 
  Edit, 
  Trash2, 
  Eye, 
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  AlertCircle,
  CheckCircle2,
  Newspaper,
  Wrench,
  Users,
  Video,
  FileText,
  Rocket,
  Palette,
  CheckCheck,
  LucideIcon
} from "lucide-react";
import { isPast } from "date-fns";
import type { Task, InsertTask } from "@shared/schema";
import { cn } from "@/lib/utils";

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

function formatTaskDate(date: Date) {
  return date.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "completed":
      return "border-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "in_progress":
      return "border-0 bg-sky-100 text-sky-800 hover:bg-sky-100 dark:bg-sky-900/40 dark:text-sky-300";
    case "review":
      return "border-0 bg-violet-100 text-violet-800 hover:bg-violet-100 dark:bg-violet-900/40 dark:text-violet-300";
    case "todo":
      return "border-border bg-muted text-muted-foreground hover:bg-muted";
    case "archived":
      return "border-border bg-muted/60 text-muted-foreground hover:bg-muted/60";
    default:
      return "border-border bg-muted text-muted-foreground hover:bg-muted";
  }
}

function getPriorityBadgeClass(priority: string): string {
  switch (priority) {
    case "critical":
      return "border-0 bg-rose-100 text-rose-800 hover:bg-rose-100 dark:bg-rose-900/40 dark:text-rose-300";
    case "high":
      return "border-0 bg-orange-100 text-orange-800 hover:bg-orange-100 dark:bg-orange-900/40 dark:text-orange-300";
    case "medium":
      return "border-0 bg-sky-100 text-sky-800 hover:bg-sky-100 dark:bg-sky-900/40 dark:text-sky-300";
    case "low":
      return "border-0 bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-slate-800/50 dark:text-slate-300";
    default:
      return "border-border bg-muted text-muted-foreground hover:bg-muted";
  }
}

/** تلوين الصف حسب الأولوية للمهام المفتوحة فقط — المكتملة محايدة */
function getTaskRowBackground(priority: string, status: string): string {
  if (status === "completed" || status === "archived") {
    return "bg-muted/25 dark:bg-card border-border";
  }
  switch (priority) {
    case "critical":
      return "bg-rose-50/90 dark:bg-card border-rose-200/80 dark:border-border";
    case "high":
      return "bg-orange-50/90 dark:bg-card border-orange-200/80 dark:border-border";
    case "medium":
      return "bg-sky-50/70 dark:bg-card border-sky-200/70 dark:border-border";
    case "low":
      return "bg-slate-50/80 dark:bg-card border-slate-200/70 dark:border-border";
    default:
      return "bg-card border-border";
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
      const res = await fetch(apiUrl(`/api/tasks?parentTaskId=${parentTask.id}`), { credentials: 'include' });
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
              <Badge className={getStatusBadgeClass(subtask.status)}>
                {statusLabels[subtask.status]}
              </Badge>
            </TableCell>
            <TableCell data-testid={`badge-priority-${subtask.id}`}>
              <Badge className={getPriorityBadgeClass(subtask.priority)}>
                {priorityLabels[subtask.priority]}
              </Badge>
            </TableCell>
            <TableCell data-testid={`text-assignee-${subtask.id}`}>
              {getUserName(subtask.assignedToId)}
            </TableCell>
            <TableCell data-testid={`text-due-date-${subtask.id}`}>
              {dueDateValue ? (
                <div className="flex items-center gap-2">
                  <span className={taskIsOverdue ? 'text-red-600' : ''}>
                    {formatTaskDate(dueDateValue)}
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
                  title="حذف المهمة"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onDelete(subtask.id)}
                  data-testid={`button-delete-${subtask.id}`}
                >
                  <Trash2 className="h-4 w-4" />
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
        className={`group border rounded-lg p-3 ${getTaskRowBackground(task.priority, task.status)}`}
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
                <span className={cn(
                  "text-base font-semibold",
                  task.status === "completed" && "text-muted-foreground",
                )}>{task.title}</span>
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
          <Badge className={getStatusBadgeClass(task.status)}>
            {statusLabels[task.status]}
          </Badge>
        </TableCell>
        <TableCell data-testid={`badge-priority-${task.id}`}>
          <Badge className={getPriorityBadgeClass(task.priority)}>
            {priorityLabels[task.priority]}
          </Badge>
        </TableCell>
        <TableCell data-testid={`text-assignee-${task.id}`}>
          {getUserName(task.assignedToId)}
        </TableCell>
        <TableCell data-testid={`text-due-date-${task.id}`}>
          {dueDateValue ? (
            <div className="flex items-center gap-2">
              <span className={taskIsOverdue ? 'text-red-600' : ''}>
                {formatTaskDate(dueDateValue)}
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
              title="حذف المهمة"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteId(task.id)}
              data-testid={`button-delete-${task.id}`}
            >
              <Trash2 className="h-4 w-4" />
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
  const bgClass = getTaskRowBackground(task.priority, task.status);
  
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
          <h3
            className={cn(
              "font-semibold text-base line-clamp-2",
              task.status === "completed" && "text-muted-foreground",
            )}
            data-testid={`text-title-${task.id}`}
          >
            {task.title}
          </h3>
          {task.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
              {task.description}
            </p>
          )}
        </div>
        <Badge className={cn("flex-shrink-0", getPriorityBadgeClass(task.priority))} data-testid={`badge-priority-${task.id}`}>
          {priorityLabels[task.priority]}
        </Badge>
      </div>

      {/* Meta Info: Status + Due Date + Assignee + Subtasks Count */}
      <div className="flex flex-wrap gap-2 mb-3 text-sm">
        <Badge className={getStatusBadgeClass(task.status)} data-testid={`badge-status-${task.id}`}>
          {statusLabels[task.status]}
        </Badge>
        {task.subtasksCount && task.subtasksCount > 0 && (
          <Badge variant="secondary" className="text-xs" data-testid={`badge-subtasks-${task.id}`}>
            {task.subtasksCount} مهام فرعية
          </Badge>
        )}
        {task.dueDate && (
          <span className="text-muted-foreground" data-testid={`text-due-date-${task.id}`}>
            {formatTaskDate(new Date(task.dueDate))}
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
        <Button
          size="sm"
          variant="ghost"
          title="حذف المهمة"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onDelete(task.id)}
          data-testid={`button-delete-${task.id}`}
        >
          <Trash2 className="h-4 w-4" />
          <span className="sr-only sm:not-sr-only sm:ms-1 text-xs">حذف</span>
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

function taskApiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) return fallback;
  const raw = error.message;
  try {
    const jsonStart = raw.indexOf("{");
    if (jsonStart >= 0) {
      const data = JSON.parse(raw.slice(jsonStart)) as { error?: string; message?: string };
      if (data.message) return data.message;
      if (data.error) return data.error;
    }
  } catch {
    /* ignore */
  }
  if (raw.includes("غير مصرح")) return raw.replace(/^\d+:\s*/, "");
  return raw.length < 160 && !/^\d+:\s*\{/.test(raw) ? raw : fallback;
}

export default function TasksPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [completeAllOpen, setCompleteAllOpen] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
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
      const res = await fetch(apiUrl('/api/tasks/statistics'), { credentials: 'include' });
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

      const res = await fetch(apiUrl(`/api/tasks?${params}`), { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch tasks');
      return await res.json();
    },
  });

  // Fetch users for assignee select
  const { data: usersRaw } = useQuery<User[]>({
    queryKey: ['/api/users'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/users'), { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch users');
      return await res.json();
    },
    // /api/users requires admin.manage_settings; only fetch for users who can,
    // so non-admins don't generate (retry-amplified) 403s on page load.
    enabled: hasPermission(user, 'admin.manage_settings'),
    retry: false,
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
    onError: (error: unknown) => {
      toast({
        title: "تعذر الحذف",
        description: taskApiErrorMessage(error, "فشل حذف المهمة"),
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

  const completeAllMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest<{ completedCount: number; skippedCount: number }>(
        "/api/tasks/complete-all",
        {
          method: "POST",
          body: JSON.stringify({
            search: searchQuery || undefined,
            status: statusFilter,
            priority: priorityFilter,
            assignedToId: assigneeFilter,
          }),
        },
      );
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/statistics"] });
      setCompleteAllOpen(false);
      toast({
        title: "تم إتمام المهام",
        description:
          result.completedCount > 0
            ? `أُتمّت ${result.completedCount.toLocaleString("en-US")} مهمة` +
              (result.skippedCount
                ? ` (تُخطّي ${result.skippedCount.toLocaleString("en-US")})`
                : "")
            : "لا توجد مهام مفتوحة لإتمامها ضمن الفلاتر الحالية",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "تعذر إتمام الكل",
        description: taskApiErrorMessage(error, "فشل إتمام المهام"),
        variant: "destructive",
      });
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest<{ deletedCount: number; skippedCount: number }>(
        "/api/tasks/delete-all",
        {
          method: "POST",
          body: JSON.stringify({
            search: searchQuery || undefined,
            status: statusFilter,
            priority: priorityFilter,
            assignedToId: assigneeFilter,
          }),
        },
      );
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/statistics"] });
      setDeleteAllOpen(false);
      toast({
        title: "تم حذف المهام",
        description:
          result.deletedCount > 0
            ? `حُذفت ${result.deletedCount.toLocaleString("en-US")} مهمة` +
              (result.skippedCount
                ? ` (تُخطّي ${result.skippedCount.toLocaleString("en-US")})`
                : "")
            : "لا توجد مهام للحذف ضمن الفلاتر الحالية",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "تعذر حذف الكل",
        description: taskApiErrorMessage(error, "فشل حذف المهام"),
        variant: "destructive",
      });
    },
  });

  const incompleteOnPage =
    tasksData?.tasks.filter((t) => t.status !== "completed" && t.status !== "archived")
      .length ?? 0;
  const openTasksEstimate =
    statusFilter === "completed" || statusFilter === "archived"
      ? 0
      : statusFilter !== "all"
        ? (tasksData?.total ?? incompleteOnPage)
        : Math.max(0, (statistics?.total ?? 0) - (statistics?.completed ?? 0));
  const canCompleteAll =
    openTasksEstimate > 0 &&
    statusFilter !== "completed" &&
    statusFilter !== "archived";
  const deleteAllEstimate = tasksData?.total ?? 0;
  const canDeleteAll = deleteAllEstimate > 0;

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
      <DashboardPageShell>
        <DashboardPageHeader
          icon={ListTodo}
          title="مركز المهام"
          description="إدارة المهام والمتابعة — المتأخرة والأهم أولاً"
          titleTestId="heading-tasks"
        />

        {/* Compact stats */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div
            className="rounded-xl border bg-card px-3 py-2.5"
            data-testid="card-stat-total"
          >
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ListTodo className="h-3.5 w-3.5" />
              الإجمالي
            </div>
            <div className="mt-0.5 text-lg font-bold tabular-nums" data-testid="text-stat-total">
              {(statistics?.total ?? 0).toLocaleString("en-US")}
            </div>
          </div>
          <div
            className="rounded-xl border bg-card px-3 py-2.5"
            data-testid="card-stat-in-progress"
          >
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 text-cyan-700" />
              قيد العمل
            </div>
            <div
              className="mt-0.5 text-lg font-bold tabular-nums text-cyan-700 dark:text-cyan-300"
              data-testid="text-stat-in-progress"
            >
              {(statistics?.in_progress ?? 0).toLocaleString("en-US")}
            </div>
          </div>
          <div
            className="rounded-xl border bg-card px-3 py-2.5"
            data-testid="card-stat-overdue"
          >
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5 text-rose-700" />
              متأخرة
            </div>
            <div
              className="mt-0.5 text-lg font-bold tabular-nums text-rose-700 dark:text-rose-300"
              data-testid="text-stat-overdue"
            >
              {(statistics?.overdue ?? 0).toLocaleString("en-US")}
            </div>
          </div>
          <div
            className="rounded-xl border bg-card px-3 py-2.5"
            data-testid="card-stat-completed"
          >
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
              مكتملة
            </div>
            <div
              className="mt-0.5 text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300"
              data-testid="text-stat-completed"
            >
              {(statistics?.completed ?? 0).toLocaleString("en-US")}
            </div>
          </div>
        </div>

        <AddTaskQuickPane
          onSubmit={createMutation.mutateAsync}
          isPending={createMutation.isPending}
          creatingSubtaskFor={creatingSubtaskFor}
          onCancel={() => setCreatingSubtaskFor(null)}
        />

        {/* Compact filters toolbar */}
        <div
          className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center"
          data-testid="card-filters"
        >
          <div className="relative min-w-[12rem] flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="بحث..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="h-9 pr-10"
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
            <SelectTrigger className="h-9 w-full sm:w-[9.5rem]" data-testid="select-status-filter">
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
            <SelectTrigger className="h-9 w-full sm:w-[9.5rem]" data-testid="select-priority-filter">
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
            <SelectTrigger className="h-9 w-full sm:w-[10rem]" data-testid="select-assignee-filter">
              <SelectValue placeholder="المسؤول" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="unassigned">غير مسند</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {`${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
          <Card className="rounded-xl border bg-card shadow-sm">
            <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">قائمة المهام</CardTitle>
                <CardDescription className="tabular-nums">
                  {(tasksData?.tasks?.length ?? 0).toLocaleString("en-US")} من{" "}
                  {(tasksData?.total ?? 0).toLocaleString("en-US")} — مرتّبة بالمتأخر والأهم أولاً
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="gap-1.5"
                  disabled={!canCompleteAll || completeAllMutation.isPending}
                  onClick={() => setCompleteAllOpen(true)}
                  data-testid="button-complete-all"
                >
                  <CheckCheck className="h-4 w-4" />
                  إتمام الكل
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  disabled={!canDeleteAll || deleteAllMutation.isPending}
                  onClick={() => setDeleteAllOpen(true)}
                  data-testid="button-delete-all"
                >
                  <Trash2 className="h-4 w-4" />
                  حذف الكل
                </Button>
              </div>
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
                      <div className="text-sm text-muted-foreground tabular-nums">
                        صفحة {page.toLocaleString("en-US")} من {tasksData.totalPages.toLocaleString("en-US")}
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
        <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
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
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "جاري الحذف..." : "حذف"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={completeAllOpen} onOpenChange={setCompleteAllOpen}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle data-testid="dialog-title-complete-all">
                إتمام كل المهام المفتوحة؟
              </AlertDialogTitle>
              <AlertDialogDescription>
                سيتم تعليم المهام غير المكتملة ضمن الفلاتر الحالية كمكتملة
                {openTasksEstimate > 0 ? (
                  <>
                    {" "}
                    (حوالي{" "}
                    <span className="font-semibold tabular-nums">
                      {openTasksEstimate.toLocaleString("en-US")}
                    </span>{" "}
                    مهمة، بحد أقصى 200)
                  </>
                ) : null}
                . لا يمكن التراجع دفعة واحدة.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-complete-all">إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => completeAllMutation.mutate()}
                disabled={completeAllMutation.isPending}
                data-testid="button-confirm-complete-all"
              >
                {completeAllMutation.isPending ? "جاري الإتمام..." : "إتمام الكل"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle data-testid="dialog-title-delete-all">
                حذف كل المهام ضمن الفلاتر؟
              </AlertDialogTitle>
              <AlertDialogDescription>
                سيتم حذف المهام الجذر المطابقة للفلاتر الحالية نهائياً
                {deleteAllEstimate > 0 ? (
                  <>
                    {" "}
                    (حوالي{" "}
                    <span className="font-semibold tabular-nums">
                      {deleteAllEstimate.toLocaleString("en-US")}
                    </span>{" "}
                    مهمة، بحد أقصى 200)
                  </>
                ) : null}
                ، بما فيها المهام الفرعية المرتبطة. لا يمكن التراجع.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete-all">إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteAllMutation.mutate()}
                disabled={deleteAllMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete-all"
              >
                {deleteAllMutation.isPending ? "جاري الحذف..." : "حذف الكل"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DashboardPageShell>
    </DashboardLayout>
  );
}
