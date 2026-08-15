import { useEffect, useState, useRef } from "react";
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
import { Eye, EyeOff, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { GoogleIcon } from "@/components/GoogleIcon";
import { trackLogin } from "@/lib/analytics";
import { consumePostAuthReturn, rememberPostAuthReturn } from "@/lib/postAuthRedirect";

const loginSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

type LoginFormData = z.infer<typeof loginSchema>;

// إكمال تسجيل رقم جوال جديد بعد نجاح OTP — يطابق سياسة الخادم.
const phoneRegisterSchema = z
  .object({
    firstName: z.string().trim().min(2, "الاسم الأول يجب أن يكون حرفين على الأقل").max(60),
    lastName: z.string().trim().max(60).optional().or(z.literal("")),
    email: z.string().trim().email("البريد الإلكتروني غير صحيح"),
    password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل").max(128),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirmPassword"],
  });

type PhoneRegisterFormData = z.infer<typeof phoneRegisterSchema>;

export default function Login() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("returnTo");
    if (requested) rememberPostAuthReturn(requested);
    // توافق مع آلية انتهاء الجلسة القديمة في queryClient.
    try {
      const legacy = localStorage.getItem("redirectAfterLogin");
      if (legacy) {
        rememberPostAuthReturn(legacy);
        localStorage.removeItem("redirectAfterLogin");
      }
    } catch {
      // التخزين قد يكون محجوبًا في وضع التصفح الخاص.
    }
  }, []);

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

      if (response.mustChangePassword) {
        setIsLoading(false);
        toast({
          title: "تغيير كلمة المرور مطلوب",
          description: "يجب عليك تعيين كلمة مرور جديدة للمتابعة",
        });
        navigate("/set-password");
        return;
      }

      // الجلسة تحتفظ بحالة «بانتظار 2FA» — ننتقل مباشرة لشاشة الرمز بلا تسجيل ثانٍ.
      if (response.requires2FA) {
        setIsLoading(false);
        toast({
          title: "التحقق بخطوتين",
          description: "أدخل رمز التحقق لإكمال الدخول",
        });
        navigate("/2fa-verify");
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
    const fallback = getDefaultRedirectPath(userData);
    const mustFinishAccount = fallback === "/complete-name" || userData.isProfileComplete === false;
    navigate(mustFinishAccount ? fallback : consumePostAuthReturn(fallback));
  };

  // ===== دخول/تسجيل بالجوال (OTP) =====
  const [authMethod, setAuthMethod] = useState<"phone" | "email">("phone");
  const [phoneStep, setPhoneStep] = useState<"phone" | "code" | "register">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [resend, setResend] = useState(0);
  // إثبات توثيق الجوال (قصير العمر، أحادي الاستخدام) لرقم جديد بلا حساب.
  const [registrationToken, setRegistrationToken] = useState<string | null>(null);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const registerForm = useForm<PhoneRegisterFormData>({
    resolver: zodResolver(phoneRegisterSchema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "", confirmPassword: "" },
  });

  const phoneValid = /^5\d{8}$/.test(phoneNumber);

  // يقبل الكتابة واللصق بكل الصيغ الشائعة (05XXXXXXXX / 9665XXXXXXXX / +966...)
  // ويحذف البادئات — الخادم يطبّعها أصلًا، لكن الواجهة كانت تقص إلى 9 خانات
  // قبل حذف الصفر فيبقى الزر معطلًا بصمت لمن يكتب رقمه بالصيغة المحلية المعتادة.
  const normalizeSaudiInput = (raw: string) => {
    let d = raw.replace(/\D/g, "");
    if (d.startsWith("00966")) d = d.slice(5);
    else if (d.startsWith("966")) d = d.slice(3);
    if (d.startsWith("0")) d = d.slice(1);
    return d.slice(0, 9);
  };

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
      const resp = await apiRequest<{
        requires2FA?: boolean;
        registrationRequired?: boolean;
        registrationToken?: string;
      }>("/api/auth/phone/verify", { method: "POST", body: JSON.stringify({ phone: phoneNumber, code }) });

      // حساب قائم محمي بـ2FA — نفس مسار الدخول بالبريد.
      if (resp?.requires2FA) {
        setPhoneLoading(false);
        toast({ title: "التحقق بخطوتين", description: "أدخل رمز التحقق لإكمال الدخول" });
        navigate("/2fa-verify");
        return;
      }

      // رقم جديد: الجوال موثق ولا حساب بعد — ننتقل لنموذج إكمال التسجيل.
      if (resp?.registrationRequired && resp.registrationToken) {
        setRegistrationToken(resp.registrationToken);
        setPhoneStep("register");
        setPhoneLoading(false);
        return;
      }

      await completeLogin("phone");
    } catch (error: any) {
      toast({ title: "فشل التحقق", description: error.message || "الرمز غير صحيح أو منتهي", variant: "destructive" });
      setPhoneLoading(false);
    }
  };

  // إنشاء الحساب النهائي بعد توثيق الجوال — لا حساب (ولا بريد وهمي) قبل هذه الخطوة.
  const submitPhoneRegistration = async (data: PhoneRegisterFormData) => {
    if (!registrationToken) return;
    setPhoneLoading(true);
    try {
      await apiRequest("/api/auth/phone/complete-registration", {
        method: "POST",
        body: JSON.stringify({
          registrationToken,
          firstName: data.firstName,
          lastName: data.lastName || undefined,
          email: data.email,
          password: data.password,
          confirmPassword: data.confirmPassword,
        }),
      });
      toast({ title: "تم إنشاء حسابك", description: "أرسلنا رابط تحقق إلى بريدك الإلكتروني" });
      // عضو جديد → نفس onboarding مسجّلي البريد (ترحيب ثم اهتمامات)،
      // بعد تهيئة كاش الجلسة كي لا تعيده الحراس إلى الدخول.
      await queryClient.fetchQuery<User>({ queryKey: ["/api/auth/user"], staleTime: 0 });
      trackLogin("phone");
      navigate("/onboarding/welcome");
    } catch (error: any) {
      setPhoneLoading(false);
      const message: string = error?.message || "تعذّر إكمال التسجيل";
      // انتهاء صلاحية الإثبات أو استهلاكه — يلزم إعادة التحقق من الرقم.
      if (message.includes("انتهت صلاحية")) {
        setRegistrationToken(null);
        setPhoneStep("phone");
        setOtp("");
      }
      toast({ title: "تعذّر إكمال التسجيل", description: message, variant: "destructive" });
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

  const showingOtp = authMethod === "phone" && phoneStep === "code";
  const showingRegister = authMethod === "phone" && phoneStep === "register";

  return (
    <AuthLayout
      footer={
        <>
          <p>
            بتسجيل الدخول أنت توافق على{" "}
            <Link href="/terms" className="text-primary hover:underline">الشروط والأحكام</Link>
            {" "}و{" "}
            <Link href="/privacy" className="text-primary hover:underline">سياسة الخصوصية</Link>
          </p>
          <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={() => navigate("/admin/login")}
              className="transition-colors hover:text-foreground"
              data-testid="link-admin-login"
            >
              دخول الإدارة والصحفيين
            </button>
            <Link href="/" className="transition-colors hover:text-foreground">العودة للرئيسية</Link>
          </p>
        </>
      }
    >
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          {showingRegister ? "أكمل تسجيلك" : showingOtp ? "رمز التحقق" : "تسجيل الدخول"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {showingRegister
            ? "تم توثيق جوالك — نحتاج اسمك وبريدك وكلمة مرور لإنشاء حسابك."
            : showingOtp
            ? "أدخل الرمز المكوّن من 6 أرقام"
            : authMethod === "phone"
              ? "رقم جوالك يكفي — سنرسل لك رمز تحقق."
              : "أدخل بريدك الإلكتروني وكلمة المرور."}
        </p>
      </div>

      {authMethod === "phone" ? (
        phoneStep === "register" ? (
          <Form {...registerForm}>
            <form onSubmit={registerForm.handleSubmit(submitPhoneRegistration)} className="space-y-4">
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-center text-sm" dir="ltr">
                ✓ +966 {phoneNumber}
              </div>
              <p className="text-center text-xs text-muted-foreground">
                هذا الرقم غير مربوط بأي حساب سابق. إن كان لديك حساب بالبريد الإلكتروني،{" "}
                <Link href="/forgot-password" className="font-medium text-primary hover:underline">
                  استعد كلمة مروره من هنا
                </Link>{" "}
                بدل إنشاء حساب جديد.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={registerForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الاسم الأول</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="given-name" placeholder="أحمد" disabled={phoneLoading} data-testid="input-reg-firstName" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={registerForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>العائلة (اختياري)</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="family-name" placeholder="العتيبي" disabled={phoneLoading} data-testid="input-reg-lastName" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={registerForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>البريد الإلكتروني</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" dir="ltr" autoComplete="email" placeholder="example@email.com" disabled={phoneLoading} data-testid="input-reg-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={registerForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>كلمة المرور</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showRegPassword ? "text" : "password"}
                          dir="ltr"
                          autoComplete="new-password"
                          placeholder="••••••••"
                          disabled={phoneLoading}
                          data-testid="input-reg-password"
                          className="pl-11"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPassword(!showRegPassword)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={showRegPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                        >
                          {showRegPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={registerForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>تأكيد كلمة المرور</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" dir="ltr" autoComplete="new-password" placeholder="••••••••" disabled={phoneLoading} data-testid="input-reg-confirmPassword" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={phoneLoading} className="min-h-11 w-full text-base font-medium" data-testid="button-complete-registration">
                {phoneLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                إنشاء الحساب
              </Button>
            </form>
          </Form>
        ) : phoneStep === "phone" ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-right text-sm font-medium">رقم الجوال</label>
              {/* خانة LTR: المفتاح +966 يسار، الرقم يمينه */}
              <div dir="ltr" className="flex items-stretch overflow-hidden rounded-lg border border-input bg-background transition focus-within:border-ring focus-within:ring-2 focus-within:ring-ring">
                <span className="flex select-none items-center gap-1.5 whitespace-nowrap border-r border-input bg-muted/60 px-3 text-sm font-semibold">
                  🇸🇦 +966
                </span>
                <input
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={18}
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(normalizeSaudiInput(e.target.value))}
                  onKeyDown={(e) => { if (e.key === "Enter" && phoneValid) sendPhoneCode(); }}
                  placeholder="5XXXXXXXX"
                  disabled={phoneLoading}
                  data-testid="input-phone"
                  className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base tracking-widest outline-none placeholder:tracking-normal placeholder:text-muted-foreground"
                />
              </div>
            </div>
            <Button type="button" onClick={sendPhoneCode} disabled={!phoneValid || phoneLoading} className="min-h-11 w-full text-base font-medium" data-testid="button-send-otp">
              {phoneLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              متابعة
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1 text-center">
              <p className="text-sm text-muted-foreground">أرسلنا رمز التحقق إلى</p>
              <p dir="ltr" className="text-sm font-bold">
                +966 {phoneNumber}
                <button type="button" onClick={() => { setPhoneStep("phone"); setOtp(""); }} className="mr-2 text-xs text-primary hover:underline">تعديل</button>
              </p>
            </div>
            <div dir="ltr" className="flex items-center justify-center gap-1.5 sm:gap-2">
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
                  className="h-12 w-10 rounded-lg border border-input bg-background text-center text-lg font-bold outline-none transition focus:border-ring focus:ring-2 focus:ring-ring sm:h-14 sm:w-11 sm:text-xl"
                />
              ))}
            </div>
            <Button type="button" onClick={() => verifyPhoneCode()} disabled={otp.length !== 6 || phoneLoading} className="min-h-11 w-full text-base font-medium" data-testid="button-verify-otp">
              {phoneLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              تحقّق ودخول
            </Button>
            <div className="text-center">
              {resend > 0 ? (
                <p className="text-xs text-muted-foreground">إعادة الإرسال خلال {resend} ثانية</p>
              ) : (
                <button type="button" onClick={sendPhoneCode} className="text-sm font-medium text-primary hover:underline">إعادة إرسال الرمز</button>
              )}
            </div>
          </div>
        )
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
                      placeholder="example@email.com"
                      disabled={isLoading}
                      data-testid="input-email"
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
                        className="pl-11 text-base"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="pointer-events-auto absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
              className="min-h-11 w-full text-base font-medium"
              disabled={isLoading}
              data-testid="button-login"
            >
              {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {isLoading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
            </Button>
          </form>
        </Form>
      )}

      {!showingOtp && !showingRegister && (
        <>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-3 text-xs text-muted-foreground">أو المتابعة عبر</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                trackLogin("google");
                window.location.href = '/api/auth/google';
              }}
              className="inline-flex w-full items-center justify-center gap-2"
              data-testid="button-google-login"
            >
              <GoogleIcon />
              Google
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                trackLogin("apple");
                window.location.href = '/api/auth/apple';
              }}
              className="inline-flex w-full items-center justify-center gap-2"
              data-testid="button-apple-login"
            >
              <SiApple className="h-4 w-4" />
              Apple
            </Button>
          </div>

          <div className="mt-4 text-center">
            {authMethod === "phone" ? (
              <button
                type="button"
                onClick={() => setAuthMethod("email")}
                className="text-sm font-medium text-primary hover:underline"
                data-testid="tab-email"
              >
                الدخول بالبريد الإلكتروني
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAuthMethod("phone")}
                className="text-sm font-medium text-primary hover:underline"
                data-testid="tab-phone"
              >
                الدخول برقم الجوال
              </button>
            )}
          </div>

          <div className="mt-6 border-t border-border pt-4 text-center text-sm text-muted-foreground">
            ليس لديك حساب؟{" "}
            <button
              type="button"
              onClick={() => navigate("/register")}
              className="font-medium text-primary hover:underline"
              data-testid="link-register"
            >
              إنشاء حساب جديد
            </button>
          </div>
        </>
      )}
    </AuthLayout>
  );
}
