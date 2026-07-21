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
  LucideIcon,
  CheckCheck,
  RefreshCw,
  X,
  Plus
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
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

function SubtaskRow({ parentTask, users, onDelete, onCreateSubtask, onView, onEdit, onComplete, isSelected = false, onToggleSelect }: SubtaskRowProps) {
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
          <TableRow key={subtask.id} data-testid={`row-subtask-${subtask.id}`} className="bg-muted/30 hover:bg-muted/50 transition-colors">
            <TableCell>
              {onToggleSelect && (
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggleSelect(subtask.id)}
                  aria-label={`تحديد ${subtask.title}`}
                  data-testid={`checkbox-select-${subtask.id}`}
                />
              )}
            </TableCell>
            <TableCell className="font-medium pr-12" data-testid={`text-title-${subtask.id}`}>
              <div className="flex items-center gap-2">
                <div className="h-px w-6 bg-border" />
                <div>
                  <div className={cn(subtask.status === "completed" && "line-through text-muted-foreground")}>
                    {subtask.title}
                  </div>
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
                  <span className={taskIsOverdue ? 'text-red-600 font-medium' : ''}>
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
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onView(subtask.id)}
                  title="عرض التفاصيل"
                  data-testid={`button-view-${subtask.id}`}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(subtask.id)}
                  title="تعديل المهمة"
                  data-testid={`button-edit-${subtask.id}`}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onComplete(subtask.id, subtask.status !== 'completed')}
                  title={subtask.status === 'completed' ? "إلغاء الإتمام" : "إتمام المهمة"}
                  data-testid={`button-complete-${subtask.id}`}
                >
                  <CheckCircle2 className={cn("h-4 w-4", subtask.status === 'completed' ? "text-emerald-600" : "")} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(subtask.id)}
                  title="حذف المهمة"
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
  isSelected: boolean;
  CategoryIcon: LucideIcon;
  users: User[];
  completeMutation: any;
  toggleExpand: (taskId: string) => void;
  toggleSelect: (taskId: string) => void;
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
  isSelected,
  CategoryIcon,
  users,
  completeMutation,
  toggleExpand,
  toggleSelect,
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
        className={cn(
          "border transition-colors hover:bg-muted/40",
          isSelected && "bg-sky-50/80 dark:bg-sky-950/30 border-sky-300 dark:border-sky-800",
          !isSelected && getTaskRowBackground(task.priority, task.status)
        )}
      >
        <TableCell>
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => toggleSelect(task.id)}
            aria-label={`تحديد ${task.title}`}
            data-testid={`checkbox-select-${task.id}`}
          />
        </TableCell>
        <TableCell data-testid={`text-title-${task.id}`}>
          <div className="flex items-center gap-2">
            {hasSubtasks && (
              <button
                onClick={() => toggleExpand(task.id)}
                className="flex-shrink-0 text-muted-foreground hover:text-foreground"
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
                  task.status === "completed" && "text-muted-foreground line-through",
                )}>{task.title}</span>
                {hasSubtasks && (
                  <Badge variant="outline" className="text-xs">
                    {subtasksCount} مهام فرعية
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
              <span className={taskIsOverdue ? 'text-red-600 font-medium' : ''}>
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
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewTaskId(task.id)}
              title="عرض التفاصيل"
              data-testid={`button-view-${task.id}`}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditTaskId(task.id)}
              title="تعديل المهمة"
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
              title={task.status === 'completed' ? "إلغاء الإتمام" : "إتمام المهمة"}
              data-testid={`button-complete-${task.id}`}
            >
              <CheckCircle2 className={cn("h-4 w-4", task.status === 'completed' ? "text-emerald-600" : "")} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDeleteId(task.id)}
              title="حذف المهمة"
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
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onComplete: (id: string, completed: boolean) => void;
}

function MobileTaskCard({ task, users, isSelected, onToggleSelect, onView, onEdit, onDelete, onComplete }: MobileTaskCardProps) {
  const Icon = getCategoryIcon(task.department, task.category);
  const bgClass = getTaskRowBackground(task.priority, task.status);
  
  const getUserName = (userId: string | null) => {
    if (!userId) return 'غير مسند';
    const user = users.find(u => u.id === userId);
    if (!user) return 'غير معروف';
    return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
  };
  
  return (
    <Card className={cn(
      bgClass,
      "border rounded-lg p-4 mb-3 transition-colors",
      isSelected && "ring-2 ring-sky-500 bg-sky-50/90 dark:bg-sky-950/40"
    )} data-testid={`card-mobile-task-${task.id}`}>
      {/* Header: Select + Icon + Title + Priority Badge */}
      <div className="flex items-start gap-3 mb-2">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(task.id)}
          aria-label={`تحديد ${task.title}`}
          className="mt-1 flex-shrink-0"
          data-testid={`checkbox-select-${task.id}`}
        />
        <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
        <div className="flex-1 min-w-0">
          <h3
            className={cn(
              "font-semibold text-base line-clamp-2",
              task.status === "completed" && "text-muted-foreground line-through",
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

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-2 border-t justify-between">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => onView(task.id)} data-testid={`button-view-${task.id}`}>
            <Eye className="h-4 w-4 ml-1" />
            عرض
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onEdit(task.id)} data-testid={`button-edit-${task.id}`}>
            <Edit className="h-4 w-4 ml-1" />
            تعديل
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(task.id)} data-testid={`button-delete-${task.id}`}>
            <Trash2 className="h-4 w-4 text-destructive ml-1" />
            حذف
          </Button>
        </div>
        <Button
          size="sm"
          variant={task.status === 'completed' ? "outline" : "default"}
          onClick={() => onComplete(task.id, task.status !== 'completed')}
          data-testid={`button-complete-${task.id}`}
        >
          <CheckCircle2 className="h-4 w-4 ml-1" />
          {task.status === 'completed' ? "إلغاء الإتمام" : "إتمام"}
        </Button>
      </div>
    </Card>
  );
}

export default function TasksPage() {
  const { toast } = useToast();
  const { user } = useAuth();
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

  // Bulk action states
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmCompleteAllOpen, setConfirmCompleteAllOpen] = useState(false);
  
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
      setSelectedTaskIds(prev => prev.filter(taskId => taskId !== deleteId));
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

  const bulkCompleteMutation = useMutation({
    mutationFn: async ({ taskIds, allOpen }: { taskIds?: string[]; allOpen?: boolean }) => {
      return await apiRequest('/api/tasks/bulk-complete', {
        method: 'POST',
        body: JSON.stringify({ taskIds, allOpen }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/statistics'] });
      setSelectedTaskIds([]);
      setConfirmCompleteAllOpen(false);
      toast({
        title: "تم الإتمام بنجاح",
        description: data.message || "تم تحديث المهام بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل إتمام المهام الجماعي",
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (taskIds: string[]) => {
      return await apiRequest('/api/tasks/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ taskIds }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/statistics'] });
      setSelectedTaskIds([]);
      setConfirmBulkDelete(false);
      toast({
        title: "تم الحذف بنجاح",
        description: data.message || "تم حذف المهام المحددة بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل حذف المهام الجماعي",
        variant: "destructive",
      });
    },
  });

  const toggleSelectTask = (taskId: string) => {
    setSelectedTaskIds(prev => {
      if (prev.includes(taskId)) {
        return prev.filter(id => id !== taskId);
      } else {
        return [...prev, taskId];
      }
    });
  };

  const currentVisibleTasks = tasksData?.tasks || [];
  const isAllVisibleSelected = currentVisibleTasks.length > 0 && currentVisibleTasks.every(t => selectedTaskIds.includes(t.id));

  const toggleSelectAllVisible = () => {
    if (isAllVisibleSelected) {
      const visibleIds = currentVisibleTasks.map(t => t.id);
      setSelectedTaskIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      const visibleIds = currentVisibleTasks.map(t => t.id);
      const newSet = new Set([...selectedTaskIds, ...visibleIds]);
      setSelectedTaskIds(Array.from(newSet));
    }
  };

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
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  return (
    <DashboardLayout>
      <DashboardPageShell>
        {/* Header & Main Control Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <DashboardPageHeader
            icon={ListTodo}
            title="مركز المهام"
            description="إدارة ومتابعة المهام التحريرية والتقنية"
            titleTestId="heading-tasks"
          />
          
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-1.5"
              data-testid="button-refresh-tasks"
            >
              <RefreshCw className="h-4 w-4" />
              <span>تحديث</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmCompleteAllOpen(true)}
              className="gap-1.5 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/80 border-emerald-200 dark:border-emerald-800"
              data-testid="button-complete-all-open"
            >
              <CheckCheck className="h-4 w-4" />
              <span>إتمام كل المهام المفتوحة</span>
            </Button>
          </div>
        </div>

        {/* Floating / Sticky Selection Action Bar */}
        {selectedTaskIds.length > 0 && (
          <div className="sticky top-4 z-20 flex items-center justify-between p-3.5 bg-card/95 backdrop-blur border-2 border-sky-500/80 shadow-lg rounded-xl transition-all animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <Badge className="bg-sky-600 text-white text-sm px-2.5 py-0.5">
                تم تحديد {selectedTaskIds.length.toLocaleString("en-US")} مهمة
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={() => bulkCompleteMutation.mutate({ taskIds: selectedTaskIds })}
                disabled={bulkCompleteMutation.isPending}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                data-testid="button-bulk-complete-selected"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>إتمام المحددة ({selectedTaskIds.length})</span>
              </Button>

              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmBulkDelete(true)}
                disabled={bulkDeleteMutation.isPending}
                className="gap-1.5"
                data-testid="button-bulk-delete-selected"
              >
                <Trash2 className="h-4 w-4" />
                <span>حذف المحددة ({selectedTaskIds.length})</span>
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedTaskIds([])}
                data-testid="button-clear-selection"
              >
                <X className="h-4 w-4 ml-1" />
                إلغاء التحديد
              </Button>
            </div>
          </div>
        )}

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card
            className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/50 via-card to-card shadow-sm dark:border-sky-900/35 dark:from-sky-950/15"
            data-testid="card-stat-total"
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="rounded-lg bg-sky-100/80 p-1.5 dark:bg-sky-950/40">
                  <ListTodo className="h-4 w-4 text-sky-700 dark:text-sky-300" />
                </span>
                إجمالي المهام
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold tabular-nums" data-testid="text-stat-total">
                {(statistics?.total ?? 0).toLocaleString("en-US")}
              </div>
            </CardContent>
          </Card>

          <Card
            className="rounded-2xl border-cyan-200/55 bg-gradient-to-br from-cyan-50/50 via-card to-card shadow-sm dark:border-cyan-900/35 dark:from-cyan-950/15"
            data-testid="card-stat-in-progress"
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="rounded-lg bg-cyan-100/80 p-1.5 dark:bg-cyan-950/40">
                  <Clock className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
                </span>
                قيد العمل
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold tabular-nums text-cyan-700 dark:text-cyan-300" data-testid="text-stat-in-progress">
                {(statistics?.in_progress ?? 0).toLocaleString("en-US")}
              </div>
            </CardContent>
          </Card>

          <Card
            className="rounded-2xl border-rose-200/55 bg-gradient-to-br from-rose-50/45 via-card to-card shadow-sm dark:border-rose-900/35 dark:from-rose-950/15"
            data-testid="card-stat-overdue"
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="rounded-lg bg-rose-100/80 p-1.5 dark:bg-rose-950/40">
                  <AlertCircle className="h-4 w-4 text-rose-700 dark:text-rose-300" />
                </span>
                متأخرة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold tabular-nums text-rose-700 dark:text-rose-300" data-testid="text-stat-overdue">
                {(statistics?.overdue ?? 0).toLocaleString("en-US")}
              </div>
            </CardContent>
          </Card>

          <Card
            className="rounded-2xl border-emerald-200/55 bg-gradient-to-br from-emerald-50/50 via-card to-card shadow-sm dark:border-emerald-900/35 dark:from-emerald-950/15"
            data-testid="card-stat-completed"
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="rounded-lg bg-emerald-100/80 p-1.5 dark:bg-emerald-950/40">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                </span>
                مكتملة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300" data-testid="text-stat-completed">
                {(statistics?.completed ?? 0).toLocaleString("en-US")}
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
        <Card
          className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card shadow-sm dark:border-sky-900/35 dark:from-sky-950/15"
          data-testid="card-filters"
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Filter className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              تصفية المهام
            </CardTitle>
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
          <Card className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card shadow-sm dark:border-sky-900/35 dark:from-sky-950/15">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">جدول المهام</CardTitle>
                <CardDescription className="tabular-nums">
                  عرض ({(tasksData?.tasks?.length ?? 0).toLocaleString("en-US")}) من ({(tasksData?.total ?? 0).toLocaleString("en-US")}) مهمة
                </CardDescription>
              </div>

              {currentVisibleTasks.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleSelectAllVisible}
                    className="text-xs gap-1.5"
                  >
                    <Checkbox
                      checked={isAllVisibleSelected}
                      onCheckedChange={toggleSelectAllVisible}
                      className="pointer-events-none"
                    />
                    <span>{isAllVisibleSelected ? "إلغاء تحديد المعروض" : "تحديد المعروض بالكامل"}</span>
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  جاري التحميل...
                </div>
              ) : !tasksData?.tasks || tasksData.tasks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ListTodo className="h-12 w-12 mx-auto mb-3 opacity-50 text-sky-500" />
                  <p className="font-medium text-base">لا توجد مهام مطابقة</p>
                  <p className="text-sm text-muted-foreground mt-1">اكتب المهمة في شريط "إضافة مهمة" للبدء</p>
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
                        isSelected={selectedTaskIds.includes(task.id)}
                        onToggleSelect={toggleSelectTask}
                        onView={setViewTaskId}
                        onEdit={setEditTaskId}
                        onDelete={(id) => { setDeleteId(id); }}
                        onComplete={(id, completed) => {
                          completeMutation.mutate({ taskId: id, completed });
                        }}
                      />
                    ))}
                  </div>

                  {/* Desktop View - Table */}
                  <div className="hidden md:block overflow-x-auto -mx-4 sm:mx-0">
                    <div className="inline-block min-w-full align-middle">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right w-12">
                              <Checkbox
                                checked={isAllVisibleSelected}
                                onCheckedChange={toggleSelectAllVisible}
                                aria-label="تحديد كل المهام المعروضة"
                                data-testid="checkbox-select-all"
                              />
                            </TableHead>
                            <TableHead className="text-right font-semibold">العنوان والوصف</TableHead>
                            <TableHead className="text-right font-semibold">الحالة</TableHead>
                            <TableHead className="text-right font-semibold">الأولوية</TableHead>
                            <TableHead className="text-right font-semibold">المسؤول</TableHead>
                            <TableHead className="text-right font-semibold">تاريخ الاستحقاق</TableHead>
                            <TableHead className="text-right font-semibold">الإجراءات</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tasksData.tasks.map((task) => {
                            const dueDateValue = task.dueDate ? new Date(task.dueDate) : null;
                            const taskIsOverdue = !!(dueDateValue && dueDateValue < new Date() && task.status !== 'completed');
                            const isExpanded = expandedTasks.has(task.id);
                            const CategoryIcon = getCategoryIcon(task.department, task.category);
                            const isSelected = selectedTaskIds.includes(task.id);
                            
                            return (
                              <TaskRowWithSubtasks
                                key={task.id}
                                task={task}
                                dueDateValue={dueDateValue}
                                taskIsOverdue={taskIsOverdue}
                                isExpanded={isExpanded}
                                isSelected={isSelected}
                                CategoryIcon={CategoryIcon}
                                users={users}
                                completeMutation={completeMutation}
                                toggleExpand={toggleExpand}
                                toggleSelect={toggleSelectTask}
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
                    <div className="flex items-center justify-between mt-6 pt-4 border-t">
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

        {/* Single Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle data-testid="dialog-title-delete">تأكيد حذف المهمة</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من رغبتك في حذف هذه المهمة نهائياً؟ لا يمكن التراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteMutation.isPending}
                data-testid="button-confirm-delete"
              >
                حذف المهمة
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Delete Confirmation Dialog */}
        <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle data-testid="dialog-title-bulk-delete">تأكيد الحذف الجماعي</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من رغبتك في حذف {selectedTaskIds.length.toLocaleString("en-US")} مهمة محددة؟ سيتم إزالتها كلياً من النظام ولن يمكن التراجع.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-bulk-delete">إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => bulkDeleteMutation.mutate(selectedTaskIds)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={bulkDeleteMutation.isPending}
                data-testid="button-confirm-bulk-delete"
              >
                حذف {selectedTaskIds.length.toLocaleString("en-US")} مهمة
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Complete All Open Confirmation Dialog */}
        <AlertDialog open={confirmCompleteAllOpen} onOpenChange={setConfirmCompleteAllOpen}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle data-testid="dialog-title-complete-all">تأكيد إتمام كل المهام المفتوحة</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من نقل كل المهام المفتوحة إلى حالة "مكتملة"؟
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-complete-all">إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => bulkCompleteMutation.mutate({ allOpen: true })}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={bulkCompleteMutation.isPending}
                data-testid="button-confirm-complete-all"
              >
                إتمام الكل الآن
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DashboardPageShell>
    </DashboardLayout>
  );
}
