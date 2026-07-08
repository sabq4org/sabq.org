import { useState, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getDefaultRedirectPath, type User } from "@/hooks/useAuth";
import { SiApple } from "react-icons/si";
import { ChevronLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { GoogleIcon } from "@/components/GoogleIcon";
import { trackLogin } from "@/lib/analytics";

const loginSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    
    try {
      const response = await apiRequest("/api/login", {
        method: "POST",
        body: JSON.stringify(data),
      });
      
      // Check if 2FA is required
      if (response.mustChangePassword) {
        setIsLoading(false);
        toast({
          title: "تغيير كلمة المرور مطلوب",
          description: "يجب عليك تعيين كلمة مرور جديدة للمتابعة",
        });
        navigate("/set-password");
        return;
      }

      if (response.requires2FA) {
        setIsLoading(false);
        toast({
          title: "التحقق بخطوتين مطلوب",
          description: "يرجى استخدام صفحة تسجيل دخول الإدارة",
        });
        navigate("/admin/login");
        return;
      }

      await completeLogin("email");
    } catch (error: any) {
      setIsLoading(false);
      toast({
        title: "فشل تسجيل الدخول",
        description: error.message || "البريد الإلكتروني أو كلمة المرور غير صحيحة",
        variant: "destructive",
      });
    }
  };

  // بعد أي مسار دخول ناجح: جلب المستخدم + إعادة التوجيه الذكي حسب الدور.
  const completeLogin = async (method: string) => {
    const userData = await queryClient.fetchQuery<User>({
      queryKey: ["/api/auth/user"],
      staleTime: 0,
    });
    toast({ title: "مرحباً بك!", description: "تم تسجيل الدخول بنجاح" });
    trackLogin(method);
    navigate(getDefaultRedirectPath(userData));
  };

  // ===== دخول/تسجيل بالجوال (OTP) =====
  const [authTab, setAuthTab] = useState<"phone" | "email">("phone");
  const [phoneStep, setPhoneStep] = useState<"phone" | "code">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [resend, setResend] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const phoneValid = /^5\d{8}$/.test(phoneNumber);

  const startResend = () => {
    setResend(60);
    const t = setInterval(() => {
      setResend((r) => {
        if (r <= 1) { clearInterval(t); return 0; }
        return r - 1;
      });
    }, 1000);
  };

  const sendPhoneCode = async () => {
    if (!phoneValid) {
      toast({ title: "رقم غير صحيح", description: "أدخل رقم جوال سعودي يبدأ بـ5.", variant: "destructive" });
      return;
    }
    setPhoneLoading(true);
    try {
      await apiRequest("/api/auth/phone/send", { method: "POST", body: JSON.stringify({ phone: phoneNumber }) });
      setPhoneStep("code");
      setOtp("");
      startResend();
      setTimeout(() => otpRefs.current[0]?.focus(), 60);
    } catch (error: any) {
      toast({ title: "تعذّر الإرسال", description: error.message || "حاول مرة أخرى", variant: "destructive" });
    }
    setPhoneLoading(false);
  };

  const verifyPhoneCode = async (codeVal?: string) => {
    const code = (codeVal ?? otp).replace(/\D/g, "");
    if (code.length !== 6) return;
    setPhoneLoading(true);
    try {
      await apiRequest("/api/auth/phone/verify", { method: "POST", body: JSON.stringify({ phone: phoneNumber, code }) });
      await completeLogin("phone");
    } catch (error: any) {
      toast({ title: "فشل التحقق", description: error.message || "الرمز غير صحيح أو منتهي", variant: "destructive" });
      setPhoneLoading(false);
    }
  };

  // خانات الرمز: box 0 يقبل التعبئة الآلية (one-time-code) ويوزّع 6 أرقام.
  const handleOtpChange = (i: number, raw: string) => {
    const v = raw.replace(/\D/g, "");
    if (v.length > 1) {
      const full = v.slice(0, 6);
      setOtp(full);
      otpRefs.current[Math.min(full.length, 5)]?.focus();
      if (full.length === 6) verifyPhoneCode(full);
      return;
    }
    const next = (otp.slice(0, i) + v).slice(0, 6);
    setOtp(next);
    if (v && i < 5) otpRefs.current[i + 1]?.focus();
    if (next.length === 6) verifyPhoneCode(next);
  };

  const handleOtpKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
      setOtp(otp.slice(0, i - 1));
    }
  };

  return (
    <AuthLayout>
      <div className="flex flex-col flex-1">
        <div className="w-full max-w-md pt-10 mx-auto">
          <Link 
            href="/" 
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-back-home"
          >
            <ChevronLeft className="h-5 w-5 ml-1" />
            العودة للرئيسية
          </Link>
        </div>
        
        <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm sm:text-title-md dark:text-white/90 text-right">
              تسجيل الدخول
            </h1>
            <p className="text-sm text-muted-foreground text-right">
              سجّل دخولك برقم جوالك أو بريدك الإلكتروني.
            </p>
          </div>
          
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  trackLogin("google");
                  window.location.href = '/api/auth/google';
                }}
                className="w-full inline-flex items-center justify-center gap-2 sm:gap-3"
                data-testid="button-google-login"
              >
                <GoogleIcon />
                تسجيل الدخول عبر Google
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  trackLogin("apple");
                  window.location.href = '/api/auth/apple';
                }}
                className="w-full inline-flex items-center justify-center gap-2 sm:gap-3"
                data-testid="button-apple-login"
              >
                <SiApple className="h-4 w-4 sm:h-5 sm:w-5" />
                تسجيل الدخول عبر Apple
              </Button>
            </div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200 dark:border-gray-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">أو</span>
              </div>
            </div>

          {/* تبويبات الدخول: الجوال / البريد */}
          <div className="flex p-1 rounded-lg bg-muted mb-5">
            {([["phone", "الجوال"], ["email", "البريد الإلكتروني"]] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setAuthTab(k)}
                className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${authTab === k ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                data-testid={`tab-${k}`}
              >
                {label}
              </button>
            ))}
          </div>

          {authTab === "phone" ? (
            <div className="space-y-4">
              {phoneStep === "phone" ? (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-right">رقم الجوال</label>
                    {/* خانة LTR: المفتاح +966 يسار، الرقم يمينه */}
                    <div dir="ltr" className="flex items-stretch rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:border-ring transition">
                      <span className="flex items-center gap-1.5 px-3 bg-muted/60 text-sm font-semibold border-r border-input select-none whitespace-nowrap">
                        🇸🇦 +966
                      </span>
                      <input
                        dir="ltr"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        maxLength={9}
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 9))}
                        onKeyDown={(e) => { if (e.key === "Enter" && phoneValid) sendPhoneCode(); }}
                        placeholder="5XXXXXXXX"
                        disabled={phoneLoading}
                        data-testid="input-phone"
                        className="flex-1 min-w-0 px-3 py-2.5 bg-transparent outline-none text-base tracking-widest placeholder:tracking-normal placeholder:text-muted-foreground"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 text-right">سنرسل رمز تحقّق برسالة نصية إلى جوالك.</p>
                  </div>
                  <Button type="button" onClick={sendPhoneCode} disabled={!phoneValid || phoneLoading} className="w-full min-h-11 text-base font-medium" data-testid="button-send-otp">
                    {phoneLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                    إرسال رمز التحقق
                  </Button>
                </>
              ) : (
                <>
                  <div className="text-center space-y-1">
                    <p className="text-sm text-muted-foreground">أدخل رمز التحقق المُرسل إلى</p>
                    <p dir="ltr" className="text-sm font-bold">
                      +966 {phoneNumber}
                      <button type="button" onClick={() => { setPhoneStep("phone"); setOtp(""); }} className="text-primary hover:underline text-xs mr-2">تعديل</button>
                    </p>
                  </div>
                  <div dir="ltr" className="flex items-center justify-center gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <input
                        key={i}
                        ref={(el) => (otpRefs.current[i] = el)}
                        inputMode="numeric"
                        autoComplete={i === 0 ? "one-time-code" : "off"}
                        maxLength={i === 0 ? 6 : 1}
                        value={otp[i] ?? ""}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKey(i, e)}
                        disabled={phoneLoading}
                        data-testid={`input-otp-${i}`}
                        className="w-11 h-14 text-center text-xl font-bold rounded-lg border border-input bg-background outline-none focus:border-ring focus:ring-2 focus:ring-ring transition"
                      />
                    ))}
                  </div>
                  <Button type="button" onClick={() => verifyPhoneCode()} disabled={otp.length !== 6 || phoneLoading} className="w-full min-h-11 text-base font-medium" data-testid="button-verify-otp">
                    {phoneLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                    تحقّق ودخول
                  </Button>
                  <div className="text-center">
                    {resend > 0 ? (
                      <p className="text-xs text-muted-foreground">إعادة الإرسال خلال {resend} ثانية</p>
                    ) : (
                      <button type="button" onClick={sendPhoneCode} className="text-sm text-primary hover:underline font-medium">إعادة إرسال الرمز</button>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
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
                        data-testid="input-email"
                        className="text-right"
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
                      <Link 
                        to="/forgot-password" 
                        className="text-sm text-primary hover:underline"
                        data-testid="link-forgot-password"
                      >
                        نسيت كلمة المرور؟
                      </Link>
                    </div>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••"
                          disabled={isLoading}
                          data-testid="input-password"
                          dir="ltr"
                          className="pl-11"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground pointer-events-auto"
                          aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                          data-testid="button-toggle-password"
                        >
                          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full min-h-11 text-base font-medium"
                disabled={isLoading}
                data-testid="button-login"
              >
                {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                {isLoading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
              </Button>

            </form>
          </Form>
          )}
          </div>

          <div className="mt-5">
            <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400">
              ليس لديك حساب؟{" "}
              <button
                type="button"
                onClick={() => navigate("/register")}
                className="text-primary hover:underline font-medium"
                data-testid="link-register"
              >
                إنشاء حساب جديد
              </button>
            </p>
          </div>
          
          <div className="text-center pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-muted-foreground mb-2">هل أنت من الإدارة أو الصحفيين؟</p>
            <button
              type="button"
              onClick={() => navigate("/admin/login")}
              className="text-sm text-primary hover:underline font-medium"
              data-testid="link-admin-login"
            >
              تسجيل دخول الإدارة
            </button>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
