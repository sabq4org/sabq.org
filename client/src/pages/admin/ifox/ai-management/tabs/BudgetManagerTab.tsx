import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DollarSign, TrendingUp, TrendingDown, Plus, Filter, Calendar, Activity } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { IfoxBudgetTracking } from "@shared/schema";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

// Form schema for adding expenses
const addExpenseSchema = z.object({
  description: z.string().min(1, "الوصف مطلوب").max(200),
  service: z.enum(["openai", "anthropic", "gemini", "visual-ai"]),
  tokensUsed: z.number().min(0).optional(),
  estimatedCost: z.number().min(0, "التكلفة يجب أن تكون موجبة"),
});

type AddExpenseFormValues = z.infer<typeof addExpenseSchema>;

type ServiceFilter = "all" | "openai" | "anthropic" | "gemini" | "visual-ai";

export default function BudgetManagerTab() {
  const { toast } = useToast();
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<"daily" | "weekly" | "monthly">("monthly");

  // Fetch budget history
  const { data: budgetsRaw, isLoading } = useQuery<IfoxBudgetTracking[]>({
    queryKey: ["/api/ifox/ai-management/budget", { period: periodFilter }],
  });
  const budgets = Array.isArray(budgetsRaw) ? budgetsRaw : [];

  // Fetch budget status
  const { data: budgetStatus } = useQuery<{
    daily: { isOverBudget: boolean; utilization: number; remaining: number };
    weekly: { isOverBudget: boolean; utilization: number; remaining: number };
    monthly: { isOverBudget: boolean; utilization: number; remaining: number };
  }>({
    queryKey: ["/api/ifox/ai-management/budget/status"],
  });

  // Form for adding expenses
  const form = useForm<AddExpenseFormValues>({
    resolver: zodResolver(addExpenseSchema),
    defaultValues: {
      description: "",
      service: "openai",
      tokensUsed: 0,
      estimatedCost: 0,
    },
  });

  // Add expense mutation
  const addExpenseMutation = useMutation({
    mutationFn: (data: AddExpenseFormValues) =>
      apiRequest("/api/ifox/ai-management/budget/track", {
        method: "POST",
        body: JSON.stringify({
          provider: data.service,
          apiCalls: 1,
          tokens: data.tokensUsed || 0,
          cost: data.estimatedCost,
          period: periodFilter,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ifox/ai-management/budget"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ifox/ai-management/budget/status"] });
      setIsAddExpenseOpen(false);
      form.reset();
      toast({
        title: "تم التسجيل",
        description: "تم تسجيل المصروف بنجاح",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل تسجيل المصروف",
        variant: "destructive",
      });
    },
  });

  // Calculate current period data
  const currentPeriodData = budgets[0] || null;
  const currentStatus = budgetStatus?.[periodFilter] || { isOverBudget: false, utilization: 0, remaining: 0 };

  // Filter transactions by service
  const filteredBudgets = serviceFilter === "all" 
    ? budgets 
    : budgets.filter(budget => {
        // Check if the budget has activity for the selected service
        if (serviceFilter === "openai") return (budget.openaiCalls || 0) > 0;
        if (serviceFilter === "anthropic") return (budget.anthropicCalls || 0) > 0;
        if (serviceFilter === "gemini") return (budget.geminiCalls || 0) > 0;
        if (serviceFilter === "visual-ai") return (budget.visualAiCalls || 0) > 0;
        return true;
      });

  // Helper function to format currency
  const formatCurrency = (amount: number | null | undefined) => {
    return `$${(amount || 0).toFixed(2)}`;
  };

  // Helper function to get service name in Arabic
  const getServiceNameAr = (service: string) => {
    const names: Record<string, string> = {
      openai: "OpenAI",
      anthropic: "Anthropic",
      gemini: "Gemini",
      "visual-ai": "Visual AI",
    };
    return names[service] || service;
  };

  // Handle form submission
  const onSubmit = (data: AddExpenseFormValues) => {
    addExpenseMutation.mutate(data);
  };

  return (
    <div className="space-y-6" dir="rtl" data-testid="budget-manager-tab">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">إدارة الميزانية</h2>
          <p className="text-muted-foreground">تتبع تكاليف APIs والميزانية</p>
        </div>
        <Button
          onClick={() => setIsAddExpenseOpen(true)}
          data-testid="button-add-expense"
        >
          <Plus className="w-4 h-4 ml-2" />
          إضافة مصروف
        </Button>
      </div>

      {/* Period Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2 flex-wrap" data-testid="period-filters">
            <Button
              variant={periodFilter === "daily" ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriodFilter("daily")}
              data-testid="filter-daily"
            >
              يومي
            </Button>
            <Button
              variant={periodFilter === "weekly" ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriodFilter("weekly")}
              data-testid="filter-weekly"
            >
              أسبوعي
            </Button>
            <Button
              variant={periodFilter === "monthly" ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriodFilter("monthly")}
              data-testid="filter-monthly"
            >
              شهري
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Budget Overview Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="budget-overview-cards">
          {/* Total Budget */}
          <Card data-testid="card-total-budget">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي الميزانية</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-budget">
                {formatCurrency(currentPeriodData?.budgetLimit)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                للفترة {periodFilter === "daily" ? "اليومية" : periodFilter === "weekly" ? "الأسبوعية" : "الشهرية"}
              </p>
            </CardContent>
          </Card>

          {/* Used Budget */}
          <Card data-testid="card-used-budget">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">المستخدم</CardTitle>
              <TrendingUp className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600" data-testid="text-used-budget">
                {formatCurrency(currentPeriodData?.totalCost)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {currentPeriodData?.totalApiCalls || 0} استدعاء API
              </p>
            </CardContent>
          </Card>

          {/* Remaining Budget */}
          <Card data-testid="card-remaining-budget">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">المتبقي</CardTitle>
              <TrendingDown className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="text-remaining-budget">
                {formatCurrency(currentStatus.remaining)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                من الميزانية المخصصة
              </p>
            </CardContent>
          </Card>

          {/* Budget Utilization */}
          <Card data-testid="card-utilization">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">نسبة الاستخدام</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-utilization">
                {currentStatus.utilization.toFixed(1)}%
              </div>
              {currentStatus.isOverBudget && (
                <Badge variant="destructive" className="mt-2">
                  تجاوز الميزانية!
                </Badge>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                سجل المعاملات
              </CardTitle>
              <CardDescription>
                تفاصيل جميع المصروفات والاستخدام
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={serviceFilter} onValueChange={(v) => setServiceFilter(v as ServiceFilter)}>
                <SelectTrigger className="w-[180px]" data-testid="select-service-filter">
                  <SelectValue placeholder="تصفية حسب الخدمة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الخدمات</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="visual-ai">Visual AI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredBudgets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="empty-state">
              لا توجد معاملات لعرضها
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table data-testid="transactions-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">الفترة</TableHead>
                    <TableHead className="text-right">الخدمات</TableHead>
                    <TableHead className="text-right">الرموز المستخدمة</TableHead>
                    <TableHead className="text-right">التكلفة</TableHead>
                    <TableHead className="text-right">الرصيد المتبقي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBudgets.map((budget) => (
                    <TableRow key={budget.id} data-testid={`row-transaction-${budget.id}`}>
                      <TableCell className="font-medium">
                        {format(new Date(budget.periodStart), "dd MMM yyyy", { locale: ar })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {budget.period === "daily" ? "يومي" : budget.period === "weekly" ? "أسبوعي" : "شهري"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(budget.openaiCalls || 0) > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              OpenAI ({budget.openaiCalls})
                            </Badge>
                          )}
                          {(budget.anthropicCalls || 0) > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              Anthropic ({budget.anthropicCalls})
                            </Badge>
                          )}
                          {(budget.geminiCalls || 0) > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              Gemini ({budget.geminiCalls})
                            </Badge>
                          )}
                          {(budget.visualAiCalls || 0) > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              Visual AI ({budget.visualAiCalls})
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(budget.totalTokens || 0).toLocaleString('ar-SA')}
                      </TableCell>
                      <TableCell className="font-semibold text-orange-600">
                        {formatCurrency(budget.totalCost)}
                      </TableCell>
                      <TableCell className="font-semibold text-green-600">
                        {formatCurrency(budget.budgetRemaining)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Expense Dialog */}
      <Dialog open={isAddExpenseOpen} onOpenChange={setIsAddExpenseOpen}>
        <DialogContent className="sm:max-w-[500px]" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة مصروف جديد</DialogTitle>
            <DialogDescription>
              سجل استخدام جديد لـ API أو مصروف
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الوصف</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="وصف المصروف..."
                        {...field}
                        data-testid="input-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="service"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الخدمة</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-service">
                          <SelectValue placeholder="اختر الخدمة" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="anthropic">Anthropic</SelectItem>
                        <SelectItem value="gemini">Gemini</SelectItem>
                        <SelectItem value="visual-ai">Visual AI</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tokensUsed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>عدد الرموز المستخدمة</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : 0)}
                        data-testid="input-tokens"
                      />
                    </FormControl>
                    <FormDescription>
                      اختياري - عدد الرموز المستخدمة في الاستدعاء
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="estimatedCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>التكلفة المقدرة ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : 0)}
                        data-testid="input-cost"
                      />
                    </FormControl>
                    <FormDescription>
                      التكلفة بالدولار الأمريكي
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddExpenseOpen(false)}
                  data-testid="button-cancel"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={addExpenseMutation.isPending}
                  data-testid="button-submit-expense"
                >
                  {addExpenseMutation.isPending ? "جاري الحفظ..." : "حفظ"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
