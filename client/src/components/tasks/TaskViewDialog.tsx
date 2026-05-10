import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import type { Task } from "@shared/schema";
import { Clock, User, Calendar, Tag, FileText, Folder, Share2, CheckCircle2, Edit, Trash2, Check, X, ChevronDown } from "lucide-react";

interface TaskViewDialogProps {
  taskId: string;
  onClose: () => void;
}

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export function TaskViewDialog({ taskId, onClose }: TaskViewDialogProps) {
  const { data: task, isLoading } = useQuery<Task>({
    queryKey: ['/api/tasks', taskId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch task');
      return await res.json();
    },
  });

  const { data: usersRaw } = useQuery<User[]>({
    queryKey: ['/api/users'],
    queryFn: async () => {
      const res = await fetch('/api/users', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch users');
      return await res.json();
    },
  });
  const users = Array.isArray(usersRaw) ? usersRaw : [];

  const getUserName = (userId: string | null) => {
    if (!userId) return 'غير مسند';
    const user = users.find(u => u.id === userId);
    if (!user) return 'غير معروف';
    return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl md:max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl" data-testid="dialog-task-view">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle data-testid="heading-dialog-title">تفاصيل المهمة</DialogTitle>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="h-8 w-8"
            data-testid="button-close-dialog"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        {task && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-2">
            <Button size="sm" variant="outline" className="flex-1 sm:flex-none" data-testid="button-edit-task">
              <Edit className="h-4 w-4 sm:ml-2" />
              <span className="hidden sm:inline">تعديل</span>
            </Button>
            <Button 
              size="sm" 
              variant={task.status === 'completed' ? 'default' : 'outline'}
              className="flex-1 sm:flex-none"
              data-testid="button-complete-task"
            >
              <CheckCircle2 className="h-4 w-4 sm:ml-2" />
              <span className="hidden sm:inline">إكمال</span>
            </Button>
            <Button size="sm" variant="destructive" className="flex-1 sm:flex-none" data-testid="button-delete-task">
              <Trash2 className="h-4 w-4 sm:ml-2" />
              <span className="hidden sm:inline">حذف</span>
            </Button>
            <Button size="sm" variant="ghost" className="flex-1 sm:flex-none" data-testid="button-share-task">
              <Share2 className="h-4 w-4 sm:ml-2" />
              <span className="hidden sm:inline">مشاركة</span>
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-8" data-testid="text-loading">جاري التحميل...</div>
        ) : task ? (
          <div className="space-y-2 sm:space-y-4">
            <div>
              <h3 className="font-bold text-base sm:text-lg mb-2" data-testid="text-task-title">{task.title}</h3>
              {task.description && (
                <p className="text-muted-foreground whitespace-pre-wrap text-sm sm:text-base" data-testid="text-task-description">
                  {task.description}
                </p>
              )}
            </div>

            <Separator className="my-2 sm:my-4" />

            {/* Mobile - Collapsible */}
            <div className="md:hidden space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">الحالة:</span>
                {getStatusBadge(task.status)}
              </div>

              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">الأولوية:</span>
                {getPriorityBadge(task.priority)}
              </div>

              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 font-medium text-sm py-2">
                  <ChevronDown className="h-4 w-4" />
                  معلومات إضافية
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  {task.id && (
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">رقم المهمة:</span>
                      <span className="text-sm text-muted-foreground" data-testid="text-task-id">
                        {task.id.substring(0, 8)}
                      </span>
                    </div>
                  )}

                  {task.dueDate && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">تاريخ الاستحقاق:</span>
                      <span className="text-sm" data-testid="text-task-due-date">
                        {format(new Date(task.dueDate), 'PPP', { locale: ar })}
                      </span>
                    </div>
                  )}

                  {task.assignedToId && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">المسؤول:</span>
                      <span className="text-sm" data-testid="text-task-assignee">{getUserName(task.assignedToId)}</span>
                    </div>
                  )}

                  {task.department && (
                    <div className="flex items-center gap-2">
                      <Folder className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">القسم:</span>
                      <Badge variant="outline" data-testid="text-task-department">
                        <Folder className="h-3 w-3 ml-1" />
                        {task.department}
                      </Badge>
                    </div>
                  )}

                  {task.category && (
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">الفئة:</span>
                      <Badge variant="outline" data-testid="text-task-category">
                        <FileText className="h-3 w-3 ml-1" />
                        {task.category}
                      </Badge>
                    </div>
                  )}

                  {task.createdAt && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">تاريخ الإنشاء:</span>
                      <span className="text-sm" data-testid="text-task-created-at">
                        {format(new Date(task.createdAt), 'PPP', { locale: ar })}
                      </span>
                    </div>
                  )}

                  {task.completedAt && (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">تاريخ الإكمال:</span>
                      <span className="text-sm" data-testid="text-task-completed-at">
                        {format(new Date(task.completedAt), 'PPP', { locale: ar })}
                      </span>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>

            {/* Desktop - Grid Layout */}
            <div className="hidden md:grid grid-cols-2 gap-2 sm:gap-4">
              {task.id && (
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">رقم المهمة:</span>
                  <span className="text-sm text-muted-foreground" data-testid="text-task-id">
                    {task.id.substring(0, 8)}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">الحالة:</span>
                {getStatusBadge(task.status)}
              </div>

              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">الأولوية:</span>
                {getPriorityBadge(task.priority)}
              </div>

              {task.dueDate && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">تاريخ الاستحقاق:</span>
                  <span className="text-sm" data-testid="text-task-due-date">
                    {format(new Date(task.dueDate), 'PPP', { locale: ar })}
                  </span>
                </div>
              )}

              {task.assignedToId && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">المسؤول:</span>
                  <span className="text-sm" data-testid="text-task-assignee">{getUserName(task.assignedToId)}</span>
                </div>
              )}

              {task.department && (
                <div className="flex items-center gap-2">
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">القسم:</span>
                  <Badge variant="outline" data-testid="text-task-department">
                    <Folder className="h-3 w-3 ml-1" />
                    {task.department}
                  </Badge>
                </div>
              )}

              {task.category && (
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">الفئة:</span>
                  <Badge variant="outline" data-testid="text-task-category">
                    <FileText className="h-3 w-3 ml-1" />
                    {task.category}
                  </Badge>
                </div>
              )}

              {task.createdAt && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">تاريخ الإنشاء:</span>
                  <span className="text-sm" data-testid="text-task-created-at">
                    {format(new Date(task.createdAt), 'PPP', { locale: ar })}
                  </span>
                </div>
              )}

              {task.completedAt && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">تاريخ الإكمال:</span>
                  <span className="text-sm" data-testid="text-task-completed-at">
                    {format(new Date(task.completedAt), 'PPP', { locale: ar })}
                  </span>
                </div>
              )}
            </div>

            {task.tags && task.tags.length > 0 && (
              <div>
                <span className="text-sm font-medium">الوسوم:</span>
                <div className="flex flex-wrap gap-2 sm:gap-2 mt-2" data-testid="container-task-tags">
                  {task.tags.map((tag, i) => (
                    <Badge key={i} variant="outline" data-testid={`badge-tag-${i}`}>
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-not-found">
            المهمة غير موجودة
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function getStatusBadge(status: string) {
  const badges: Record<string, JSX.Element> = {
    completed: (
      <Badge variant="default" data-testid="badge-task-status">
        <Check className="h-3 w-3 ml-1" />
        مكتملة
      </Badge>
    ),
    in_progress: (
      <Badge variant="secondary" data-testid="badge-task-status">
        ⏳ قيد العمل
      </Badge>
    ),
    review: (
      <Badge variant="outline" data-testid="badge-task-status">
        مراجعة
      </Badge>
    ),
    todo: (
      <Badge variant="outline" data-testid="badge-task-status">
        قيد الانتظار
      </Badge>
    ),
    archived: (
      <Badge variant="outline" data-testid="badge-task-status">
        مؤرشفة
      </Badge>
    ),
  };
  return badges[status] || <Badge data-testid="badge-task-status">{status}</Badge>;
}

function getPriorityBadge(priority: string) {
  const badges: Record<string, JSX.Element> = {
    critical: (
      <Badge variant="destructive" data-testid="text-task-priority">
        عاجلة
      </Badge>
    ),
    high: (
      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" data-testid="text-task-priority">
        عالية
      </Badge>
    ),
    medium: (
      <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" data-testid="text-task-priority">
        متوسطة
      </Badge>
    ),
    low: (
      <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" data-testid="text-task-priority">
        منخفضة
      </Badge>
    ),
  };
  return badges[priority] || <Badge data-testid="text-task-priority">{priority}</Badge>;
}
