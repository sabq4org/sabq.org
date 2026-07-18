import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Calendar } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

const creditPackageSchema = z.object({
  packageName: z.string().min(2, "اسم الباقة مطلوب"),
  isUnlimited: z.boolean().default(false),
  totalCredits: z.number().int().min(0),
  period: z.enum(["monthly", "quarterly", "yearly", "one-time"], {
    required_error: "يرجى اختيار الفترة",
  }),
  startDate: z.date({
    required_error: "تاريخ البداية مطلوب",
  }),
  expiryDate: z.date().optional(),
  price: z.number().min(0).optional(),
  currency: z.string().default("SAR"),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (!data.isUnlimited && data.totalCredits < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["totalCredits"],
      message: "يجب أن يكون عدد الأخبار 1 على الأقل، أو فعّل «باقة مفتوحة»",
    });
  }
  if (data.isUnlimited && !data.expiryDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["expiryDate"],
      message: "الباقة المفتوحة تحتاج تاريخ انتهاء",
    });
  }
});

type CreditPackageFormData = z.infer<typeof creditPackageSchema>;

interface AddCreditPackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publisherId: string;
}

const periodLabels = {
  "monthly": "شهرية",
  "quarterly": "ربع سنوية",
  "yearly": "سنوية",
  "one-time": "مرة واحدة",
};

function calculateExpiryDate(startDate: Date, period: string): Date | undefined {
  if (period === "one-time") return undefined;
  
  const expiryDate = new Date(startDate);
  switch (period) {
    case "monthly":
      expiryDate.setMonth(expiryDate.getMonth() + 1);
      break;
    case "quarterly":
      expiryDate.setMonth(expiryDate.getMonth() + 3);
      break;
    case "yearly":
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      break;
  }
  return expiryDate;
}

export function AddCreditPackageDialog({
  open,
  onOpenChange,
  publisherId,
}: AddCreditPackageDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CreditPackageFormData>({
    resolver: zodResolver(creditPackageSchema),
    defaultValues: {
      packageName: "",
      isUnlimited: false,
      totalCredits: 10,
      period: "monthly",
      startDate: new Date(),
      expiryDate: calculateExpiryDate(new Date(), "monthly"),
      price: undefined,
      currency: "SAR",
      notes: "",
    },
  });

  const period = form.watch("period");
  const startDate = form.watch("startDate");
  const isUnlimited = form.watch("isUnlimited");

  // Auto-calculate expiry date based on period and start date.
  // الباقة المفتوحة: التاريخ يُحدد يدوياً ولا يُعاد حسابه.
  useEffect(() => {
    if (startDate && period && !isUnlimited) {
      const calculated = calculateExpiryDate(startDate, period);
      form.setValue("expiryDate", calculated);
    }
  }, [startDate, period, isUnlimited, form]);

  const createMutation = useMutation({
    mutationFn: async (data: CreditPackageFormData) => {
      return apiRequest(`/api/admin/publishers/${publisherId}/credits`, {
        method: "POST",
        body: JSON.stringify({
          ...data,
          // الباقة المفتوحة لا عدّاد لها — الرصيد يُعرض «مفتوح»
          totalCredits: data.isUnlimited ? 0 : data.totalCredits,
          startDate: data.startDate.toISOString(),
          expiryDate: data.expiryDate?.toISOString(),
        }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/publishers/${publisherId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/publishers"] });
      toast({
        title: "تم إضافة الباقة",
        description: "تم إضافة باقة الرصيد بنجاح",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إضافة الباقة",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: CreditPackageFormData) => {
    setIsSubmitting(true);
    try {
      await createMutation.mutateAsync(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]" data-testid="dialog-add-credit-package">
        <DialogHeader>
          <DialogTitle>إضافة باقة رصيد جديدة</DialogTitle>
          <DialogDescription>
            أدخل تفاصيل باقة الرصيد الجديدة للناشر
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="packageName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>اسم الباقة *</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="مثال: باقة 20 خبر شهرية" 
                      data-testid="input-package-name"
                      dir="rtl"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <FormField
                  control={form.control}
                  name="totalCredits"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>عدد الأخبار {!isUnlimited && "*"}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          {...field}
                          value={isUnlimited ? "" : field.value}
                          placeholder={isUnlimited ? "مفتوح ∞" : undefined}
                          disabled={isUnlimited}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-total-credits"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isUnlimited"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                          data-testid="checkbox-unlimited"
                        />
                      </FormControl>
                      <FormLabel className="text-sm font-normal cursor-pointer">
                        باقة مفتوحة (نشر غير محدود حتى تاريخ الانتهاء)
                      </FormLabel>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="period"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الفترة *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-period">
                          <SelectValue placeholder="اختر الفترة" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(periodLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>تاريخ البداية *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className="justify-start text-right font-normal"
                            data-testid="button-start-date"
                          >
                            <Calendar className="ml-2 h-4 w-4" />
                            {field.value ? (
                              format(field.value, "PPP", { locale: ar })
                            ) : (
                              <span>اختر التاريخ</span>
                            )}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          locale={ar}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {(period !== "one-time" || isUnlimited) && (
                <FormField
                  control={form.control}
                  name="expiryDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>تاريخ الانتهاء {isUnlimited && "*"}</FormLabel>
                      {isUnlimited ? (
                        // الباقة المفتوحة: التاريخ يُحدد يدوياً وهو حد الباقة الوحيد
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className="justify-start text-right font-normal"
                                data-testid="button-expiry-date"
                              >
                                <Calendar className="ml-2 h-4 w-4" />
                                {field.value ? (
                                  format(field.value, "PPP", { locale: ar })
                                ) : (
                                  <span>اختر تاريخ انتهاء الباقة</span>
                                )}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              locale={ar}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <FormControl>
                          <Button
                            variant="outline"
                            className="justify-start text-right font-normal"
                            disabled
                            data-testid="button-expiry-date"
                          >
                            <Calendar className="ml-2 h-4 w-4" />
                            {field.value ? (
                              format(field.value, "PPP", { locale: ar })
                            ) : (
                              <span>محسوب تلقائياً</span>
                            )}
                          </Button>
                        </FormControl>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {isUnlimited ? "بعد هذا التاريخ يتوقف النشر المفتوح" : "يتم حسابه تلقائياً بناءً على الفترة"}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>السعر (اختياري)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01"
                        min="0"
                        placeholder="السعر الإجمالي للباقة"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                        data-testid="input-price"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>العملة</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-currency">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="SAR">ريال سعودي</SelectItem>
                        <SelectItem value="USD">دولار أمريكي</SelectItem>
                        <SelectItem value="EUR">يورو</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ملاحظات</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      placeholder="ملاحظات إضافية عن الباقة..." 
                      data-testid="textarea-notes"
                      dir="rtl"
                      rows={2}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                data-testid="button-cancel"
              >
                إلغاء
              </Button>
              <Button type="submit" disabled={isSubmitting} data-testid="button-submit">
                {isSubmitting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                إضافة الباقة
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
