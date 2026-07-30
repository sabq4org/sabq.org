/**
 * استكمال حساب الجوال — شاشة إلزامية خفيفة تظهر حسب النواقص:
 * - الاسم (write-once) لكل الحسابات بلا اسم عرض.
 * - البريد الحقيقي + كلمة المرور لحسابات الجوال القديمة (بريد اصطناعي
 *   @phone.sabq.org تاريخي أو بلا بريد، أو بلا كلمة مرور).
 * البريد الجديد يبقى غير موثق حتى ينجح رابط التحقق المرسل إليه.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  getDefaultRedirectPath,
  needsAccountCompletion,
  needsDisplayName,
  type User,
} from "@/hooks/useAuth";
import { hasRealEmail } from "@shared/authEmail";
import { consumePostAuthReturn } from "@/lib/postAuthRedirect";
import { Eye, EyeOff, Loader2, UserRound } from "lucide-react";

const schema = z
  .object({
    firstName: z.string().trim().optional(),
    lastName: z.string().trim().optional(),
    email: z.string().trim().optional(),
    password: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .refine((d) => !d.password || d.password === d.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

export default function CompleteName() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  // الأقسام الظاهرة حسب نواقص الحساب.
  const needs = useMemo(
    () => ({
      name: needsDisplayName(user),
      email: Boolean(user?.id) && user?.authProvider === "phone" && !hasRealEmail(user?.email),
      password: Boolean(user?.id) && user?.authProvider === "phone" && user?.hasPassword === false,
    }),
    [user],
  );

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setLocation("/login");
      return;
    }
    if (!needsAccountCompletion(user)) {
      setLocation(consumePostAuthReturn(getDefaultRedirectPath(user)));
    }
  }, [user, isLoading, setLocation]);

  useEffect(() => {
    if (!user) return;
    form.reset({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      email: "",
      password: "",
      confirmPassword: "",
    });
  }, [user, form]);

  const save = useMutation({
    mutationFn: async (data: FormData) => {
      // تحقق يدوي حسب الأقسام الظاهرة فقط.
      if (needs.name && (data.firstName ?? "").trim().length < 2) {
        throw new Error("الاسم الأول يجب أن يكون حرفين على الأقل");
      }
      if (needs.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((data.email ?? "").trim())) {
        throw new Error("أدخل بريدًا إلكترونيًا صالحًا");
      }
      if (needs.password && (data.password ?? "").length < 8) {
        throw new Error("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
      }

      const body: Record<string, string> = {};
      if (needs.name) {
        body.firstName = (data.firstName ?? "").trim();
        const ln = (data.lastName ?? "").trim();
        if (ln.length >= 2) body.lastName = ln;
      }
      if (needs.email) body.email = (data.email ?? "").trim();
      if (needs.password && data.password) body.password = data.password;

      // complete-account وليس complete-profile — الأخير مسار onboarding قديم
      // (interests.ts) يعيد نجاحًا دون حفظ البريد وكلمة المرور.
      return apiRequest<{ emailSent?: boolean }>("/api/auth/complete-account", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: async (resp) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      const fresh = await queryClient.fetchQuery<User>({
        queryKey: ["/api/auth/user"],
        staleTime: 0,
      });
      toast({
        title: "تم حفظ بياناتك",
        description: resp?.emailSent
          ? "أرسلنا رابط تحقق إلى بريدك الإلكتروني"
          : "مرحبًا بك في سبق",
      });
      setLocation(consumePostAuthReturn(getDefaultRedirectPath(fresh)));
    },
    onError: (err: any) => {
      toast({
        title: "تعذّر الحفظ",
        description: err?.message || "حاول مرة أخرى",
        variant: "destructive",
      });
    },
  });

  if (isLoading || !user || !needsAccountCompletion(user)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <UserRound className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">{needs.name ? "أكمل ملفك" : "أكمل بيانات حسابك"}</CardTitle>
          <CardDescription>
            {needs.email
              ? "حسابك مسجل بجوالك الموثق. أضف بريدك الإلكتروني الحقيقي وكلمة مرور لتأمين حسابك واستعادته."
              : "سجّلت بجوالك بنجاح. أكمل بياناتك لتظهر في عضويتك وتعليقاتك."}
            {user.phoneNumber ? (
              <span className="mt-2 block font-medium text-foreground" dir="ltr">
                {user.phoneNumber}
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => save.mutate(d))} className="space-y-4">
              {needs.name && (
                <>
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          الاسم الأول <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="مثال: أحمد"
                            autoFocus
                            autoComplete="given-name"
                            {...field}
                            data-testid="input-complete-firstName"
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
                        <FormLabel>اسم العائلة (اختياري)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="مثال: العتيبي"
                            autoComplete="family-name"
                            {...field}
                            data-testid="input-complete-lastName"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    لا يمكن تعديل الاسم لاحقًا لاعتبارات مصداقية التعليقات.
                  </p>
                </>
              )}

              {needs.email && (
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        البريد الإلكتروني <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          dir="ltr"
                          placeholder="example@email.com"
                          autoComplete="email"
                          {...field}
                          data-testid="input-complete-email"
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        سنرسل رابط تحقق — البريد لا يُعد موثقًا قبل تأكيده.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {needs.password && (
                <>
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          كلمة المرور <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              dir="ltr"
                              placeholder="••••••••"
                              autoComplete="new-password"
                              className="pl-11"
                              {...field}
                              data-testid="input-complete-password"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
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
                        <FormLabel>
                          تأكيد كلمة المرور <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            dir="ltr"
                            placeholder="••••••••"
                            autoComplete="new-password"
                            {...field}
                            data-testid="input-complete-confirmPassword"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <Button
                type="submit"
                className="w-full min-h-11"
                disabled={save.isPending}
                data-testid="button-save-complete-name"
              >
                {save.isPending ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    جاري الحفظ…
                  </>
                ) : (
                  "متابعة"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
