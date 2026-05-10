import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Shield, ShieldCheck, Copy, Key, Loader2, AlertTriangle, Smartphone, MessageSquare } from "lucide-react";

const enableSchema = z.object({
  token: z.string().length(6, "الرمز يجب أن يكون 6 أرقام"),
});

const disableSchema = z.object({
  password: z.string().min(1, "كلمة المرور مطلوبة"),
  token: z.string().length(6, "الرمز يجب أن يكون 6 أرقام"),
});

const backupCodesSchema = z.object({
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

const methodSchema = z.object({
  method: z.enum(['authenticator', 'sms', 'both']),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

type EnableFormData = z.infer<typeof enableSchema>;
type DisableFormData = z.infer<typeof disableSchema>;
type BackupCodesFormData = z.infer<typeof backupCodesSchema>;
type MethodFormData = z.infer<typeof methodSchema>;

interface TwoFactorStatus {
  enabled: boolean;
  hasBackupCodes: boolean;
  method?: 'authenticator' | 'sms' | 'both';
}

interface SetupResponse {
  secret: string;
  qrCode: string;
}

interface EnableResponse {
  backupCodes: string[];
}

export function TwoFactorSettings() {
  const { toast } = useToast();
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [backupCodesDialogOpen, setBackupCodesDialogOpen] = useState(false);
  const [methodDialogOpen, setMethodDialogOpen] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);

  const { data: status, isLoading: isLoadingStatus } = useQuery<TwoFactorStatus>({
    queryKey: ["/api/2fa/status"],
  });

  const { data: setupData, isLoading: isLoadingSetup, refetch: refetchSetup } = useQuery<SetupResponse>({
    queryKey: ["/api/2fa/setup"],
    enabled: false,
  });

  const enableForm = useForm<EnableFormData>({
    resolver: zodResolver(enableSchema),
    defaultValues: {
      token: "",
    },
  });

  const disableForm = useForm<DisableFormData>({
    resolver: zodResolver(disableSchema),
    defaultValues: {
      password: "",
      token: "",
    },
  });

  const backupCodesForm = useForm<BackupCodesFormData>({
    resolver: zodResolver(backupCodesSchema),
    defaultValues: {
      password: "",
    },
  });

  const methodForm = useForm<MethodFormData>({
    resolver: zodResolver(methodSchema),
    defaultValues: {
      method: status?.method || 'authenticator',
      password: "",
    },
  });

  const setupMutation = useMutation({
    mutationFn: async () => {
      const result = await refetchSetup();
      return result.data;
    },
    onSuccess: () => {
      setSetupDialogOpen(true);
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في إعداد التحقق بخطوتين",
        variant: "destructive",
      });
    },
  });

  const enableMutation = useMutation({
    mutationFn: async (data: EnableFormData) => {
      return await apiRequest("/api/2fa/enable", {
        method: "POST",
        body: JSON.stringify({ token: data.token }),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/2fa/status"] });
      setBackupCodes(data.backupCodes || []);
      setShowBackupCodes(true);
      enableForm.reset();
      toast({
        title: "تم التفعيل بنجاح",
        description: "تم تفعيل التحقق بخطوتين. احفظ الرموز الاحتياطية في مكان آمن.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "الرمز غير صحيح",
        variant: "destructive",
      });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async (data: DisableFormData) => {
      return await apiRequest("/api/2fa/disable", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/2fa/status"] });
      setDisableDialogOpen(false);
      disableForm.reset();
      toast({
        title: "تم التعطيل بنجاح",
        description: "تم تعطيل التحقق بخطوتين",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تعطيل التحقق بخطوتين",
        variant: "destructive",
      });
    },
  });

  const backupCodesMutation = useMutation({
    mutationFn: async (data: BackupCodesFormData) => {
      return await apiRequest("/api/2fa/backup-codes", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/2fa/status"] });
      setBackupCodes(data.backupCodes || []);
      setBackupCodesDialogOpen(false);
      backupCodesForm.reset();
      toast({
        title: "تم إنشاء الرموز الاحتياطية",
        description: "احفظ هذه الرموز في مكان آمن",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إنشاء الرموز الاحتياطية",
        variant: "destructive",
      });
    },
  });

  const methodMutation = useMutation({
    mutationFn: async (data: MethodFormData) => {
      return await apiRequest("/api/2fa/update-method", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/2fa/status"] });
      setMethodDialogOpen(false);
      methodForm.reset();
      toast({
        title: "تم التحديث بنجاح",
        description: data.message || "تم تحديث طريقة التحقق بخطوتين",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث طريقة التحقق",
        variant: "destructive",
      });
    },
  });

  const handleCopySecret = () => {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret);
      toast({
        title: "تم النسخ",
        description: "تم نسخ المفتاح السري",
      });
    }
  };

  const handleCopyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    toast({
      title: "تم النسخ",
      description: "تم نسخ الرموز الاحتياطية",
    });
  };

  const handleCloseSetupDialog = () => {
    setSetupDialogOpen(false);
    setShowBackupCodes(false);
    setBackupCodes([]);
    enableForm.reset();
  };

  if (isLoadingStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            التحقق بخطوتين
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <CardTitle>التحقق بخطوتين</CardTitle>
          </div>
          <Badge
            variant={status?.enabled ? "default" : "secondary"}
            data-testid="badge-2fa-status"
          >
            {status?.enabled ? (
              <>
                <ShieldCheck className="h-3 w-3 ml-1" />
                مفعّل
              </>
            ) : (
              "غير مفعّل"
            )}
          </Badge>
        </div>
        <CardDescription>
          أضف طبقة حماية إضافية لحسابك باستخدام تطبيق المصادقة
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!status?.enabled ? (
          <div className="space-y-4">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                عند تفعيل التحقق بخطوتين، ستحتاج إلى رمز من تطبيق المصادقة بالإضافة إلى كلمة المرور عند تسجيل الدخول.
              </AlertDescription>
            </Alert>

            <Button
              onClick={() => setupMutation.mutate()}
              disabled={setupMutation.isPending}
              data-testid="button-enable-2fa"
              className="w-full"
            >
              {setupMutation.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الإعداد...
                </>
              ) : (
                <>
                  <ShieldCheck className="ml-2 h-4 w-4" />
                  تفعيل التحقق بخطوتين
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                التحقق بخطوتين مفعّل. حسابك محمي بطبقة أمان إضافية.
                {status?.method && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-sm">الطريقة الحالية:</span>
                    <Badge variant="outline">
                      {status.method === 'authenticator' && (
                        <>
                          <Smartphone className="h-3 w-3 ml-1" />
                          تطبيق المصادقة
                        </>
                      )}
                      {status.method === 'sms' && (
                        <>
                          <MessageSquare className="h-3 w-3 ml-1" />
                          رسالة نصية
                        </>
                      )}
                      {status.method === 'both' && (
                        <>
                          <Shield className="h-3 w-3 ml-1" />
                          كلا الطريقتين
                        </>
                      )}
                    </Badge>
                  </div>
                )}
              </AlertDescription>
            </Alert>

            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={() => setMethodDialogOpen(true)}
                data-testid="button-change-method"
              >
                <Shield className="ml-2 h-4 w-4" />
                تغيير طريقة التحقق
              </Button>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={() => setBackupCodesDialogOpen(true)}
                  disabled={!status?.hasBackupCodes}
                  data-testid="button-regenerate-backup-codes"
                  className="flex-1"
                >
                  <Key className="ml-2 h-4 w-4" />
                  إنشاء رموز احتياطية جديدة
                </Button>

                <Button
                  variant="destructive"
                  onClick={() => setDisableDialogOpen(true)}
                  data-testid="button-disable-2fa"
                  className="flex-1"
                >
                  <AlertTriangle className="ml-2 h-4 w-4" />
                  تعطيل التحقق بخطوتين
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Setup Dialog */}
        <Dialog open={setupDialogOpen} onOpenChange={handleCloseSetupDialog}>
          <DialogContent className="max-w-md" data-testid="dialog-setup-2fa">
            <DialogHeader>
              <DialogTitle>إعداد التحقق بخطوتين</DialogTitle>
              <DialogDescription>
                امسح رمز QR باستخدام تطبيق المصادقة مثل Google Authenticator أو Microsoft Authenticator
              </DialogDescription>
            </DialogHeader>

            {!showBackupCodes ? (
              <div className="space-y-4">
                {/* QR Code */}
                {setupData?.qrCode && (
                  <div className="flex justify-center p-4 bg-white rounded-lg">
                    <img
                      src={setupData.qrCode}
                      alt="QR Code"
                      className="w-48 h-48"
                      data-testid="img-qr-code"
                    />
                  </div>
                )}

                {/* Secret Key */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">المفتاح السري (للإدخال اليدوي)</label>
                  <div className="flex gap-2">
                    <Input
                      value={setupData?.secret || ""}
                      readOnly
                      dir="ltr"
                      className="font-mono text-sm"
                      data-testid="input-secret-key"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleCopySecret}
                      data-testid="button-copy-secret"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Verification Form */}
                <Form {...enableForm}>
                  <form
                    onSubmit={enableForm.handleSubmit((data) => enableMutation.mutate(data))}
                    className="space-y-4"
                  >
                    <FormField
                      control={enableForm.control}
                      name="token"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>أدخل الرمز من التطبيق</FormLabel>
                          <FormControl>
                            <div className="flex justify-center" dir="ltr">
                              <InputOTP
                                maxLength={6}
                                value={field.value}
                                onChange={field.onChange}
                                data-testid="input-verification-code"
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

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={enableMutation.isPending}
                      data-testid="button-verify-enable"
                    >
                      {enableMutation.isPending ? (
                        <>
                          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                          جاري التحقق...
                        </>
                      ) : (
                        "تحقق وتفعيل"
                      )}
                    </Button>
                  </form>
                </Form>
              </div>
            ) : (
              <div className="space-y-4">
                <Alert>
                  <Key className="h-4 w-4" />
                  <AlertDescription>
                    احفظ هذه الرموز الاحتياطية في مكان آمن. يمكنك استخدام أي منها مرة واحدة فقط للدخول إذا فقدت الوصول إلى تطبيق المصادقة.
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">الرموز الاحتياطية</label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyBackupCodes}
                      data-testid="button-copy-backup-codes"
                    >
                      <Copy className="ml-2 h-3 w-3" />
                      نسخ الكل
                    </Button>
                  </div>
                  <div className="bg-muted p-4 rounded-lg space-y-1 font-mono text-sm" dir="ltr">
                    {backupCodes.map((code, index) => (
                      <div key={index} data-testid={`text-backup-code-${index}`}>
                        {code}
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={handleCloseSetupDialog}
                  className="w-full"
                  data-testid="button-close-backup-codes"
                >
                  تم، أغلق
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Disable Dialog */}
        <Dialog open={disableDialogOpen} onOpenChange={setDisableDialogOpen}>
          <DialogContent className="max-w-md" data-testid="dialog-disable-2fa">
            <DialogHeader>
              <DialogTitle>تعطيل التحقق بخطوتين</DialogTitle>
              <DialogDescription>
                الرجاء إدخال كلمة المرور ورمز التحقق لتعطيل التحقق بخطوتين
              </DialogDescription>
            </DialogHeader>

            <Form {...disableForm}>
              <form
                onSubmit={disableForm.handleSubmit((data) => disableMutation.mutate(data))}
                className="space-y-4"
              >
                <FormField
                  control={disableForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>كلمة المرور</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="••••••"
                          dir="ltr"
                          data-testid="input-disable-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={disableForm.control}
                  name="token"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>رمز التحقق</FormLabel>
                      <FormControl>
                        <div className="flex justify-center" dir="ltr">
                          <InputOTP
                            maxLength={6}
                            value={field.value}
                            onChange={field.onChange}
                            data-testid="input-disable-token"
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

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDisableDialogOpen(false);
                      disableForm.reset();
                    }}
                    className="flex-1"
                    data-testid="button-cancel-disable"
                  >
                    إلغاء
                  </Button>
                  <Button
                    type="submit"
                    variant="destructive"
                    className="flex-1"
                    disabled={disableMutation.isPending}
                    data-testid="button-confirm-disable"
                  >
                    {disableMutation.isPending ? (
                      <>
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        جاري التعطيل...
                      </>
                    ) : (
                      "تعطيل"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Backup Codes Dialog */}
        <Dialog open={backupCodesDialogOpen} onOpenChange={setBackupCodesDialogOpen}>
          <DialogContent className="max-w-md" data-testid="dialog-backup-codes">
            <DialogHeader>
              <DialogTitle>إنشاء رموز احتياطية جديدة</DialogTitle>
              <DialogDescription>
                سيتم إبطال جميع الرموز الاحتياطية السابقة وإنشاء رموز جديدة
              </DialogDescription>
            </DialogHeader>

            <Form {...backupCodesForm}>
              <form
                onSubmit={backupCodesForm.handleSubmit((data) => backupCodesMutation.mutate(data))}
                className="space-y-4"
              >
                <FormField
                  control={backupCodesForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>كلمة المرور</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="••••••"
                          dir="ltr"
                          data-testid="input-backup-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setBackupCodesDialogOpen(false);
                      backupCodesForm.reset();
                    }}
                    className="flex-1"
                    data-testid="button-cancel-backup"
                  >
                    إلغاء
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={backupCodesMutation.isPending}
                    data-testid="button-confirm-backup"
                  >
                    {backupCodesMutation.isPending ? (
                      <>
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        جاري الإنشاء...
                      </>
                    ) : (
                      "إنشاء رموز جديدة"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Display Backup Codes After Regeneration */}
        {backupCodes.length > 0 && !showBackupCodes && (
          <Dialog open={backupCodes.length > 0} onOpenChange={() => setBackupCodes([])}>
            <DialogContent className="max-w-md" data-testid="dialog-show-backup-codes">
              <DialogHeader>
                <DialogTitle>رموزك الاحتياطية الجديدة</DialogTitle>
                <DialogDescription>
                  احفظ هذه الرموز في مكان آمن. لن تتمكن من رؤيتها مرة أخرى.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <Alert>
                  <Key className="h-4 w-4" />
                  <AlertDescription>
                    يمكنك استخدام أي من هذه الرموز مرة واحدة فقط للدخول إذا فقدت الوصول إلى تطبيق المصادقة.
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">الرموز الاحتياطية</label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyBackupCodes}
                      data-testid="button-copy-regenerated-codes"
                    >
                      <Copy className="ml-2 h-3 w-3" />
                      نسخ الكل
                    </Button>
                  </div>
                  <div className="bg-muted p-4 rounded-lg space-y-1 font-mono text-sm" dir="ltr">
                    {backupCodes.map((code, index) => (
                      <div key={index} data-testid={`text-regenerated-code-${index}`}>
                        {code}
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={() => setBackupCodes([])}
                  className="w-full"
                  data-testid="button-close-regenerated-codes"
                >
                  تم، أغلق
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Change Method Dialog */}
        <Dialog open={methodDialogOpen} onOpenChange={setMethodDialogOpen}>
          <DialogContent className="max-w-md" data-testid="dialog-change-method">
            <DialogHeader>
              <DialogTitle>تغيير طريقة التحقق بخطوتين</DialogTitle>
              <DialogDescription>
                اختر الطريقة المفضلة للتحقق من هويتك عند تسجيل الدخول
              </DialogDescription>
            </DialogHeader>

            <Form {...methodForm}>
              <form
                onSubmit={methodForm.handleSubmit((data) => methodMutation.mutate(data))}
                className="space-y-4"
              >
                <FormField
                  control={methodForm.control}
                  name="method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>طريقة التحقق</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-method">
                            <SelectValue placeholder="اختر طريقة التحقق" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="authenticator" data-testid="option-authenticator">
                            <div className="flex items-center gap-2">
                              <Smartphone className="h-4 w-4" />
                              <span>تطبيق المصادقة</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="sms" data-testid="option-sms">
                            <div className="flex items-center gap-2">
                              <MessageSquare className="h-4 w-4" />
                              <span>رسالة نصية SMS</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="both" data-testid="option-both">
                            <div className="flex items-center gap-2">
                              <Shield className="h-4 w-4" />
                              <span>كلا الطريقتين</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={methodForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>كلمة المرور للتأكيد</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="••••••"
                          dir="ltr"
                          data-testid="input-method-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Alert>
                  <AlertDescription className="text-sm">
                    {methodForm.watch('method') === 'sms' || methodForm.watch('method') === 'both' ? (
                      "تأكد من إضافة رقم جوالك في الملف الشخصي قبل اختيار طريقة الرسائل النصية"
                    ) : (
                      "ستحتاج إلى تطبيق المصادقة مثل Google Authenticator أو Microsoft Authenticator"
                    )}
                  </AlertDescription>
                </Alert>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setMethodDialogOpen(false);
                      methodForm.reset();
                    }}
                    className="flex-1"
                    data-testid="button-cancel-method"
                  >
                    إلغاء
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={methodMutation.isPending}
                    data-testid="button-confirm-method"
                  >
                    {methodMutation.isPending ? (
                      <>
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        جاري التحديث...
                      </>
                    ) : (
                      "حفظ التغييرات"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
