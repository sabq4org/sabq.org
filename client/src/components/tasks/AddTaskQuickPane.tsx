import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import { Calendar, Flag, User, X, ArrowDown, Minus, ArrowUp, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { InsertTask } from "@shared/schema";

interface AddTaskQuickPaneProps {
  onSubmit: (data: Partial<InsertTask>) => Promise<void>;
  isPending?: boolean;
  creatingSubtaskFor?: string | null;
  onCancel?: () => void;
}

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

const quickTaskSchema = z.object({
  title: z.string().min(1, "العنوان مطلوب"),
  description: z.string().optional(),
  status: z.enum(["todo", "in_progress", "review", "completed", "archived"]).default("todo"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  dueDate: z.date().optional(),
  assignedToId: z.string().optional(),
  parentTaskId: z.string().optional(),
  department: z.string().optional(),
  category: z.string().optional(),
  tags: z.string().optional(),
});

type QuickTaskForm = z.infer<typeof quickTaskSchema>;

const priorityIcons = {
  low: ArrowDown,
  medium: Minus,
  high: ArrowUp,
  critical: AlertTriangle,
} as const;

const priorityColors = {
  low: "text-green-500",
  medium: "text-yellow-500",
  high: "text-orange-500",
  critical: "text-red-500",
} as const;

const priorityLabels = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  critical: "عاجلة",
} as const;

const priorityOptions = [
  { value: "low" as const, label: "منخفضة" },
  { value: "medium" as const, label: "متوسطة" },
  { value: "high" as const, label: "عالية" },
  { value: "critical" as const, label: "عاجلة" },
];

export default function AddTaskQuickPane({
  onSubmit,
  isPending = false,
  creatingSubtaskFor = null,
  onCancel,
}: AddTaskQuickPaneProps) {
  const [expanded, setExpanded] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPrioritySelect, setShowPrioritySelect] = useState(false);
  const [showAssigneeSelect, setShowAssigneeSelect] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<QuickTaskForm>({
    resolver: zodResolver(quickTaskSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "todo",
      priority: "medium",
      dueDate: undefined,
      assignedToId: undefined,
      parentTaskId: creatingSubtaskFor || undefined,
      department: "",
      category: "",
      tags: "",
    },
  });

  const { data: usersRaw } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return await res.json();
    },
  });
  const users = Array.isArray(usersRaw) ? usersRaw : [];

  useEffect(() => {
    if (expanded && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [expanded]);

  useEffect(() => {
    if (creatingSubtaskFor) {
      setExpanded(true);
      if (creatingSubtaskFor !== form.getValues('parentTaskId')) {
        form.setValue('parentTaskId', creatingSubtaskFor);
      }
    }
    
    // Clear parentTaskId when exiting subtask mode
    if (!creatingSubtaskFor && form.getValues('parentTaskId')) {
      form.setValue('parentTaskId', undefined);
    }
  }, [creatingSubtaskFor, form]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Use RHF's handleSubmit wrapper for proper validation
      handleFullSubmit();
    }
  };

  const handleQuickSubmit = async () => {
    const values = form.getValues();
    
    if (!values.title?.trim()) return;

    // Use form values, not hard-coded defaults
    const data: Partial<InsertTask> = {
      title: values.title.trim(),
      status: values.status || "todo",
      priority: values.priority || "medium",
      description: values.description?.trim() || undefined,
      dueDate: values.dueDate?.toISOString(),
      assignedToId: values.assignedToId || undefined,
      parentTaskId: creatingSubtaskFor || undefined,
    };

    try {
      await onSubmit(data);
      handleReset();
    } catch (error) {
      console.error("Failed to create task:", error);
    }
  };

  const handleFullSubmit = form.handleSubmit(async (data) => {
    const submitData: Partial<InsertTask> = {
      title: data.title.trim(),
      description: data.description?.trim() || undefined,
      status: data.status,
      priority: data.priority,
      dueDate: data.dueDate?.toISOString(),
      assignedToId: data.assignedToId || undefined,
      department: data.department || undefined,
      category: data.category || undefined,
      tags: data.tags ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : undefined,
      parentTaskId: creatingSubtaskFor || data.parentTaskId || undefined,
    };

    try {
      await onSubmit(submitData);
      
      if (!creatingSubtaskFor) {
        handleReset();
      } else {
        // Keep subtask mode, just reset form values
        form.reset({
          title: "",
          description: "",
          status: "todo",
          priority: "medium",
          dueDate: undefined,
          assignedToId: undefined,
          department: "",
          category: "",
          tags: "",
          parentTaskId: creatingSubtaskFor,
        });
        // Focus on title for next subtask
        setTimeout(() => {
          const titleInput = document.querySelector('[data-testid="input-task-title"]') as HTMLInputElement;
          titleInput?.focus();
        }, 100);
      }
    } catch (error) {
      console.error("Failed to create task:", error);
    }
  });

  const handleReset = () => {
    form.reset({
      title: "",
      description: "",
      status: "todo",
      priority: "medium",
      dueDate: undefined,
      assignedToId: undefined,
      parentTaskId: undefined,
      department: "",
      category: "",
      tags: "",
    });
    form.setValue("parentTaskId", undefined);
    setExpanded(false);
    setShowDatePicker(false);
    setShowPrioritySelect(false);
    setShowAssigneeSelect(false);
  };

  const handleCancel = () => {
    handleReset();
    if (onCancel) {
      onCancel();
    }
  };

  const handleDone = async () => {
    const values = form.getValues();
    
    // Submit ONLY if title exists
    if (values.title?.trim()) {
      await handleFullSubmit();
    }
    
    // ALWAYS cleanup and exit subtask mode, even if no title
    handleReset();
    if (onCancel) {
      onCancel();
    }
  };

  const handleSmartButtonClick = () => {
    if (!expanded) {
      setExpanded(true);
    }
  };

  const getUserName = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return "غير معروف";
    return `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;
  };

  return (
    <Card
      className="overflow-hidden"
      dir="rtl"
      data-testid="card-add-task-quick-pane"
    >
      <Form {...form}>
        <form onSubmit={handleFullSubmit}>
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            className="p-4"
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormControl>
                    <Input
                      {...field}
                      ref={titleInputRef}
                      placeholder={
                        creatingSubtaskFor
                          ? "اكتب المهمة الفرعية الجديدة..."
                          : "اكتب المهمة الجديدة..."
                      }
                      onFocus={() => setExpanded(true)}
                      onKeyDown={handleKeyDown}
                      disabled={isPending}
                      className="text-base border-0 shadow-none focus-visible:ring-0 px-0"
                      data-testid="input-task-title"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3 mt-3"
                >
                  {creatingSubtaskFor && (
                    <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        إنشاء مهمة فرعية
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleDone}
                          disabled={isPending}
                          data-testid="button-done-subtask-mode"
                        >
                          إنهاء
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCancel}
                          data-testid="button-cancel-subtask-mode"
                        >
                          إلغاء
                        </Button>
                      </div>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Textarea
                            {...field}
                            value={field.value || ""}
                            placeholder="الوصف (اختياري)"
                            disabled={isPending}
                            rows={3}
                            className="resize-none text-sm"
                            data-testid="textarea-task-description"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <div className="flex items-center gap-2 flex-wrap">
                    <FormField
                      control={form.control}
                      name="dueDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={handleSmartButtonClick}
                                  disabled={isPending}
                                  className={cn(
                                    "gap-2",
                                    field.value && "text-primary"
                                  )}
                                  data-testid="button-task-due-date"
                                >
                                  <Calendar className="h-4 w-4" />
                                  {field.value
                                    ? format(field.value, "PPP", { locale: ar })
                                    : "تاريخ الاستحقاق"}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={field.value}
                                onSelect={(date) => {
                                  field.onChange(date);
                                  setShowDatePicker(false);
                                }}
                                disabled={(date) => {
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);
                                  return date < today;
                                }}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="priority"
                      render={({ field }) => {
                        const PriorityIcon = field.value ? priorityIcons[field.value] : null;
                        const priorityColor = field.value ? priorityColors[field.value] : "";
                        const priorityLabel = field.value ? priorityLabels[field.value] : null;
                        
                        return (
                          <FormItem>
                            <Popover
                              open={showPrioritySelect}
                              onOpenChange={setShowPrioritySelect}
                            >
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleSmartButtonClick}
                                    disabled={isPending}
                                    className="gap-2"
                                    data-testid="button-task-priority"
                                  >
                                    <Flag className="h-4 w-4" />
                                    {priorityLabel && PriorityIcon ? (
                                      <>
                                        <PriorityIcon className={cn("h-3.5 w-3.5", priorityColor)} />
                                        <span>{priorityLabel}</span>
                                      </>
                                    ) : (
                                      "الأولوية"
                                    )}
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-48 p-2" align="start">
                                <div className="space-y-1">
                                  {priorityOptions.map((option) => {
                                    const OptionIcon = priorityIcons[option.value];
                                    const optionColor = priorityColors[option.value];
                                    return (
                                      <Button
                                        key={option.value}
                                        variant="ghost"
                                        size="sm"
                                        className="w-full justify-start gap-2"
                                        onClick={() => {
                                          field.onChange(option.value);
                                          setShowPrioritySelect(false);
                                        }}
                                        data-testid={`button-priority-${option.value}`}
                                      >
                                        <OptionIcon className={cn("h-3.5 w-3.5", optionColor)} />
                                        <span>{option.label}</span>
                                      </Button>
                                    );
                                  })}
                                </div>
                              </PopoverContent>
                            </Popover>
                          </FormItem>
                        );
                      }}
                    />

                    <FormField
                      control={form.control}
                      name="assignedToId"
                      render={({ field }) => (
                        <FormItem>
                          <Popover
                            open={showAssigneeSelect}
                            onOpenChange={setShowAssigneeSelect}
                          >
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={handleSmartButtonClick}
                                  disabled={isPending}
                                  className={cn(
                                    "gap-2",
                                    field.value && "text-primary"
                                  )}
                                  data-testid="button-task-assignee"
                                >
                                  <User className="h-4 w-4" />
                                  {field.value
                                    ? getUserName(field.value)
                                    : "المسؤول"}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-2" align="start">
                              <div className="space-y-1 max-h-64 overflow-y-auto">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full justify-start"
                                  onClick={() => {
                                    field.onChange(undefined);
                                    setShowAssigneeSelect(false);
                                  }}
                                  data-testid="button-assignee-none"
                                >
                                  غير مسند
                                </Button>
                                {users.map((user) => (
                                  <Button
                                    key={user.id}
                                    variant="ghost"
                                    size="sm"
                                    className="w-full justify-start"
                                    onClick={() => {
                                      field.onChange(user.id);
                                      setShowAssigneeSelect(false);
                                    }}
                                    data-testid={`button-assignee-${user.id}`}
                                  >
                                    {getUserName(user.id)}
                                  </Button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </FormItem>
                      )}
                    />

                    <div className="flex-1" />

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancel}
                      disabled={isPending}
                      data-testid="button-task-cancel"
                    >
                      إلغاء
                    </Button>

                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <Button
                          size="sm"
                          type="button"
                          onClick={handleFullSubmit}
                          disabled={isPending || !field.value?.trim()}
                          data-testid="button-task-submit"
                        >
                          {creatingSubtaskFor ? "إضافة مهمة فرعية" : "إضافة مهمة"}
                        </Button>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="department"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>القسم</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-department">
                                <SelectValue placeholder="اختر القسم" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="editorial">تحرير</SelectItem>
                              <SelectItem value="technical">تقني</SelectItem>
                              <SelectItem value="design">تصميم</SelectItem>
                              <SelectItem value="marketing">تسويق</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>الفئة</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-category">
                                <SelectValue placeholder="اختر الفئة" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="bug">خطأ</SelectItem>
                              <SelectItem value="feature">ميزة</SelectItem>
                              <SelectItem value="improvement">تحسين</SelectItem>
                              <SelectItem value="documentation">توثيق</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="tags"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الوسوم</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="مثال: عاجل، مهم، مراجعة"
                            data-testid="input-tags"
                            disabled={isPending}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          افصل الوسوم بفواصل
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem>
                        {field.value ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            <span>
                              موعد الاستحقاق:{" "}
                              {format(field.value, "PPP", { locale: ar })}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => field.onChange(undefined)}
                              data-testid="button-clear-due-date"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : null}
                      </FormItem>
                    )}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </form>
      </Form>
    </Card>
  );
}
