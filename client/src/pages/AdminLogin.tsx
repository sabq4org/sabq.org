import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isStaff, type User } from "@/hooks/useAuth";
import { Shield, ShieldCheck, KeyRound, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

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
      <AuthLayout footer={<p>جميع محاولات الدخول تُسجَّل وتُراقَب.</p>}>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {useBackupCode ? <KeyRound className="h-7 w-7" /> : <ShieldCheck className="h-7 w-7" />}
          </div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">التحقق بخطوتين</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {useBackupCode
              ? "أدخل أحد رموزك الاحتياطية — كل رمز يُستخدم مرة واحدة."
              : "أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة."}
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="twoFactorCode" className="block text-right text-sm font-medium">
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
              className="text-center font-mono text-2xl tracking-[0.4em]"
              dir="ltr"
              data-testid="input-2fa-code"
              autoFocus
            />
          </div>

          <Button
            onClick={handleVerify2FA}
            disabled={(useBackupCode ? twoFactorCode.length < 6 : twoFactorCode.length !== 6) || isVerifying2FA}
            className="min-h-11 w-full text-base font-medium"
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
            className="w-full text-sm text-primary hover:underline"
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
            className="w-full text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            رجوع إلى تسجيل الدخول
          </button>
        </div>
      </AuthLayout>
    );
  }

  // Main Admin Login Screen
  return (
    <AuthLayout
      footer={
        <>
          <p>
            لست من الإدارة؟{" "}
            <Link href="/login" className="text-primary hover:underline">تسجيل دخول القرّاء</Link>
          </p>
          <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="transition-colors hover:text-foreground"
              data-testid="link-back-to-home"
            >
              العودة للرئيسية
            </button>
            <span>جميع محاولات الدخول تُسجَّل وتُراقَب.</span>
          </p>
        </>
      }
    >
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Shield className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">بوابة الإدارة والصحفيين</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">سجّل دخولك للوصول إلى لوحة التحكم.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>البريد الإلكتروني</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    placeholder="admin@sabq.sa"
                    disabled={isLoading}
                    data-testid="input-admin-email"
                    className="text-base"
                    dir="ltr"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>كلمة المرور</FormLabel>
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
                    className="text-base"
                    dir="ltr"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="min-h-11 w-full text-base font-medium"
            disabled={isLoading}
            data-testid="button-admin-login"
          >
            {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            {isLoading ? "جاري تسجيل الدخول..." : "دخول"}
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
}
