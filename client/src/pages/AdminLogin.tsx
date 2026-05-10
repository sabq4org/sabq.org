import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getDefaultRedirectPath, isStaff, type User } from "@/hooks/useAuth";
import { Shield, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const loginSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setIsLoading(true);
      const response = await apiRequest("/api/login", {
        method: "POST",
        body: JSON.stringify(data),
      });
      
      // Check if 2FA is required
      if (response.requires2FA) {
        setRequires2FA(true);
        toast({
          title: "التحقق بخطوتين مطلوب",
          description: "يرجى إدخال رمز التحقق من تطبيق المصادقة",
        });
        return;
      }

      // Fetch user data to verify staff access and determine redirect
      const userData = await queryClient.fetchQuery<User>({
        queryKey: ["/api/auth/user"],
      });

      // Verify user is staff
      if (!isStaff(userData)) {
        toast({
          variant: "destructive",
          title: "خطأ في الصلاحيات",
          description: "هذه البوابة مخصصة للإدارة والصحفيين فقط",
        });
        window.location.href = "/";
        return;
      }

      toast({
        title: "مرحباً بك!",
        description: "تم تسجيل الدخول بنجاح",
      });

      // Redirect to dashboard
      window.location.href = "/dashboard";
    } catch (error: any) {
      toast({
        title: "فشل تسجيل الدخول",
        description: error.message || "البريد الإلكتروني أو كلمة المرور غير صحيحة",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    if (useBackupCode ? twoFactorCode.length < 6 : twoFactorCode.length !== 6) return;

    try {
      setIsVerifying2FA(true);
      await apiRequest("/api/2fa/verify", {
        method: "POST",
        body: JSON.stringify(
          useBackupCode 
            ? { backupCode: twoFactorCode } 
            : { token: twoFactorCode }
        ),
      });

      // Fetch user data to verify staff access
      const userData = await queryClient.fetchQuery<User>({
        queryKey: ["/api/auth/user"],
      });

      // Verify user is staff
      if (!isStaff(userData)) {
        toast({
          variant: "destructive",
          title: "خطأ في الصلاحيات",
          description: "هذه البوابة مخصصة للإدارة والصحفيين فقط",
        });
        window.location.href = "/";
        return;
      }

      toast({
        title: "مرحباً بك!",
        description: "تم التحقق بنجاح",
      });

      // Redirect to dashboard
      window.location.href = "/dashboard";
    } catch (error: any) {
      toast({
        title: "خطأ في التحقق",
        description: error.message || (useBackupCode ? "الرمز الاحتياطي غير صحيح" : "رمز التحقق غير صحيح"),
        variant: "destructive",
      });
      setTwoFactorCode("");
    } finally {
      setIsVerifying2FA(false);
    }
  };

  // 2FA Verification Screen
  if (requires2FA) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4" dir="rtl">
        <Card className="w-full max-w-md border-slate-700 bg-slate-900/50 backdrop-blur">
          <CardHeader className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-2 border-2 border-primary/30">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl text-white">التحقق بخطوتين</CardTitle>
            <CardDescription className="text-slate-400 text-right">
              أدخل الرمز المكون من 6 أرقام من تطبيق المصادقة الخاص بك
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-primary/10 border-primary/30 text-right">
              <AlertDescription className="text-sm text-slate-300">
                هذا إجراء أمني إضافي لحماية حسابك الإداري
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <label htmlFor="twoFactorCode" className="text-sm font-medium text-white">
                {useBackupCode ? "الرمز الاحتياطي" : "رمز التحقق"}
              </label>
              <Input
                id="twoFactorCode"
                type="text"
                inputMode={useBackupCode ? "text" : "numeric"}
                maxLength={useBackupCode ? 16 : 6}
                placeholder={useBackupCode ? "XXXX-XXXX-XXXX-XXXX" : "000000"}
                value={twoFactorCode}
                onChange={(e) => {
                  if (useBackupCode) {
                    setTwoFactorCode(e.target.value);
                  } else {
                    setTwoFactorCode(e.target.value.replace(/\D/g, ""));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && twoFactorCode.length >= 6) {
                    handleVerify2FA();
                  }
                }}
                className="text-center text-2xl tracking-[0.5em] bg-slate-800 border-slate-700 text-white placeholder:text-slate-600"
                data-testid="input-2fa-code"
                autoFocus
              />
            </div>

            <Button
              onClick={handleVerify2FA}
              disabled={(useBackupCode ? twoFactorCode.length < 6 : twoFactorCode.length !== 6) || isVerifying2FA}
              className="w-full"
              data-testid="button-verify-2fa"
            >
              {isVerifying2FA && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              تحقق
            </Button>

            <button
              type="button"
              onClick={() => {
                setUseBackupCode(!useBackupCode);
                setTwoFactorCode("");
              }}
              className="w-full text-sm text-primary hover:underline transition-colors"
              data-testid="button-toggle-backup-code"
            >
              {useBackupCode ? "استخدام رمز التحقق من التطبيق" : "استخدام رمز احتياطي"}
            </button>

            <button
              type="button"
              onClick={() => {
                setRequires2FA(false);
                setTwoFactorCode("");
                setUseBackupCode(false);
              }}
              className="w-full text-sm text-slate-400 hover:text-white transition-colors"
            >
              رجوع إلى تسجيل الدخول
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main Admin Login Screen
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4" dir="rtl">
      <Card className="w-full max-w-md border-slate-700 bg-slate-900/50 backdrop-blur">
        <CardHeader className="space-y-3 text-center">
          <div className="flex justify-center mb-2">
            <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center border-2 border-primary/30">
              <Shield className="w-10 h-10 text-primary" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold text-white">لوحة تحكم سبق</CardTitle>
          <CardDescription className="text-slate-400">
            تسجيل دخول الإدارة والصحفيين
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-6 bg-primary/10 border-primary/30 text-right">
            <AlertDescription className="text-sm text-slate-300">
              هذه البوابة مخصصة للإدارة والصحفيين فقط. جميع محاولات الدخول يتم تسجيلها ومراقبتها.
            </AlertDescription>
          </Alert>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">البريد الإلكتروني</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="admin@sabq.sa"
                        disabled={isLoading}
                        data-testid="input-admin-email"
                        className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-600"
                        dir="ltr"
                      />
                    </FormControl>
                    <FormMessage className="text-right" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-white">كلمة المرور</FormLabel>
                      <button
                        type="button"
                        onClick={() => navigate("/admin/forgot-password")}
                        className="text-sm text-primary hover:underline"
                        data-testid="link-admin-forgot-password"
                      >
                        نسيت كلمة المرور؟
                      </button>
                    </div>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="••••••••"
                        disabled={isLoading}
                        data-testid="input-admin-password"
                        className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-600"
                        dir="ltr"
                      />
                    </FormControl>
                    <FormMessage className="text-right" />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                data-testid="button-admin-login"
              >
                {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                {isLoading ? "جاري تسجيل الدخول..." : "دخول"}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="text-sm text-slate-400 hover:text-white transition-colors"
              data-testid="link-back-to-home"
            >
              العودة إلى الصفحة الرئيسية
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
