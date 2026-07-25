import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Mail, Phone, Upload } from "lucide-react";

const profileSchema = z.object({
  firstName: z.string().min(1, "الاسم الأول مطلوب").max(50),
  lastName: z.string().max(50).optional().or(z.literal("")),
  bio: z.string().max(500).optional().or(z.literal("")),
  phoneNumber: z.string().max(20).optional().or(z.literal("")),
});

type ProfileForm = z.infer<typeof profileSchema>;

type AuthUser = {
  id: string;
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  bio?: string | null;
  phoneNumber?: string | null;
  profileImageUrl?: string | null;
  emailVerified?: boolean;
};

export function AccountSection() {
  const { toast } = useToast();
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const { data: user, isLoading } = useQuery<AuthUser>({
    queryKey: ["/api/auth/user"],
  });

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      bio: "",
      phoneNumber: "",
    },
  });

  useEffect(() => {
    if (!user) return;
    form.reset({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      bio: user.bio ?? "",
      phoneNumber: user.phoneNumber ?? "",
    });
  }, [user, form]);

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
              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="inline-flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      رقم الجوال
                    </FormLabel>
                    <FormControl>
                      <Input {...field} dir="ltr" className="text-left" data-testid="input-settings-phone" />
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
