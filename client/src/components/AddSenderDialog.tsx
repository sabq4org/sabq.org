import { useState, useEffect, type ComponentType, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import {
  Copy,
  Eye,
  EyeOff,
  Mail,
  User,
  Settings2,
  Shield,
  KeyRound,
  Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { TrustedEmailSender } from "@shared/schema";

const formSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صالح"),
  name: z.string().min(2, "الاسم يجب أن يكون حرفين على الأقل"),
  language: z.enum(["ar", "en", "ur"]),
  autoPublish: z.boolean(),
  defaultCategory: z.string().optional(),
  reporterUserId: z.string().optional(),
  status: z.enum(["active", "suspended", "revoked"]),
});

type FormValues = z.infer<typeof formSchema>;

interface Category {
  id: string;
  nameAr: string;
  status: string;
}

interface Reporter {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

interface AddSenderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: FormValues & { token?: string }) => Promise<void>;
  editingSender?: TrustedEmailSender | null;
  isSubmitting?: boolean;
}

const fieldControlClass =
  "h-11 border-2 border-border/80 bg-muted/40 shadow-sm hover:border-primary/40 hover:bg-background focus:bg-background data-[placeholder]:text-muted-foreground";

function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function FormSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 border-b border-border/60 bg-muted/40 px-4 py-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description ? (
            <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="space-y-5 p-4">{children}</div>
    </section>
  );
}

export function AddSenderDialog({
  open,
  onOpenChange,
  onSubmit,
  editingSender,
  isSubmitting,
}: AddSenderDialogProps) {
  const { toast } = useToast();
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    queryFn: async () => {
      const res = await fetch("/api/categories", { credentials: "include" });
      if (!res.ok) throw new Error("فشل في تحميل التصنيفات");
      return await res.json();
    },
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  const { data: reporters } = useQuery<Reporter[]>({
    queryKey: ["/api/email-agent/available-reporters"],
    queryFn: async () => {
      const allowedRoles = ["reporter", "journalist", "author", "writer", "content_creator"];
      const allReporters: Reporter[] = [];

      for (const role of allowedRoles) {
        try {
          const res = await fetch(`/api/users?role=${role}`, { credentials: "include" });
          if (res.ok) {
            const users = await res.json();
            allReporters.push(...users);
          }
        } catch (e) {
          console.warn(`Failed to fetch ${role} users:`, e);
        }
      }

      return allReporters.filter(
        (user, index, self) => self.findIndex((u) => u.id === user.id) === index
      );
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      name: "",
      language: "ar",
      autoPublish: true,
      defaultCategory: undefined,
      reporterUserId: undefined,
      status: "active",
    },
  });

  useEffect(() => {
    if (open) {
      if (editingSender) {
        form.reset({
          email: editingSender.email,
          name: editingSender.name,
          language: editingSender.language as "ar" | "en" | "ur",
          autoPublish: editingSender.autoPublish,
          defaultCategory: editingSender.defaultCategory || undefined,
          reporterUserId: editingSender.reporterUserId || undefined,
          status: editingSender.status as "active" | "suspended" | "revoked",
        });
        setGeneratedToken(null);
      } else {
        form.reset({
          email: "",
          name: "",
          language: "ar",
          autoPublish: true,
          defaultCategory: undefined,
          reporterUserId: undefined,
          status: "active",
        });
        setGeneratedToken(generateToken());
      }
      setShowToken(false);
      setTokenCopied(false);
    }
  }, [open, editingSender, form]);

  const handleSubmit = async (values: FormValues) => {
    const submitData = editingSender
      ? values
      : { ...values, token: generatedToken! };

    await onSubmit(submitData);
  };

  const copyToken = async () => {
    if (!generatedToken) return;
    await navigator.clipboard.writeText(generatedToken);
    setTokenCopied(true);
    toast({
      title: "تم النسخ",
      description: "تم نسخ الرمز السري إلى الحافظة",
    });
    window.setTimeout(() => setTokenCopied(false), 2000);
  };

  const activeCategories = categories.filter((c) => c.status === "active");
  const autoPublish = form.watch("autoPublish");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:rounded-xl"
        dir="rtl"
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-border/70 bg-muted/30 px-6 py-5 text-right sm:text-right">
          <DialogTitle className="text-xl">
            {editingSender ? "تعديل المرسل الموثوق" : "إضافة مرسل موثوق"}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {editingSender
              ? "حدّث بيانات المرسل وإعدادات النشر التلقائي"
              : "أضف بريداً موثوقاً لاستقبال المقالات ونشرها تلقائياً أو كمسودات"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <FormSection
                icon={User}
                title="هوية المرسل"
                description="البريد والاسم اللذان يُعرّفان مصدر الرسالة الواردة"
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold">
                        البريد الإلكتروني
                        <span className="mr-1 text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            {...field}
                            type="email"
                            placeholder="sender@example.com"
                            disabled={!!editingSender}
                            className={cn(fieldControlClass, "ps-10 font-mono text-sm")}
                            data-testid="input-email"
                          />
                        </div>
                      </FormControl>
                      <FormDescription className="text-xs">
                        {editingSender
                          ? "لا يمكن تعديل البريد بعد الإنشاء"
                          : "يُقبل فقط البريد الوارد من هذا العنوان"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold">
                        اسم المرسل
                        <span className="mr-1 text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="مثال: فريق التحرير"
                          className={fieldControlClass}
                          data-testid="input-name"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        يظهر في لوحة الإدارة لتمييز هذا المرسل
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reporterUserId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold">المراسل المعتمد</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value === "none" ? undefined : value);
                        }}
                        value={field.value || "none"}
                      >
                        <FormControl>
                          <SelectTrigger
                            className={fieldControlClass}
                            data-testid="select-reporter"
                          >
                            <SelectValue placeholder="اختر المراسل (اختياري)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">بدون مراسل</SelectItem>
                          {reporters?.map((reporter) => {
                            const name =
                              [reporter.firstName, reporter.lastName]
                                .filter(Boolean)
                                .join(" ") || reporter.email;
                            return (
                              <SelectItem key={reporter.id} value={reporter.id}>
                                {name}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs">
                        يُنسب المقال المنشور لهذا المراسل (اختياري)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormSection>

              <FormSection
                icon={Settings2}
                title="إعدادات النشر"
                description="اللغة والحالة والتصنيف وسلوك النشر عند وصول البريد"
              >
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="language"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold">
                          اللغة
                          <span className="mr-1 text-destructive">*</span>
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger
                              className={fieldControlClass}
                              data-testid="select-language"
                            >
                              <SelectValue placeholder="اختر اللغة" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="ar">عربية</SelectItem>
                            <SelectItem value="en">إنجليزية</SelectItem>
                            <SelectItem value="ur">أردية</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold">
                          الحالة
                          <span className="mr-1 text-destructive">*</span>
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger
                              className={fieldControlClass}
                              data-testid="select-status"
                            >
                              <SelectValue placeholder="اختر الحالة" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="active">نشط</SelectItem>
                            <SelectItem value="suspended">معلق</SelectItem>
                            <SelectItem value="revoked">ملغي</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="defaultCategory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold">التصنيف الافتراضي</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value === "none" ? undefined : value);
                        }}
                        value={field.value || "none"}
                      >
                        <FormControl>
                          <SelectTrigger
                            className={fieldControlClass}
                            data-testid="select-category"
                          >
                            <SelectValue placeholder="بدون تصنيف (اختياري)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">بدون تصنيف</SelectItem>
                          {activeCategories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.nameAr}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs">
                        يُستخدم تلقائياً إن لم يُحدد تصنيف في الرسالة
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="autoPublish"
                  render={({ field }) => (
                    <FormItem
                      className={cn(
                        "flex flex-row items-center justify-between gap-4 rounded-lg border-2 p-4 transition-colors",
                        field.value
                          ? "border-primary/30 bg-primary/5"
                          : "border-border/70 bg-muted/30"
                      )}
                    >
                      <div className="space-y-1">
                        <FormLabel className="text-sm font-semibold">نشر تلقائي</FormLabel>
                        <FormDescription className="text-xs leading-relaxed">
                          {autoPublish
                            ? "المقالات تُنشر مباشرة عند استلام البريد"
                            : "المقالات تُحفظ كمسودات للمراجعة قبل النشر"}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-auto-publish"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </FormSection>

              {!editingSender && generatedToken ? (
                <FormSection
                  icon={Shield}
                  title="الرمز السري"
                  description="احفظه الآن — لن يظهر كاملاً بعد الإضافة"
                >
                  <div className="space-y-3 rounded-lg border-2 border-amber-500/25 bg-amber-500/5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <KeyRound className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        رمز التحقق
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 gap-1.5 border-2"
                          onClick={() => setShowToken(!showToken)}
                          data-testid="button-toggle-token"
                        >
                          {showToken ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                          <span className="hidden sm:inline">
                            {showToken ? "إخفاء" : "إظهار"}
                          </span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 gap-1.5 border-2"
                          onClick={copyToken}
                          data-testid="button-copy-token"
                        >
                          {tokenCopied ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                          <span className="hidden sm:inline">
                            {tokenCopied ? "تم النسخ" : "نسخ"}
                          </span>
                        </Button>
                      </div>
                    </div>
                    <div
                      className={cn(
                        "break-all rounded-lg border-2 border-border/80 bg-background px-3 py-3 font-mono text-sm leading-relaxed",
                        !showToken && "tracking-widest text-muted-foreground"
                      )}
                    >
                      {showToken ? generatedToken : "•".repeat(48)}
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      يُرسل مع البريد للتحقق من صحة المرسل. انسخه واحفظه في مكان آمن قبل الإضافة.
                    </p>
                  </div>
                </FormSection>
              ) : null}
            </div>

            <DialogFooter className="shrink-0 gap-2 border-t border-border/70 bg-muted/30 px-6 py-4 sm:justify-start sm:space-x-0 sm:space-x-reverse">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="min-w-[7.5rem]"
                data-testid="button-submit"
              >
                {isSubmitting
                  ? "جاري الحفظ..."
                  : editingSender
                    ? "حفظ التعديلات"
                    : "إضافة المرسل"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-2"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                data-testid="button-cancel"
              >
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
