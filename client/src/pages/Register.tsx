import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { SiApple } from "react-icons/si";
import { ChevronLeft, Eye, EyeOff, Loader2, AlertCircle, Bookmark, Bell, Sparkles, History, Crown, Zap } from "lucide-react";
import { GoogleIcon } from "@/components/GoogleIcon";
import sabqLogo from "@assets/sabq-logo.png";

const registerSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
  confirmPassword: z.string(),
  firstName: z.string().min(2, "الاسم الأول مطلوب"),
  lastName: z.string().min(2, "الاسم الأخير مطلوب"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "كلمة المرور غير متطابقة",
  path: ["confirmPassword"],
});

type RegisterFormData = z.infer<typeof registerSchema>;

const membershipBenefits = [
  {
    icon: Sparkles,
    title: "توصيات ذكية",
    description: "محتوى مخصص يناسب اهتماماتك"
  },
  {
    icon: Bookmark,
    title: "حفظ المقالات",
    description: "احفظ ما يعجبك للقراءة لاحقاً"
  },
  {
    icon: History,
    title: "أكمل قراءتك",
    description: "استمر من حيث توقفت"
  },
  {
    icon: Bell,
    title: "تنبيهات فورية",
    description: "كن أول من يعرف الأخبار العاجلة"
  },
  {
    icon: Crown,
    title: "تجربة بلا إعلانات",
    description: "تصفح نظيف وسريع"
  },
  {
    icon: Zap,
    title: "ملخصات ذكية",
    description: "اقرأ الخلاصة في ثوانٍ"
  },
];

export default function Register() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    
    try {
      await apiRequest("/api/register", {
        method: "POST",
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          firstName: data.firstName,
          lastName: data.lastName,
        }),
      });

      toast({
        title: "تم إنشاء الحساب بنجاح",
        description: "يمكنك الآن تسجيل الدخول",
      });

      navigate("/onboarding/welcome");
    } catch (error: any) {
      setIsLoading(false);
      console.error("[Register] Error:", error);
      toast({
        title: "فشل إنشاء الحساب",
        description: error.message || "حدث خطأ ما. يرجى المحاولة مرة أخرى",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="relative min-h-screen bg-background" dir="rtl">
      <div className="flex flex-col lg:flex-row min-h-screen">
        {/* Right Side - Form Content */}
        <div className="flex flex-col w-full lg:w-1/2 overflow-y-auto px-4 sm:px-6 md:px-8">
          <div className="flex flex-col flex-1 overflow-y-auto">
            {/* Back Button */}
            <div className="w-full max-w-md pt-6 mx-auto mb-4">
              <Link 
                href="/" 
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-back-home"
              >
                <ChevronLeft className="h-5 w-5 ml-1" />
                العودة للرئيسية
              </Link>
            </div>
            
            {/* Logo - Mobile Only */}
            <div className="lg:hidden w-full max-w-md mx-auto mb-6">
              <div className="flex justify-center">
                <img 
                  src={sabqLogo} 
                  alt="سبق" 
                  className="h-12 sm:h-14"
                  loading="lazy"
                  data-testid="img-logo-mobile"
                />
              </div>
            </div>

            {/* Membership Benefits - Mobile Only */}
            <div className="lg:hidden w-full max-w-md mx-auto mb-6">
              <div className="bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 rounded-xl p-4 border border-primary/10">
                <h3 className="text-sm font-semibold text-center mb-3 text-foreground">
                  مميزات العضوية
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {membershipBenefits.slice(0, 4).map((benefit, index) => (
                    <div 
                      key={index}
                      className="flex items-center gap-2 p-2 rounded-lg bg-background/60"
                    >
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                        <benefit.icon className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <span className="text-xs font-medium text-foreground line-clamp-1">
                        {benefit.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto pb-10">
              <div className="mb-4 sm:mb-6">
                <h1 className="mb-1.5 sm:mb-2 font-semibold text-gray-800 text-xl sm:text-2xl dark:text-white/90 text-right">
                  إنشاء حساب
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground text-right">
                  انضم إلينا واستمتع بتجربة قراءة مميزة
                </p>
              </div>
              
              <div className="space-y-3 sm:space-y-4">
                <div className="grid grid-cols-1 gap-2.5 sm:gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.location.href = '/api/auth/google'}
                    className="w-full inline-flex items-center justify-center gap-2 sm:gap-3"
                    data-testid="button-google-register"
                  >
                    <GoogleIcon />
                    إنشاء حساب عبر Google
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.location.href = '/api/auth/apple'}
                    className="w-full inline-flex items-center justify-center gap-2 sm:gap-3"
                    data-testid="button-apple-register"
                  >
                    <SiApple className="h-4 w-4 sm:h-5 sm:w-5" />
                    إنشاء حساب عبر Apple
                  </Button>
                </div>

                <div className="relative my-4 sm:my-5">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-200 dark:border-gray-700" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">أو</span>
                  </div>
                </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 sm:space-y-4">
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>الاسم الأول</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="محمد"
                              disabled={isLoading}
                              data-testid="input-firstName"
                              className="text-right"
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
                          <FormLabel>الاسم الأخير</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="أحمد"
                              disabled={isLoading}
                              data-testid="input-lastName"
                              className="text-right"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

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
                            placeholder="email@example.com"
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
                        <FormLabel>كلمة المرور</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              {...field}
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••"
                              disabled={isLoading}
                              data-testid="input-password"
                              dir="ltr"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>تأكيد كلمة المرور</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              {...field}
                              type={showConfirmPassword ? "text" : "password"}
                              placeholder="••••••"
                              disabled={isLoading}
                              data-testid="input-confirmPassword"
                              dir="ltr"
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              data-testid="button-toggle-confirmPassword"
                            >
                              {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-2 sm:space-y-3">
                    <div className="flex items-start gap-2 sm:gap-2.5 p-2.5 sm:p-3 rounded-lg border border-primary/20 bg-primary/5">
                      <Checkbox
                        id="terms-checkbox"
                        checked={termsAccepted}
                        onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                        data-testid="checkbox-terms"
                        className="mt-0.5"
                      />
                      <label 
                        htmlFor="terms-checkbox"
                        className="text-sm text-foreground cursor-pointer leading-relaxed"
                      >
                        بإنشاء حساب، أنت توافق على{" "}
                        <Link 
                          to="/terms" 
                          className="text-primary font-medium hover:underline"
                          data-testid="link-terms"
                        >
                          الشروط والأحكام
                        </Link>
                        {" "}و{" "}
                        <Link 
                          to="/privacy" 
                          className="text-primary font-medium hover:underline"
                          data-testid="link-privacy"
                        >
                          سياسة الخصوصية
                        </Link>
                      </label>
                    </div>

                    {!termsAccepted && (
                      <div className="flex items-center justify-center gap-1.5 text-xs text-amber-600 dark:text-amber-500 px-2">
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                        <p>يجب الموافقة على الشروط والأحكام لإنشاء الحساب</p>
                      </div>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full min-h-11 text-base font-medium"
                    disabled={isLoading || !termsAccepted}
                    data-testid="button-register"
                  >
                    {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                    {isLoading ? "جاري إنشاء الحساب..." : "إنشاء حساب"}
                  </Button>
                </form>
              </Form>
              </div>
              
              <div className="mt-5">
                <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400">
                  لديك حساب بالفعل؟{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/login")}
                    className="text-primary hover:underline font-medium"
                    data-testid="link-login"
                  >
                    تسجيل الدخول
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Left Side - Branding Panel with Benefits (hidden on mobile) */}
        <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-[#4A90E2] via-[#5B9FED] to-[#6DAEF8] items-center justify-center p-8">
          <div className="text-center text-white space-y-8 max-w-md">
            {/* Logo */}
            <img 
              src={sabqLogo} 
              alt="سبق" 
              className="w-40 xl:w-48 mx-auto brightness-0 invert"
              style={{ filter: 'brightness(0) invert(1)' }}
              loading="lazy"
              data-testid="img-logo-desktop"
            />
            
            {/* Tagline */}
            <div className="space-y-2">
              <h2 className="text-xl xl:text-2xl font-semibold">حيث تلتقي الثقة بالمصداقية</h2>
              <p className="text-base xl:text-lg opacity-90">صحافة ذكية. مستقبل مشرق.</p>
            </div>

            {/* Membership Benefits */}
            <div className="pt-4 border-t border-white/20">
              <h3 className="text-lg font-semibold mb-5">مميزات العضوية</h3>
              <div className="grid grid-cols-2 gap-3">
                {membershipBenefits.map((benefit, index) => (
                  <div 
                    key={index}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white/10 backdrop-blur-sm hover:bg-white/15 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                      <benefit.icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">{benefit.title}</p>
                      <p className="text-xs text-white/70 mt-0.5">{benefit.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
