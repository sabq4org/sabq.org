import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BadgeCheck, Loader2, Mail, Phone, Upload } from "lucide-react";

const profileSchema = z.object({
  firstName: z.string().min(1, "الاسم الأول مطلوب").max(50),
  lastName: z.string().max(50).optional().or(z.literal("")),
  bio: z.string().max(500).optional().or(z.literal("")),
});

type ProfileForm = z.infer<typeof profileSchema>;

type AuthUser = {
  id: string;
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  bio?: string | null;
  phoneNumber?: string | null;
  phoneVerified?: boolean;
  profileImageUrl?: string | null;
  emailVerified?: boolean;
};

/** صيغة العرض المحلية 05XXXXXXXX من أي صيغة مخزّنة. */
function formatSaudiPhoneForDisplay(value?: string | null): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  const last9 = digits.slice(-9);
  return last9.startsWith("5") ? `0${last9}` : value;
}

export function AccountSection() {
  const { toast } = useToast();
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const { data: user, isLoading } = useQuery<AuthUser>({
    queryKey: ["/api/auth/user"],
  });

  // ── توثيق الجوال (OTP) — لا يُحفظ الرقم إلا بعد إثبات الملكية ──
  const [phoneDraft, setPhoneDraft] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneStep, setPhoneStep] = useState<"idle" | "editing" | "code">("idle");
  const [resend, setResend] = useState(0);

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      bio: "",
    },
  });

  useEffect(() => {
    if (!user) return;
    form.reset({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      bio: user.bio ?? "",
    });
  }, [user, form]);

  useEffect(() => {
    if (resend <= 0) return;
    const t = setInterval(() => setResend((r) => (r <= 1 ? 0 : r - 1)), 1000);
    return () => clearInterval(t);
  }, [resend > 0]);

  const sendPhoneCode = useMutation({
    mutationFn: async () =>
      apiRequest("/api/account/phone/send", {
        method: "POST",
        body: JSON.stringify({ phone: phoneDraft }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      setPhoneCode("");
      setPhoneStep("code");
      setResend(60);
      toast({ title: "تم إرسال الرمز", description: "أدخل رمز التحقق المرسل إلى جوالك" });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "تعذّر إرسال الرمز",
        description: error.message || "حاول مرة أخرى",
      });
    },
  });

  const verifyPhoneCode = useMutation({
    mutationFn: async () =>
      apiRequest("/api/account/phone/verify", {
        method: "POST",
        body: JSON.stringify({ phone: phoneDraft, code: phoneCode }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setPhoneStep("idle");
      setPhoneDraft("");
      setPhoneCode("");
      toast({ title: "تم التوثيق", description: "أصبح رقم جوالك موثّقًا في حسابك" });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "فشل التحقق",
        description: error.message || "الرمز غير صحيح أو منتهي",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      return apiRequest("/api/auth/user", {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "تم الحفظ", description: "تم تحديث بيانات حسابك" });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "تعذّر حفظ البيانات. حاول مرة أخرى.",
      });
    },
  });

  const resendVerification = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/auth/resend-verification", { method: "POST" });
    },
    onSuccess: () => {
      toast({ title: "تم الإرسال", description: "تحقق من بريدك لإكمال التحقق" });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "تعذّر إرسال رسالة التحقق",
      });
    },
  });

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entityType", "profile-avatar");
      const uploaded = (await apiRequest("/api/media/upload", {
        method: "POST",
        body: formData,
        isFormData: true,
      })) as { url: string };

      await apiRequest("/api/profile/image", {
        method: "PUT",
        body: JSON.stringify({ profileImageUrl: uploaded.url }),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "تم التحديث", description: "تم تحديث صورتك الشخصية" });
    } catch {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "تعذّر رفع الصورة",
      });
    } finally {
      setIsUploadingAvatar(false);
      e.target.value = "";
    }
  };

  if (isLoading || !user) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-24 rounded bg-muted" />
        <div className="h-40 rounded bg-muted" />
      </div>
    );
  }

  const initials =
    `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.trim() ||
    user.email?.[0]?.toUpperCase() ||
    "؟";

  return (
    <div className="space-y-6" data-testid="account-section">
      <Card>
        <CardHeader>
          <CardTitle>الصورة الشخصية</CardTitle>
          <CardDescription>تظهر في ملفك وفي التعليقات</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={user.profileImageUrl || ""} alt="" className="object-cover" />
            <AvatarFallback className="bg-primary text-primary-foreground text-xl">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <input
              id="settings-avatar-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={handleAvatarChange}
              disabled={isUploadingAvatar}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={isUploadingAvatar}
              onClick={() => document.getElementById("settings-avatar-input")?.click()}
              data-testid="button-settings-upload-avatar"
            >
              {isUploadingAvatar ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              تغيير الصورة
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>البيانات الشخصية</CardTitle>
          <CardDescription>الاسم والنبذة ورقم الجوال</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))}
              className="space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الاسم الأول</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-settings-first-name" />
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
                        <Input {...field} data-testid="input-settings-last-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نبذة</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} data-testid="input-settings-bio" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                data-testid="button-settings-save-account"
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    جارٍ الحفظ…
                  </>
                ) : (
                  "حفظ التغييرات"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <Phone className="h-5 w-5" />
            رقم الجوال
          </CardTitle>
          <CardDescription>
            يُستخدم للدخول برقم الجوال واستعادة الحساب. لا يُحفظ أي رقم قبل تأكيده برمز SMS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span dir="ltr" className="text-sm font-medium tabular-nums">
              {user.phoneNumber ? formatSaudiPhoneForDisplay(user.phoneNumber) : "لا يوجد رقم"}
            </span>
            {user.phoneNumber ? (
              user.phoneVerified ? (
                <Badge
                  variant="secondary"
                  className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                >
                  <BadgeCheck className="h-3.5 w-3.5" /> موثّق
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                >
                  غير موثّق
                </Badge>
              )
            ) : null}
            {phoneStep === "idle" && (
              <Button
                variant="outline"
                size="sm"
                className="ms-auto"
                onClick={() => {
                  setPhoneDraft(user.phoneNumber ?? "");
                  setPhoneStep("editing");
                }}
                data-testid="button-account-phone-edit"
              >
                {user.phoneNumber ? "تغيير الرقم" : "إضافة رقم"}
              </Button>
            )}
          </div>

          {phoneStep === "editing" && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[12rem] flex-1 space-y-1.5">
                <label htmlFor="account-phone-input" className="text-sm font-medium">
                  رقم الجوال
                </label>
                <Input
                  id="account-phone-input"
                  dir="ltr"
                  className="text-left"
                  inputMode="tel"
                  placeholder="05XXXXXXXX"
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                  data-testid="input-account-phone"
                />
              </div>
              <Button
                onClick={() => sendPhoneCode.mutate()}
                disabled={sendPhoneCode.isPending || phoneDraft.replace(/\D/g, "").length < 9}
                className="gap-2"
                data-testid="button-account-phone-send"
              >
                {sendPhoneCode.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Phone className="h-4 w-4" />
                )}
                إرسال الرمز
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setPhoneStep("idle");
                  setPhoneDraft("");
                }}
                data-testid="button-account-phone-cancel"
              >
                إلغاء
              </Button>
            </div>
          )}

          {phoneStep === "code" && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-sm text-muted-foreground">
                أدخل الرمز المرسل إلى{" "}
                <span dir="ltr" className="font-medium">
                  {formatSaudiPhoneForDisplay(phoneDraft)}
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  dir="ltr"
                  className="max-w-[8rem] text-center tracking-[0.4em]"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="______"
                  value={phoneCode}
                  onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  data-testid="input-account-phone-code"
                />
                <Button
                  onClick={() => verifyPhoneCode.mutate()}
                  disabled={verifyPhoneCode.isPending || phoneCode.length !== 6}
                  data-testid="button-account-phone-verify"
                >
                  {verifyPhoneCode.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "تأكيد"
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={resend > 0 || sendPhoneCode.isPending}
                  onClick={() => sendPhoneCode.mutate()}
                  data-testid="button-account-phone-resend"
                >
                  {resend > 0 ? `إعادة الإرسال (${resend})` : "إعادة الإرسال"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPhoneStep("editing");
                    setPhoneCode("");
                  }}
                >
                  تغيير الرقم
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <Mail className="h-5 w-5" />
            البريد الإلكتروني
          </CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          {user.emailVerified ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">البريد مُتحقَّق منه</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-amber-700 dark:text-amber-400">البريد غير مُتحقَّق منه</p>
              <Button
                variant="outline"
                size="sm"
                disabled={resendVerification.isPending}
                onClick={() => resendVerification.mutate()}
                data-testid="button-resend-verification"
              >
                إعادة إرسال رابط التحقق
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
