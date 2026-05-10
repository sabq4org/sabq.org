import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Separator } from "@/components/ui/separator";
import { 
  Building2, 
  Mail, 
  Phone, 
  FileText, 
  MapPin, 
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface AdAccount {
  id: string;
  companyName: string;
  companyNameEn?: string | null;
  contactEmail: string;
  contactPhone?: string | null;
  taxId?: string | null;
  billingAddress?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  } | null;
  status: string;
  accountType: string;
  totalSpent: number;
  totalBudget?: number | null;
  createdAt: string;
  updatedAt: string;
}

const accountFormSchema = z.object({
  companyName: z.string().min(1, "اسم الشركة مطلوب"),
  companyNameEn: z.string().optional(),
  contactEmail: z.string().email("البريد الإلكتروني غير صحيح"),
  contactPhone: z.string().optional(),
  taxId: z.string().optional(),
  accountType: z.enum(["standard", "premium", "enterprise"]),
  totalBudget: z.coerce.number().positive("الميزانية يجب أن تكون موجبة").optional().or(z.literal("")),
  billingStreet: z.string().optional(),
  billingCity: z.string().optional(),
  billingState: z.string().optional(),
  billingCountry: z.string().optional(),
  billingPostalCode: z.string().optional(),
});

type AccountFormValues = z.infer<typeof accountFormSchema>;

export default function AdAccountPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);

  const { data: account, isLoading, error } = useQuery<AdAccount>({
    queryKey: ["/api/ads/accounts/me"],
    retry: false,
  });

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      companyName: "",
      companyNameEn: "",
      contactEmail: user?.email || "",
      contactPhone: "",
      taxId: "",
      accountType: "standard",
      totalBudget: "",
      billingStreet: "",
      billingCity: "",
      billingState: "",
      billingCountry: "المملكة العربية السعودية",
      billingPostalCode: "",
    },
  });

  const createAccountMutation = useMutation({
    mutationFn: async (data: AccountFormValues) => {
      const payload = {
        companyName: data.companyName,
        companyNameEn: data.companyNameEn || undefined,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone || undefined,
        taxId: data.taxId || undefined,
        accountType: data.accountType,
        totalBudget: data.totalBudget ? Math.round(Number(data.totalBudget) * 100) : undefined,
        billingAddress: {
          street: data.billingStreet || undefined,
          city: data.billingCity || undefined,
          state: data.billingState || undefined,
          country: data.billingCountry || undefined,
          postalCode: data.billingPostalCode || undefined,
        },
      };

      return await apiRequest("/api/ads/accounts", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ads/accounts/me"] });
      toast({
        title: "تم إنشاء الحساب بنجاح",
        description: "يمكنك الآن إنشاء حملاتك الإعلانية",
      });
      setIsCreating(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "خطأ في إنشاء الحساب",
        description: error.message || "حدث خطأ أثناء إنشاء الحساب",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  // إذا كان لديه حساب - عرض معلومات الحساب
  if (account && !error) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">حسابي الإعلاني</h1>
          <p className="text-muted-foreground">
            إدارة معلومات حسابك الإعلاني وإحصائيات الأداء
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                معلومات الشركة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-muted-foreground text-sm">اسم الشركة</Label>
                <p className="font-medium mt-1" data-testid="text-company-name">
                  {account.companyName}
                </p>
              </div>
              
              {account.companyNameEn && (
                <div>
                  <Label className="text-muted-foreground text-sm">الاسم بالإنجليزية</Label>
                  <p className="font-medium mt-1">{account.companyNameEn}</p>
                </div>
              )}

              <Separator />

              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm" data-testid="text-contact-email">
                  {account.contactEmail}
                </span>
              </div>

              {account.contactPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{account.contactPhone}</span>
                </div>
              )}

              {account.taxId && (
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">الرقم الضريبي: {account.taxId}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                الميزانية والإنفاق
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-sm">إجمالي الإنفاق</Label>
                  <p className="text-2xl font-bold mt-1" data-testid="text-total-spent">
                    {(account.totalSpent / 100).toFixed(2)} ر.س
                  </p>
                </div>
                
                {account.totalBudget && (
                  <div>
                    <Label className="text-muted-foreground text-sm">الميزانية الإجمالية</Label>
                    <p className="text-2xl font-bold mt-1">
                      {(account.totalBudget / 100).toFixed(2)} ر.س
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">نوع الحساب</span>
                  <span className="font-medium capitalize" data-testid="text-account-type">
                    {account.accountType === "standard" ? "قياسي" : 
                     account.accountType === "premium" ? "مميز" : "مؤسسي"}
                  </span>
                </div>
                
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">حالة الحساب</span>
                  <span 
                    className="font-medium"
                    data-testid="text-account-status"
                  >
                    {account.status === "active" ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        نشط
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        {account.status}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {account.billingAddress && (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  عنوان الفوترة
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {account.billingAddress.street && (
                    <div>
                      <Label className="text-muted-foreground text-sm">الشارع</Label>
                      <p className="mt-1">{account.billingAddress.street}</p>
                    </div>
                  )}
                  {account.billingAddress.city && (
                    <div>
                      <Label className="text-muted-foreground text-sm">المدينة</Label>
                      <p className="mt-1">{account.billingAddress.city}</p>
                    </div>
                  )}
                  {account.billingAddress.state && (
                    <div>
                      <Label className="text-muted-foreground text-sm">المنطقة</Label>
                      <p className="mt-1">{account.billingAddress.state}</p>
                    </div>
                  )}
                  {account.billingAddress.country && (
                    <div>
                      <Label className="text-muted-foreground text-sm">الدولة</Label>
                      <p className="mt-1">{account.billingAddress.country}</p>
                    </div>
                  )}
                  {account.billingAddress.postalCode && (
                    <div>
                      <Label className="text-muted-foreground text-sm">الرمز البريدي</Label>
                      <p className="mt-1">{account.billingAddress.postalCode}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        </div>
      </DashboardLayout>
    );
  }

  // إذا لم يكن لديه حساب - عرض نموذج الإنشاء
  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">إنشاء حساب معلن</h1>
        <p className="text-muted-foreground">
          أنشئ حسابك الإعلاني لتتمكن من إطلاق حملاتك الإعلانية على منصة سبق
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>معلومات الحساب</CardTitle>
          <CardDescription>
            املأ المعلومات التالية لإنشاء حسابك الإعلاني
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form 
              onSubmit={form.handleSubmit((data) => createAccountMutation.mutate(data))}
              className="space-y-6"
            >
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  معلومات الشركة
                </h3>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>اسم الشركة *</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="مثال: شركة التقنية المتقدمة"
                            data-testid="input-company-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="companyNameEn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الاسم بالإنجليزية</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="Example: Advanced Tech Company"
                            data-testid="input-company-name-en"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>البريد الإلكتروني *</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            type="email"
                            placeholder="contact@example.com"
                            data-testid="input-contact-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contactPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>رقم الهاتف</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="+966 50 123 4567"
                            data-testid="input-contact-phone"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="taxId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الرقم الضريبي</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="1234567890"
                            data-testid="input-tax-id"
                          />
                        </FormControl>
                        <FormDescription>
                          رقم التسجيل الضريبي للشركة (اختياري)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="accountType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>نوع الحساب</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-account-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="standard">قياسي</SelectItem>
                            <SelectItem value="premium">مميز</SelectItem>
                            <SelectItem value="enterprise">مؤسسي</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  الميزانية
                </h3>

                <FormField
                  control={form.control}
                  name="totalBudget"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الميزانية الإجمالية (ريال سعودي)</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          type="number"
                          step="0.01"
                          placeholder="10000"
                          data-testid="input-total-budget"
                        />
                      </FormControl>
                      <FormDescription>
                        حد الإنفاق الإجمالي لحسابك (اختياري)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  عنوان الفوترة (اختياري)
                </h3>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="billingStreet"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>الشارع</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="شارع الملك فهد"
                            data-testid="input-billing-street"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="billingCity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>المدينة</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="الرياض"
                            data-testid="input-billing-city"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="billingState"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>المنطقة</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="منطقة الرياض"
                            data-testid="input-billing-state"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="billingCountry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الدولة</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="المملكة العربية السعودية"
                            data-testid="input-billing-country"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="billingPostalCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الرمز البريدي</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="12345"
                            data-testid="input-billing-postal-code"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="submit"
                  disabled={createAccountMutation.isPending}
                  data-testid="button-create-account"
                >
                  {createAccountMutation.isPending && (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  )}
                  إنشاء الحساب
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
      </div>
    </DashboardLayout>
  );
}
