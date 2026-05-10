import { useState } from "react";
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

      // Fetch user data to determine redirect path
      const userData = await queryClient.fetchQuery<User>({
        queryKey: ["/api/auth/user"],
      });

      toast({
        title: "مرحباً بك!",
        description: "تم تسجيل الدخول بنجاح",
      });

      // Smart redirect based on user role
      const redirectPath = getDefaultRedirectPath(userData);
      navigate(redirectPath);
    } catch (error: any) {
      setIsLoading(false);
      toast({
        title: "فشل تسجيل الدخول",
        description: error.message || "البريد الإلكتروني أو كلمة المرور غير صحيحة",
        variant: "destructive",
      });
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
              أدخل بريدك الإلكتروني وكلمة المرور لتسجيل الدخول!
            </p>
          </div>
          
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.href = '/api/auth/google'}
                className="w-full inline-flex items-center justify-center gap-2 sm:gap-3"
                data-testid="button-google-login"
              >
                <GoogleIcon />
                تسجيل الدخول عبر Google
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.href = '/api/auth/apple'}
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
