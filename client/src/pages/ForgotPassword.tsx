import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AuthLayout from "@/components/AuthLayout";

const forgotPasswordSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صحيح"),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPassword() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);

  const form = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    try {
      setIsLoading(true);
      const response = await apiRequest("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify(data),
      });
      
      // In development, show the reset link
      if (response.resetLink) {
        setResetLink(response.resetLink);
      }

      toast({
        title: "تم إرسال رابط إعادة التعيين",
        description: response.message,
      });
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message || "حدث خطأ في معالجة طلبك",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      footer={
        <Link
          to="/login"
          className="transition-colors hover:text-foreground"
          data-testid="link-back-to-login"
        >
          العودة لتسجيل الدخول
        </Link>
      }
    >
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          نسيت كلمة المرور؟
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          أدخل بريدك الإلكتروني المرتبط بحسابك وسنرسل لك رابط إعادة التعيين.
        </p>
      </div>

      <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      البريد الإلكتروني<span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="example@email.com"
                        disabled={isLoading}
                        data-testid="input-forgot-email"
                        className="text-right"
                        dir="ltr"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                data-testid="button-send-reset"
              >
                {isLoading ? "جاري الإرسال..." : "إرسال رابط إعادة التعيين"}
              </Button>
            </form>
          </Form>

      <div className="mt-5 rounded-lg bg-muted/50 p-3 text-center text-sm text-muted-foreground">
        سجلت برقم الجوال فقط؟ لا حاجة لكلمة المرور —{" "}
        <Link to="/login" className="font-medium text-primary hover:underline" data-testid="link-phone-login">
          ادخل برمز تحقق يصل جوالك
        </Link>
        <p className="mt-1 text-xs">
          إن لم تصلك رسالة خلال دقائق، تحقق من مجلد الرسائل غير المرغوبة أو جرّب الدخول بالجوال.
        </p>
      </div>

      {resetLink && (
        <Alert className="mt-4">
          <AlertDescription className="space-y-2">
            <p className="font-semibold">رابط إعادة التعيين (للتطوير فقط):</p>
            <a
              href={resetLink}
              className="text-primary hover:underline break-all text-sm"
              data-testid="link-reset-dev"
            >
              {resetLink}
            </a>
          </AlertDescription>
        </Alert>
      )}
    </AuthLayout>
  );
}
