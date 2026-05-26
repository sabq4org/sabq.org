import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ShieldCheck, Loader2, Key, AlertTriangle, Smartphone, MessageSquare, ChevronLeft } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

const verifySchema = z.object({
  token: z.string().min(1, "الرمز مطلوب"),
});

type VerifyFormData = z.infer<typeof verifySchema>;

export default function TwoFactorVerify() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [verificationMethod, setVerificationMethod] = useState<'authenticator' | 'sms'>('authenticator');
  const [smsSent, setSmsSent] = useState(false);
  const [sendingSMS, setSendingSMS] = useState(false);
  const [userMethod, setUserMethod] = useState<string | null>(null);

  const sendSMSOTP = async () => {
    try {
      setSendingSMS(true);
      await apiRequest("/api/2fa/send-sms", {
        method: "POST",
        body: JSON.stringify({}),
      });

      setSmsSent(true);
      toast({
        title: "تم الإرسال",
        description: "تم إرسال رمز التحقق إلى رقم جوالك",
      });
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إرسال رمز التحقق",
        variant: "destructive",
      });
    } finally {
      setSendingSMS(false);
    }
  };

  useEffect(() => {
    let redirectTimer: ReturnType<typeof setTimeout>;

    const fetchUserMethod = async () => {
      try {
        const response = await fetch('/api/2fa/pending-method');
        if (!response.ok) {
          throw new Error('فشل في الحصول على طريقة التحقق');
        }

        const data = await response.json();
        setUserMethod(data.method);

        if (data.method === 'sms' || data.method === 'both') {
          setVerificationMethod('sms');
          if (data.method === 'sms') {
            sendSMSOTP();
          }
        } else {
          setVerificationMethod('authenticator');
        }
      } catch (error) {
        console.error('Failed to fetch user 2FA method:', error);
        toast({
          title: "خطأ",
          description: "فشل في تحميل بيانات التحقق. يرجى المحاولة مرة أخرى",
          variant: "destructive",
        });
        redirectTimer = setTimeout(() => {
          window.location.href = "/login";
        }, 2000);
      }
    };

    fetchUserMethod();
    return () => clearTimeout(redirectTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const form = useForm<VerifyFormData>({
    resolver: zodResolver(verifySchema),
    defaultValues: {
      token: "",
    },
  });

  const onSubmit = async (data: VerifyFormData) => {
    try {
      setIsLoading(true);
      
      let endpoint = "/api/2fa/verify";
      let requestBody: any = {};

      if (useBackupCode) {
        requestBody = { backupCode: data.token };
      } else if (verificationMethod === 'sms') {
        endpoint = "/api/2fa/verify-sms";
        requestBody = { code: data.token };
      } else {
        requestBody = { token: data.token };
      }
      
      await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      toast({
        title: "تم التحقق بنجاح",
        description: "مرحباً بك في سبق الذكية",
      });

      // Redirect to dashboard
      window.location.href = "/dashboard";
    } catch (error: any) {
      const errorMessage = error?.message || "";
      const isSessionExpired =
        errorMessage.includes("الجلسة منتهية") ||
        errorMessage.includes("غير مصرح");

      if (isSessionExpired) {
        toast({
          title: "انتهت الجلسة",
          description: "سيتم إعادة توجيهك لتسجيل الدخول من جديد...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 1500);
        return;
      }

      toast({
        title: "فشل التحقق",
        description: errorMessage || (useBackupCode 
          ? "الرمز الاحتياطي غير صحيح أو مستخدم مسبقاً"
          : "الرمز غير صحيح"),
        variant: "destructive",
      });
      
      // Reset the form on error
      form.reset();
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleBackupCode = () => {
    setUseBackupCode(!useBackupCode);
    form.reset();
  };

  const handleMethodChange = (value: string) => {
    const method = value as 'authenticator' | 'sms';
    setVerificationMethod(method);
    setUseBackupCode(false);
    form.reset();
    
    // Auto-send SMS when switching to SMS method
    if (method === 'sms' && !smsSent) {
      sendSMSOTP();
    }
  };

  return (
    <AuthLayout>
      <div className="flex flex-col flex-1">
        <div className="w-full max-w-md pt-10 mx-auto">
          <Link 
            href="/login" 
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-back-login"
          >
            <ChevronLeft className="h-5 w-5 ml-1" />
            العودة لتسجيل الدخول
          </Link>
        </div>
        
        <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
          <div className="mb-5 sm:mb-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
                {useBackupCode ? (
                  <Key className="w-8 h-8 text-primary-foreground" />
                ) : (
                  <ShieldCheck className="w-8 h-8 text-primary-foreground" />
                )}
              </div>
            </div>
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm sm:text-title-md dark:text-white/90">
              التحقق بخطوتين
            </h1>
            <p className="text-sm text-muted-foreground">
              {useBackupCode 
                ? "أدخل أحد رموزك الاحتياطية للمتابعة"
                : "اختر طريقة التحقق المناسبة لك"
              }
            </p>
          </div>

          {!useBackupCode ? (
            <Tabs value={verificationMethod} onValueChange={handleMethodChange} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="authenticator" data-testid="tab-authenticator">
                  <Smartphone className="h-4 w-4 ml-2" />
                  تطبيق المصادقة
                </TabsTrigger>
                <TabsTrigger value="sms" data-testid="tab-sms">
                  <MessageSquare className="h-4 w-4 ml-2" />
                  رسالة SMS
                </TabsTrigger>
              </TabsList>

              <TabsContent value="authenticator">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="token"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>رمز التحقق من التطبيق</FormLabel>
                          <FormControl>
                            <div className="flex justify-center" dir="ltr">
                              <InputOTP
                                maxLength={6}
                                value={field.value}
                                onChange={field.onChange}
                                disabled={isLoading}
                                data-testid="input-authenticator-token"
                              >
                                <InputOTPGroup>
                                  <InputOTPSlot index={0} />
                                  <InputOTPSlot index={1} />
                                  <InputOTPSlot index={2} />
                                  <InputOTPSlot index={3} />
                                  <InputOTPSlot index={4} />
                                  <InputOTPSlot index={5} />
                                </InputOTPGroup>
                              </InputOTP>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        الرمز صالح لمدة 30 ثانية فقط
                      </AlertDescription>
                    </Alert>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isLoading}
                      data-testid="button-verify-authenticator"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                          جاري التحقق...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="ml-2 h-4 w-4" />
                          تحقق
                        </>
                      )}
                    </Button>

                    <div className="text-center">
                      <button
                        type="button"
                        onClick={handleToggleBackupCode}
                        className="text-sm text-primary hover:underline"
                        disabled={isLoading}
                        data-testid="link-use-backup-code"
                      >
                        استخدام رمز احتياطي بدلاً من ذلك
                      </button>
                    </div>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="sms">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    {!smsSent ? (
                      <>
                        <Alert>
                          <MessageSquare className="h-4 w-4" />
                          <AlertDescription>
                            سيتم إرسال رمز التحقق إلى رقم جوالك المسجل
                          </AlertDescription>
                        </Alert>
                        <Button
                          type="button"
                          onClick={sendSMSOTP}
                          className="w-full"
                          disabled={sendingSMS}
                          data-testid="button-send-sms"
                        >
                          {sendingSMS ? (
                            <>
                              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                              جاري الإرسال...
                            </>
                          ) : (
                            <>
                              <MessageSquare className="ml-2 h-4 w-4" />
                              إرسال رمز التحقق
                            </>
                          )}
                        </Button>
                      </>
                    ) : (
                      <>
                        <FormField
                          control={form.control}
                          name="token"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>رمز التحقق من الرسالة</FormLabel>
                              <FormControl>
                                <div className="flex justify-center" dir="ltr">
                                  <InputOTP
                                    maxLength={6}
                                    value={field.value}
                                    onChange={field.onChange}
                                    disabled={isLoading}
                                    data-testid="input-sms-token"
                                  >
                                    <InputOTPGroup>
                                      <InputOTPSlot index={0} />
                                      <InputOTPSlot index={1} />
                                      <InputOTPSlot index={2} />
                                      <InputOTPSlot index={3} />
                                      <InputOTPSlot index={4} />
                                      <InputOTPSlot index={5} />
                                    </InputOTPGroup>
                                  </InputOTP>
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Alert>
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            الرمز صالح لمدة 10 دقائق
                          </AlertDescription>
                        </Alert>

                        <Button
                          type="submit"
                          className="w-full"
                          disabled={isLoading}
                          data-testid="button-verify-sms"
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                              جاري التحقق...
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="ml-2 h-4 w-4" />
                              تحقق
                            </>
                          )}
                        </Button>

                        <div className="text-center">
                          <button
                            type="button"
                            onClick={sendSMSOTP}
                            className="text-sm text-primary hover:underline"
                            disabled={sendingSMS}
                            data-testid="link-resend-sms"
                          >
                            {sendingSMS ? "جاري الإرسال..." : "إعادة إرسال الرمز"}
                          </button>
                        </div>
                      </>
                    )}

                    <div className="text-center">
                      <button
                        type="button"
                        onClick={handleToggleBackupCode}
                        className="text-sm text-primary hover:underline"
                        disabled={isLoading}
                        data-testid="link-use-backup-code-sms"
                      >
                        استخدام رمز احتياطي بدلاً من ذلك
                      </button>
                    </div>
                  </form>
                </Form>
              </TabsContent>
            </Tabs>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="token"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الرمز الاحتياطي</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          placeholder="أدخل الرمز الاحتياطي"
                          disabled={isLoading}
                          data-testid="input-backup-code"
                          dir="ltr"
                          className="font-mono text-center"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    كل رمز احتياطي يمكن استخدامه مرة واحدة فقط
                  </AlertDescription>
                </Alert>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                  data-testid="button-verify-backup"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      جاري التحقق...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="ml-2 h-4 w-4" />
                      تحقق
                    </>
                  )}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleToggleBackupCode}
                    className="text-sm text-primary hover:underline"
                    disabled={isLoading}
                    data-testid="link-back-to-methods"
                  >
                    العودة إلى طرق التحقق
                  </button>
                </div>
              </form>
            </Form>
          )}
          
          <div className="mt-5">
            <div className="text-center text-sm text-muted-foreground">
              <button
                type="button"
                onClick={() => {
                  // Logout and return to login page
                  window.location.href = "/login";
                }}
                className="text-primary hover:underline"
                data-testid="link-back-to-login"
              >
                العودة إلى تسجيل الدخول
              </button>
            </div>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
