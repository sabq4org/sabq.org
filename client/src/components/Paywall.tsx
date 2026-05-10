import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Lock, CreditCard, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { apiRequest } from "@/lib/queryClient";

const purchaseFormSchema = z.object({
  email: z.string().email("يرجى إدخال بريد إلكتروني صحيح"),
  firstName: z.string().min(1, "يرجى إدخال الاسم الأول"),
  lastName: z.string().optional(),
});

type PurchaseFormData = z.infer<typeof purchaseFormSchema>;

interface PaywallProps {
  article: {
    id: string;
    title: string;
    content: string;
    priceHalalas: number;
    previewLength?: number;
    imageUrl?: string | null;
    slug: string;
  };
  onPurchaseComplete?: () => void;
}

export function Paywall({
  article,
  onPurchaseComplete,
}: PaywallProps) {
  const [redirecting, setRedirecting] = useState(false);
  
  const priceSAR = (article.priceHalalas / 100).toFixed(2);
  
  const form = useForm<PurchaseFormData>({
    resolver: zodResolver(purchaseFormSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
    },
  });

  const createChargeMutation = useMutation({
    mutationFn: async (data: PurchaseFormData) => {
      const response = await apiRequest<{
        success: boolean;
        data?: {
          purchaseId: string;
          chargeId: string;
          paymentUrl: string;
          status: string;
        };
        error?: string;
        alreadyPurchased?: boolean;
      }>("/api/payments/create-charge", {
        method: "POST",
        body: JSON.stringify({
          articleId: article.id,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName || undefined,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });
      return response;
    },
    onSuccess: (response) => {
      if (response.success && response.data?.paymentUrl) {
        setRedirecting(true);
        window.location.href = response.data.paymentUrl;
      }
    },
  });

  const onSubmit = (data: PurchaseFormData) => {
    createChargeMutation.mutate(data);
  };

  return (
    <div className="relative" dir="rtl">
      <div 
        className="prose prose-lg dark:prose-invert max-w-none mb-8"
        dangerouslySetInnerHTML={{ __html: article.content.substring(0, article.previewLength || 200) + '...' }}
        data-testid="text-preview-content"
      />
      
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      
      <Card className="mt-4 border-primary/30" data-testid="card-paywall">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-xl" data-testid="text-paywall-title">
            محتوى حصري
          </CardTitle>
          <CardDescription className="text-base" data-testid="text-paywall-description">
            للاستمرار في قراءة هذا المقال، يرجى الشراء
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="text-center p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">سعر المقال</p>
            <p className="text-3xl font-bold text-primary" data-testid="text-price">
              {priceSAR} <span className="text-lg">ر.س</span>
            </p>
          </div>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الاسم الأول *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="أدخل اسمك الأول" 
                        {...field} 
                        data-testid="input-first-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>اسم العائلة</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="أدخل اسم العائلة (اختياري)" 
                        {...field} 
                        data-testid="input-last-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>البريد الإلكتروني *</FormLabel>
                    <FormControl>
                      <Input 
                        type="email"
                        placeholder="example@email.com" 
                        dir="ltr"
                        className="text-left"
                        {...field} 
                        data-testid="input-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <Button 
                type="submit" 
                className="w-full gap-2"
                disabled={createChargeMutation.isPending || redirecting}
                data-testid="button-purchase"
              >
                {createChargeMutation.isPending || redirecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جاري التحويل للدفع...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4" />
                    شراء المقال - {priceSAR} ر.س
                  </>
                )}
              </Button>
              
              {createChargeMutation.isError && (
                <p className="text-sm text-destructive text-center" data-testid="text-error">
                  {(createChargeMutation.error as Error)?.message || "حدث خطأ أثناء إنشاء الطلب"}
                </p>
              )}
            </form>
          </Form>
          
          <p className="text-xs text-muted-foreground text-center">
            سيتم تحويلك إلى بوابة الدفع الآمنة Tap لإتمام عملية الشراء
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
