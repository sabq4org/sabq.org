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
  Plus,
  RefreshCw,
  Filter,
  X,
  Calendar,
  UserCheck,
  Layers,
  Flame,
  LucideIcon,
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
  { value: "all", label: "الكل" },
  { value: "todo", label: "قيد الانتظار" },
  { value: "in_progress", label: "قيد العمل" },
  { value: "review", label: "مراجعة" },
  { value: "completed", label: "مكتملة" },
] as const;

const priorityOptions = [
  { value: "all", label: "الكل" },
  { value: "critical", label: "عاجلة" },
  { value: "high", label: "عالية" },
  { value: "medium", label: "متوسطة" },
  { value: "low", label: "منخفضة" },
] as const;

const departmentQuickOptions = [
  { value: "all", label: "كل الأقسام" },
  { value: "تحرير", label: "التحرير" },
  { value: "تقنية", label: "التقنية" },
  { value: "سوشيال", label: "التواصل الاجتماعي" },
  { value: "فيديو", label: "الفيديو والملتميديا" },
  { value: "تصميم", label: "التصميم" },
] as const;

const statusLabels: Record<string, string> = {
  todo: "قيد الانتظار",
  in_progress: "قيد العمل",
  review: "مراجعة",
  completed: "مكتملة",
  archived: "مؤرشفة",
};

const priorityLabels: Record<string, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  critical: "عاجلة",
};

function formatTaskDate(date: Date) {
  return date.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "completed":
      return "border border-emerald-200/80 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:border-emerald-800/60 dark:bg-emerald-500/15 dark:text-emerald-300";
    case "in_progress":
      return "border border-sky-200/80 bg-sky-500/10 text-sky-700 hover:bg-sky-500/15 dark:border-sky-800/60 dark:bg-sky-500/15 dark:text-sky-300";
    case "review":
      return "border border-violet-200/80 bg-violet-500/10 text-violet-700 hover:bg-violet-500/15 dark:border-violet-800/60 dark:bg-violet-500/15 dark:text-violet-300";
    case "todo":
      return "border border-amber-200/80 bg-amber-500/10 text-amber-800 hover:bg-amber-500/15 dark:border-amber-800/60 dark:bg-amber-500/15 dark:text-amber-300";
    case "archived":
      return "border-border bg-muted/60 text-muted-foreground hover:bg-muted/60";
    default:
      return "border-border bg-muted text-muted-foreground hover:bg-muted";
  }
}

function getPriorityBadgeClass(priority: string): string {
  switch (priority) {
    case "critical":
      return "border border-rose-200/80 bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:border-rose-800/60 dark:bg-rose-500/15 dark:text-rose-300";
    case "high":
      return "border border-orange-200/80 bg-orange-500/10 text-orange-700 hover:bg-orange-500/15 dark:border-orange-800/60 dark:bg-orange-500/15 dark:text-orange-300";
    case "medium":
      return "border border-sky-200/80 bg-sky-500/10 text-sky-700 hover:bg-sky-500/15 dark:border-sky-800/60 dark:bg-sky-500/15 dark:text-sky-300";
    case "low":
      return "border border-slate-200/80 bg-slate-500/10 text-slate-700 hover:bg-slate-500/15 dark:border-slate-700/60 dark:bg-slate-500/15 dark:text-slate-300";
    default:
      return "border-border bg-muted text-muted-foreground hover:bg-muted";
  }
}

function getPriorityAccentBorder(priority: string, status: string): string {
  if (status === "completed") {
    return "border-r-4 border-r-emerald-500/70";
  }
  if (status === "archived") {
    return "border-r-4 border-r-muted-foreground/40";
  }
  switch (priority) {
    case "critical":
      return "border-r-4 border-r-rose-500";
    case "high":
      return "border-r-4 border-r-orange-500";
    case "medium":
      return "border-r-4 border-r-sky-500";
    case "low":
      return "border-r-4 border-r-slate-400";
    default:
      return "border-r-4 border-r-border";
  }
}

/** تلوين الصف حسب الأولوية للمهام المفتوحة فقط — المكتملة محايدة */
function getTaskRowBackground(priority: string, status: string): string {
  if (status === "completed" || status === "archived") {
    return "bg-muted/20 dark:bg-card/60 border-border";
  }
  switch (priority) {
    case "critical":
      return "bg-rose-50/60 dark:bg-rose-950/10 border-rose-200/70 dark:border-rose-900/40";
    case "high":
      return "bg-orange-50/50 dark:bg-orange-950/10 border-orange-200/70 dark:border-orange-900/40";
    case "medium":
      return "bg-sky-50/40 dark:bg-sky-950/10 border-sky-200/60 dark:border-sky-900/30";
    case "low":
      return "bg-card border-border";
    default:
      return "bg-card border-border";
  }
}

function getCategoryIcon(department: string | null, category: string | null): LucideIcon {
  const dept = (department || "").toLowerCase();
  const cat = (category || "").toLowerCase();

  if (dept.includes("تحرير") || cat.includes("editorial") || cat.includes("تحرير")) {
    return Newspaper;
  }
  if (dept.includes("تقنية") || dept.includes("تطوير") || cat.includes("technical") || cat.includes("تقنية")) {
    return Wrench;
  }
  if (dept.includes("سوشيال") || dept.includes("اجتماعي") || cat.includes("social") || cat.includes("سوشيال")) {
    return Users;
  }
  if (dept.includes("فيديو") || cat.includes("video") || cat.includes("فيديو")) {
    return Video;
  }
  if (cat.includes("design") || cat.includes("تصميم")) {
    return Palette;
  }
  if (cat.includes("improvement") || cat.includes("تحسين")) {
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

function SubtaskRow({ parentTask, users, onDelete, onView, onEdit, onComplete }: SubtaskRowProps) {
  const { data: subtasksRaw } = useQuery<Task[]>({
    queryKey: ["/api/tasks", "subtasks", parentTask.id],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/tasks?parentTaskId=${parentTask.id}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch subtasks");
      const data = await res.json();
      return Array.isArray(data?.tasks) ? data.tasks : [];
    },
  });

  const subtasks = Array.isArray(subtasksRaw) ? subtasksRaw : [];

  const getUserName = (userId: string | null) => {
    if (!userId) return "غير مسند";
    const user = users.find((u) => u.id === userId);
    if (!user) return "غير معروف";
    return `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;
  };

  if (subtasks.length === 0) {
    return null;
  }

  return (
    <>
      {subtasks.map((subtask) => {
        const dueDateValue = subtask.dueDate ? new Date(subtask.dueDate) : null;
        const taskIsOverdue = !!(dueDateValue && dueDateValue < new Date() && subtask.status !== "completed");

        return (
          <TableRow
            key={subtask.id}
            data-testid={`row-subtask-${subtask.id}`}
            className="bg-muted/30 hover:bg-muted/50 border-r-4 border-r-primary/30"
          >
            <TableCell className="align-middle">
              <Checkbox
                checked={subtask.status === "completed"}
                onCheckedChange={(checked) => onComplete(subtask.id, checked as boolean)}
                data-testid={`checkbox-complete-${subtask.id}`}
              />
            </TableCell>
            <TableCell className="font-medium pr-10" data-testid={`text-title-${subtask.id}`}>
              <div className="flex items-center gap-2.5">
                <div className="h-px w-5 bg-border shrink-0" />
                <div className="min-w-0">
                  <div
                    className={cn(
                      "text-sm font-medium",
                      subtask.status === "completed" && "line-through text-muted-foreground",
                    )}
                  >
                    {subtask.title}
                  </div>
                  {subtask.description && (
                    <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {subtask.description}
                    </div>
                  )}
                </div>
              </div>
            </TableCell>
            <TableCell data-testid={`badge-status-${subtask.id}`}>
              <Badge className={cn("text-xs font-medium", getStatusBadgeClass(subtask.status))}>
                {statusLabels[subtask.status] || subtask.status}
              </Badge>
            </TableCell>
            <TableCell data-testid={`badge-priority-${subtask.id}`}>
              <Badge className={cn("text-xs font-medium", getPriorityBadgeClass(subtask.priority))}>
                {priorityLabels[subtask.priority] || subtask.priority}
              </Badge>
            </TableCell>
            <TableCell data-testid={`text-assignee-${subtask.id}`}>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <UserCheck className="h-3.5 w-3.5 shrink-0" />
                {getUserName(subtask.assignedToId)}
              </span>
            </TableCell>
            <TableCell data-testid={`text-due-date-${subtask.id}`}>
              {dueDateValue ? (
                <div className="flex items-center gap-1.5 text-xs">
                  <Calendar className={cn("h-3.5 w-3.5 shrink-0", taskIsOverdue ? "text-rose-600" : "text-muted-foreground")} />
                  <span className={cn("tabular-nums", taskIsOverdue && "font-semibold text-rose-600 dark:text-rose-400")}>
                    {formatTaskDate(dueDateValue)}
                  </span>
                  {taskIsOverdue && (
                    <AlertCircle className="h-3.5 w-3.5 text-rose-600" data-testid={`icon-overdue-${subtask.id}`} />
                  )}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">غير محدد</span>
              )}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="no-min-touch-size h-8 w-8"
                  onClick={() => onView(subtask.id)}
                  title="عرض التفاصيل"
                  data-testid={`button-view-${subtask.id}`}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="no-min-touch-size h-8 w-8"
                  onClick={() => onEdit(subtask.id)}
                  title="تعديل المهمة"
                  data-testid={`button-edit-${subtask.id}`}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="حذف المهمة"
                  className="no-min-touch-size h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
    if (!userId) return "غير مسند";
    const user = users.find((u) => u.id === userId);
    if (!user) return "غير معروف";
    return `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;
  };

  const hasSubtasks = subtasksCount > 0;
  const accentBorder = getPriorityAccentBorder(task.priority, task.status);

  return (
    <>
      <TableRow
        key={task.id}
        data-testid={`row-task-${task.id}`}
        className={cn(
          "group transition-colors",
          getTaskRowBackground(task.priority, task.status),
          accentBorder,
        )}
      >
        <TableCell className="align-middle">
          <Checkbox
            checked={task.status === "completed"}
            onCheckedChange={(checked) =>
              completeMutation.mutate({
                taskId: task.id,
                completed: checked as boolean,
              })
            }
            disabled={completeMutation.isPending}
            data-testid={`checkbox-complete-${task.id}`}
          />
        </TableCell>
        <TableCell data-testid={`text-title-${task.id}`}>
          <div className="flex items-start gap-2.5">
            {hasSubtasks && (
              <button
                type="button"
                onClick={() => toggleExpand(task.id)}
                className="no-min-touch-size mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground"
                data-testid={`button-expand-task-${task.id}`}
              >
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform", !isExpanded && "-rotate-90")}
                />
              </button>
            )}
            <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CategoryIcon className="h-4 w-4" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setViewTaskId(task.id)}
                  className={cn(
                    "no-min-touch-size text-right text-sm sm:text-base font-semibold hover:text-primary transition-colors",
                    task.status === "completed" && "line-through text-muted-foreground",
                  )}
                >
                  {task.title}
                </button>
                {hasSubtasks && (
                  <Badge variant="outline" className="text-xs gap-1 tabular-nums">
                    <Layers className="h-3 w-3" />
                    {subtasksCount}
                  </Badge>
                )}
                {task.department && (
                  <Badge variant="secondary" className="text-[11px] font-normal px-2 py-0.5">
                    {task.department}
                  </Badge>
                )}
              </div>
              {task.description && (
                <div className="text-xs sm:text-sm text-muted-foreground line-clamp-1 mt-1">
                  {task.description}
                </div>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell data-testid={`badge-status-${task.id}`}>
          <Badge className={cn("text-xs font-medium", getStatusBadgeClass(task.status))}>
            {statusLabels[task.status] || task.status}
          </Badge>
        </TableCell>
        <TableCell data-testid={`badge-priority-${task.id}`}>
          <Badge className={cn("text-xs font-medium", getPriorityBadgeClass(task.priority))}>
            {priorityLabels[task.priority] || task.priority}
          </Badge>
        </TableCell>
        <TableCell data-testid={`text-assignee-${task.id}`}>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1 text-xs font-medium text-foreground">
            <UserCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate max-w-[130px]">{getUserName(task.assignedToId)}</span>
          </span>
        </TableCell>
        <TableCell data-testid={`text-due-date-${task.id}`}>
          {dueDateValue ? (
            <div className="flex items-center gap-1.5 text-xs sm:text-sm">
              <Calendar
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  taskIsOverdue ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
                )}
              />
              <span
                className={cn(
                  "tabular-nums",
                  taskIsOverdue && "font-semibold text-rose-600 dark:text-rose-400",
                )}
              >
                {formatTaskDate(dueDateValue)}
              </span>
              {taskIsOverdue && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                  <AlertCircle className="h-3.5 w-3.5 text-rose-600" data-testid={`icon-overdue-${task.id}`} />
                  متأخرة
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">غير محدد</span>
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="no-min-touch-size h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setViewTaskId(task.id)}
              title="عرض التفاصيل"
              data-testid={`button-view-${task.id}`}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="no-min-touch-size h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setEditTaskId(task.id)}
              title="تعديل المهمة"
              data-testid={`button-edit-${task.id}`}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "no-min-touch-size h-8 w-8",
                task.status === "completed"
                  ? "text-emerald-600 hover:text-emerald-700"
                  : "text-muted-foreground hover:text-emerald-600",
              )}
              onClick={() =>
                completeMutation.mutate({
                  taskId: task.id,
                  completed: task.status !== "completed",
                })
              }
              disabled={completeMutation.isPending}
              title={task.status === "completed" ? "إعادة فتح المهمة" : "تعليم كمكتملة"}
              data-testid={`button-complete-${task.id}`}
            >
              <CheckCircle2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="إضافة مهمة فرعية"
              className="no-min-touch-size h-8 w-8 text-muted-foreground hover:text-primary"
              onClick={() => handleCreateSubtask(task.id)}
              data-testid={`button-subtask-${task.id}`}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="حذف المهمة"
              className="no-min-touch-size h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
  const accentBorder = getPriorityAccentBorder(task.priority, task.status);
  const dueDateValue = task.dueDate ? new Date(task.dueDate) : null;
  const taskIsOverdue = !!(dueDateValue && dueDateValue < new Date() && task.status !== "completed");

  const getUserName = (userId: string | null) => {
    if (!userId) return "غير مسند";
    const user = users.find((u) => u.id === userId);
    if (!user) return "غير معروف";
    return `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;
  };

  return (
    <Card
      className={cn(
        "border rounded-xl p-4 transition-shadow hover:shadow-sm",
        bgClass,
        accentBorder,
      )}
      data-testid={`card-mobile-task-${task.id}`}
    >
      {/* Header: Icon + Title + Priority Badge */}
      <div className="flex items-start gap-3 mb-2.5">
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0">
          <h3
            className={cn(
              "font-semibold text-sm sm:text-base line-clamp-2 leading-snug",
              task.status === "completed" && "line-through text-muted-foreground",
            )}
            data-testid={`text-title-mobile-${task.id}`}
          >
            {task.title}
          </h3>
          {task.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
              {task.description}
            </p>
          )}
        </div>
        <Badge
          className={cn("flex-shrink-0 text-xs", getPriorityBadgeClass(task.priority))}
          data-testid={`badge-priority-mobile-${task.id}`}
        >
          {priorityLabels[task.priority] || task.priority}
        </Badge>
      </div>

      {/* Meta Info: Status + Due Date + Assignee + Subtasks Count */}
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <Badge className={cn("text-xs", getStatusBadgeClass(task.status))} data-testid={`badge-status-mobile-${task.id}`}>
          {statusLabels[task.status] || task.status}
        </Badge>
        {task.department && (
          <Badge variant="secondary" className="text-xs font-normal">
            {task.department}
          </Badge>
        )}
        {task.subtasksCount && task.subtasksCount > 0 ? (
          <Badge variant="outline" className="text-xs tabular-nums" data-testid={`badge-subtasks-mobile-${task.id}`}>
            {task.subtasksCount} مهام فرعية
          </Badge>
        ) : null}
        {dueDateValue && (
          <span
            className={cn(
              "inline-flex items-center gap-1 tabular-nums",
              taskIsOverdue ? "font-semibold text-rose-600 dark:text-rose-400" : "text-muted-foreground",
            )}
            data-testid={`text-due-date-mobile-${task.id}`}
          >
            <Calendar className="h-3.5 w-3.5" />
            {formatTaskDate(dueDateValue)}
            {taskIsOverdue && <span className="text-[11px]">(متأخرة)</span>}
          </span>
        )}
        {task.assignedToId && (
          <span
            className="inline-flex items-center gap-1 text-muted-foreground"
            data-testid={`text-assignee-mobile-${task.id}`}
          >
            <UserCheck className="h-3.5 w-3.5" />
            {getUserName(task.assignedToId)}
          </span>
        )}
      </div>

      {/* Action Buttons - ALWAYS VISIBLE */}
      <div className="flex items-center gap-1.5 pt-2.5 border-t border-border/60">
        <Button
          size="sm"
          variant="ghost"
          className="no-min-touch-size h-8 px-2.5 text-xs gap-1"
          onClick={() => onView(task.id)}
          data-testid={`button-view-mobile-${task.id}`}
        >
          <Eye className="h-3.5 w-3.5" />
          <span>عرض</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="no-min-touch-size h-8 px-2.5 text-xs gap-1"
          onClick={() => onEdit(task.id)}
          data-testid={`button-edit-mobile-${task.id}`}
        >
          <Edit className="h-3.5 w-3.5" />
          <span>تعديل</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            "no-min-touch-size h-8 px-2.5 text-xs gap-1",
            task.status === "completed" && "text-emerald-600",
          )}
          onClick={() => onComplete(task.id, task.status !== "completed")}
          data-testid={`button-complete-mobile-${task.id}`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>{task.status === "completed" ? "مكتملة" : "إكمال"}</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          title="حذف المهمة"
          className="no-min-touch-size h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onDelete(task.id)}
          data-testid={`button-delete-mobile-${task.id}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only sm:ms-1 text-xs">حذف</span>
        </Button>
        <div className="flex-1" />
        <Checkbox
          checked={task.status === "completed"}
          onCheckedChange={(checked) => onComplete(task.id, checked as boolean)}
          data-testid={`checkbox-complete-mobile-${task.id}`}
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
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [creatingSubtaskFor, setCreatingSubtaskFor] = useState<string | null>(null);

  const limit = 20;

  // Fetch tasks statistics
  const { data: statistics } = useQuery<TaskStatistics>({
    queryKey: ["/api/tasks/statistics"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/tasks/statistics"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch statistics");
      return await res.json();
    },
  });

  // Fetch parent tasks only (tasks without a parent)
  const { data: tasksData, isLoading, isError, refetch, isFetching } = useQuery<{
    tasks: Task[];
    total: number;
    totalPages: number;
  }>({
    queryKey: ["/api/tasks", "parent", page, searchQuery, statusFilter, priorityFilter, assigneeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        parentTaskId: "null", // Fetch only parent tasks
      });
      if (searchQuery) params.append("search", searchQuery);
      if (statusFilter && statusFilter !== "all") params.append("status", statusFilter);
      if (priorityFilter && priorityFilter !== "all") params.append("priority", priorityFilter);
      if (assigneeFilter && assigneeFilter !== "all") params.append("assignedToId", assigneeFilter);

      const res = await fetch(apiUrl(`/api/tasks?${params}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return await res.json();
    },
  });

  // Fetch users for assignee select
  const { data: usersRaw } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/users"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return await res.json();
    },
    // /api/users requires admin.manage_settings; only fetch for users who can,
    // so non-admins don't generate (retry-amplified) 403s on page load.
    enabled: hasPermission(user, "admin.manage_settings"),
    retry: false,
  });
  const users = Array.isArray(usersRaw) ? usersRaw : [];

  const rawTasks = Array.isArray(tasksData?.tasks) ? tasksData.tasks : [];
  const displayedTasks =
    departmentFilter === "all"
      ? rawTasks
      : rawTasks.filter((t) => {
          const dept = (t.department || "").toLowerCase();
          const cat = (t.category || "").toLowerCase();
          const needle = departmentFilter.toLowerCase();
          return dept.includes(needle) || cat.includes(needle);
        });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<InsertTask>) => {
      return await apiRequest("/api/tasks", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/statistics"] });

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
      await apiRequest(`/api/tasks/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/statistics"] });
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
        method: "PATCH",
        body: JSON.stringify({
          status: completed ? "completed" : "todo",
          completedAt: completed ? new Date().toISOString() : null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/statistics"] });
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

  const totalCount = statistics?.total ?? 0;
  const inProgressCount = statistics?.in_progress ?? 0;
  const overdueCount = statistics?.overdue ?? 0;
  const completedCount = statistics?.completed ?? 0;
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const incompleteOnPage = rawTasks.filter(
    (t) => t.status !== "completed" && t.status !== "archived",
  ).length;
  const openTasksEstimate =
    statusFilter === "completed" || statusFilter === "archived"
      ? 0
      : statusFilter !== "all"
        ? (tasksData?.total ?? incompleteOnPage)
        : Math.max(0, totalCount - completedCount);
  const canCompleteAll =
    openTasksEstimate > 0 &&
    statusFilter !== "completed" &&
    statusFilter !== "archived";
  const deleteAllEstimate = tasksData?.total ?? 0;
  const canDeleteAll = deleteAllEstimate > 0;

  const hasActiveFilters =
    statusFilter !== "all" ||
    priorityFilter !== "all" ||
    assigneeFilter !== "all" ||
    departmentFilter !== "all" ||
    searchQuery.trim().length > 0;

  const resetAllFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setAssigneeFilter("all");
    setDepartmentFilter("all");
    setPage(1);
  };

  const toggleExpand = (taskId: string) => {
    setExpandedTasks((prev) => {
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
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 100);
  };

  const focusQuickAdd = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(
        'input[placeholder*="عنوان"], input[data-testid*="quick"], input[data-testid*="title"]',
      );
      el?.focus();
    }, 150);
  };

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-[1600px]">
        <DashboardPageHeader
          icon={ListTodo}
          title="مركز المهام التحريرية والتشغيلية"
          description="إدارة ومتابعة مهام غرف الأخبار والفرق المساندة — الأولوية للمتأخرة والعاجلة"
          titleTestId="heading-tasks"
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="no-min-touch-size h-9 gap-1.5"
                onClick={() => refetch()}
                disabled={isFetching}
                data-testid="button-refresh-tasks"
              >
                <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
                تحديث
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="no-min-touch-size h-9 gap-1.5"
                onClick={focusQuickAdd}
                data-testid="button-focus-quick-task"
              >
                <Plus className="h-4 w-4" />
                مهمة سريعة جديدة
              </Button>
            </>
          }
        />

        {/* 4-Card Interactive Editorial KPI Strip */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setPriorityFilter("all");
              setPage(1);
            }}
            className={cn(
              "no-min-touch-size group relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.06] via-card to-card p-4 text-right transition-all hover:border-primary/40 hover:shadow-sm",
              statusFilter === "all" && priorityFilter === "all" && "ring-2 ring-primary/30 border-primary/40",
            )}
            data-testid="card-stat-total"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">إجمالي المهام</p>
                <div
                  className="mt-1.5 text-2xl font-bold tracking-tight text-foreground tabular-nums sm:text-3xl"
                  data-testid="text-stat-total"
                >
                  {totalCount.toLocaleString("en-US")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  جميع المهام المسجلة في النظام
                </p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ListTodo className="h-5 w-5" />
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter((prev) => (prev === "in_progress" ? "all" : "in_progress"));
              setPage(1);
            }}
            className={cn(
              "no-min-touch-size group relative overflow-hidden rounded-2xl border bg-gradient-to-br from-sky-500/[0.08] via-card to-card p-4 text-right transition-all hover:border-sky-500/40 hover:shadow-sm",
              statusFilter === "in_progress" && "ring-2 ring-sky-500/30 border-sky-500/50",
            )}
            data-testid="card-stat-in-progress"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">قيد العمل</p>
                <div
                  className="mt-1.5 text-2xl font-bold tracking-tight text-sky-700 dark:text-sky-300 tabular-nums sm:text-3xl"
                  data-testid="text-stat-in-progress"
                >
                  {inProgressCount.toLocaleString("en-US")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  مهام نشطة قيد التنفيذ حالياً
                </p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-700 dark:text-sky-300">
                <Clock className="h-5 w-5" />
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setPriorityFilter((prev) => (prev === "critical" ? "all" : "critical"));
              setPage(1);
            }}
            className={cn(
              "no-min-touch-size group relative overflow-hidden rounded-2xl border bg-gradient-to-br from-rose-500/[0.08] via-card to-card p-4 text-right transition-all hover:border-rose-500/40 hover:shadow-sm",
              priorityFilter === "critical" && "ring-2 ring-rose-500/30 border-rose-500/50",
            )}
            data-testid="card-stat-overdue"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">المتأخرة والعاجلة</p>
                <div
                  className="mt-1.5 text-2xl font-bold tracking-tight text-rose-700 dark:text-rose-300 tabular-nums sm:text-3xl"
                  data-testid="text-stat-overdue"
                >
                  {overdueCount.toLocaleString("en-US")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  تحتاج تدخلاً سريعاً ومتابعة فورية
                </p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-700 dark:text-rose-300">
                <Flame className="h-5 w-5" />
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter((prev) => (prev === "completed" ? "all" : "completed"));
              setPage(1);
            }}
            className={cn(
              "no-min-touch-size group relative overflow-hidden rounded-2xl border bg-gradient-to-br from-emerald-500/[0.08] via-card to-card p-4 text-right transition-all hover:border-emerald-500/40 hover:shadow-sm",
              statusFilter === "completed" && "ring-2 ring-emerald-500/30 border-emerald-500/50",
            )}
            data-testid="card-stat-completed"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-muted-foreground">المكتملة</p>
                  <Badge
                    variant="secondary"
                    className="border-0 bg-emerald-500/15 px-1.5 py-0 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums"
                  >
                    {completionRate}%
                  </Badge>
                </div>
                <div
                  className="mt-1.5 text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300 tabular-nums sm:text-3xl"
                  data-testid="text-stat-completed"
                >
                  {completedCount.toLocaleString("en-US")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  معدل الإنجاز {completionRate}% من الإجمالي
                </p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-5 w-5" />
              </span>
            </div>
          </button>
        </div>

        <AddTaskQuickPane
          onSubmit={createMutation.mutateAsync}
          isPending={createMutation.isPending}
          creatingSubtaskFor={creatingSubtaskFor}
          onCancel={() => setCreatingSubtaskFor(null)}
        />

        {/* Editorial Filters & Quick Filter Pills */}
        <div
          className="space-y-3 rounded-2xl border bg-card p-4 shadow-none"
          data-testid="card-filters"
        >
          {/* Row 1: Search + Selects */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="ابحث في عناوين المهام أو التفاصيل..."
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
              <SelectTrigger className="h-9 w-full sm:w-[10rem]" data-testid="select-status-filter">
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
              <SelectTrigger className="h-9 w-full sm:w-[10rem]" data-testid="select-priority-filter">
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
              <SelectTrigger className="h-9 w-full sm:w-[11rem]" data-testid="select-assignee-filter">
                <SelectValue placeholder="المسؤول" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المسؤولين</SelectItem>
                <SelectItem value="unassigned">غير مسند</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {`${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetAllFilters}
                className="no-min-touch-size h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                data-testid="button-reset-filters"
              >
                <X className="h-3.5 w-3.5" />
                مسح الفلاتر
              </Button>
            )}
          </div>

          {/* Row 2: Quick Status & Priority Filter Pills */}
          <div className="flex flex-col gap-2.5 border-t border-border/60 pt-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                الحالة:
              </span>
              {statusOptions.map((opt) => {
                const active = statusFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setStatusFilter(opt.value);
                      setPage(1);
                    }}
                    data-testid={`pill-status-${opt.value}`}
                    className={cn(
                      "no-min-touch-size inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                الأولوية:
              </span>
              {priorityOptions.map((opt) => {
                const active = priorityFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setPriorityFilter(opt.value);
                      setPage(1);
                    }}
                    data-testid={`pill-priority-${opt.value}`}
                    className={cn(
                      "no-min-touch-size inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 3: Quick Department Pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2.5">
            <span className="ml-1 text-xs font-medium text-muted-foreground">القسم:</span>
            {departmentQuickOptions.map((dept) => {
              const active = departmentFilter === dept.value;
              return (
                <button
                  key={dept.value}
                  type="button"
                  onClick={() => setDepartmentFilter(dept.value)}
                  data-testid={`pill-department-${dept.value}`}
                  className={cn(
                    "no-min-touch-size inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium transition-colors",
                    active
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {dept.label}
                </button>
              );
            })}
          </div>
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

        {/* Tasks Table & Mobile List */}
        {!isError && (
          <Card className="rounded-2xl border bg-card shadow-sm">
            <CardHeader className="flex flex-col gap-3 space-y-0 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base sm:text-lg font-bold">قائمة المهام التنفيذية</CardTitle>
                <CardDescription className="mt-0.5 tabular-nums">
                  عرض {displayedTasks.length.toLocaleString("en-US")} من أصل{" "}
                  {(tasksData?.total ?? 0).toLocaleString("en-US")} مهمة — مرتّبة بالمتأخر والأعلى أولوية أولاً
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="no-min-touch-size h-8 gap-1.5 text-xs"
                  disabled={!canCompleteAll || completeAllMutation.isPending}
                  onClick={() => setCompleteAllOpen(true)}
                  data-testid="button-complete-all"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  إتمام الكل
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="no-min-touch-size h-8 gap-1.5 text-xs"
                  disabled={!canDeleteAll || deleteAllMutation.isPending}
                  onClick={() => setDeleteAllOpen(true)}
                  data-testid="button-delete-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  حذف الكل
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <RefreshCw className="h-8 w-8 mx-auto mb-3 animate-spin opacity-50" />
                  جاري تحميل المهام...
                </div>
              ) : displayedTasks.length === 0 ? (
                <div className="text-center py-14 text-muted-foreground">
                  <ListTodo className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p className="font-semibold text-foreground">لا توجد مهام مطابقة</p>
                  <p className="text-sm mt-1">
                    {hasActiveFilters
                      ? "جرّب تعديل الفلاتر أو مسحها لعرض جميع المهام"
                      : "أضف مهمتك الأولى عبر شريط الإضافة السريعة أعلاه"}
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile View - Cards */}
                  <div className="md:hidden space-y-3">
                    {displayedTasks.map((task) => (
                      <MobileTaskCard
                        key={task.id}
                        task={task}
                        users={users}
                        onView={setViewTaskId}
                        onEdit={setEditTaskId}
                        onDelete={(id) => {
                          setDeleteId(id);
                        }}
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
                          <TableRow className="bg-muted/40">
                            <TableHead className="text-right w-12">إكمال</TableHead>
                            <TableHead className="text-right">المهمة والقسم</TableHead>
                            <TableHead className="text-right">الحالة</TableHead>
                            <TableHead className="text-right">الأولوية</TableHead>
                            <TableHead className="text-right">المسؤول</TableHead>
                            <TableHead className="text-right">تاريخ الاستحقاق</TableHead>
                            <TableHead className="text-right">الإجراءات</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {displayedTasks.map((task) => {
                            const dueDateValue = task.dueDate ? new Date(task.dueDate) : null;
                            const taskIsOverdue = !!(
                              dueDateValue &&
                              isPast(dueDateValue) &&
                              task.status !== "completed"
                            );
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
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/60">
                      <div className="text-sm text-muted-foreground tabular-nums">
                        صفحة {page.toLocaleString("en-US")} من{" "}
                        {tasksData.totalPages.toLocaleString("en-US")}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="no-min-touch-size h-8"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1}
                          data-testid="button-previous-page"
                        >
                          <ChevronRight className="h-4 w-4 ml-1.5" />
                          السابق
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="no-min-touch-size h-8"
                          onClick={() => setPage((p) => Math.min(tasksData.totalPages, p + 1))}
                          disabled={page === tasksData.totalPages}
                          data-testid="button-next-page"
                        >
                          التالي
                          <ChevronLeft className="h-4 w-4 mr-1.5" />
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
