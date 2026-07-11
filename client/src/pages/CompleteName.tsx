/**
 * إكمال الاسم بعد الدخول بالجوال — شاشة إلزامية خفيفة.
 * الاسم الأول مطلوب؛ اسم العائلة اختياري. لا يوجد تخطٍّ.
 */
import { useEffect } from "react";
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
import { getDefaultRedirectPath, needsDisplayName, type User } from "@/hooks/useAuth";
import { consumePostAuthReturn } from "@/lib/postAuthRedirect";
import { Loader2, UserRound } from "lucide-react";

const schema = z.object({
  firstName: z.string().trim().min(2, "الاسم الأول يجب أن يكون حرفين على الأقل"),
  lastName: z.string().trim().optional(),
});

type FormData = z.infer<typeof schema>;

export default function CompleteName() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: "", lastName: "" },
  });

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setLocation("/login");
      return;
    }
    if (!needsDisplayName(user)) {
      setLocation(consumePostAuthReturn(getDefaultRedirectPath(user)));
    }
  }, [user, isLoading, setLocation]);

  useEffect(() => {
    if (!user) return;
    form.reset({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
    });
  }, [user, form]);

  const save = useMutation({
    mutationFn: async (data: FormData) => {
      const body: Record<string, string> = { firstName: data.firstName.trim() };
      const ln = (data.lastName ?? "").trim();
      if (ln.length >= 2) body.lastName = ln;
      return apiRequest("/api/auth/user", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      const fresh = await queryClient.fetchQuery<User>({
        queryKey: ["/api/auth/user"],
        staleTime: 0,
      });
      toast({ title: "تم حفظ الاسم", description: "مرحبًا بك في سبق" });
      setLocation(consumePostAuthReturn(getDefaultRedirectPath(fresh)));
    },
    onError: () => {
      toast({
        title: "تعذّر الحفظ",
        description: "حاول مرة أخرى",
        variant: "destructive",
      });
    },
  });

  if (isLoading || !user || !needsDisplayName(user)) {
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
          <CardTitle className="text-2xl">أكمل اسمك</CardTitle>
          <CardDescription>
            سجّلت بجوالك بنجاح. أضف اسمك ليظهر في عضويتك وتعليقاتك.
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
