import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { TwoFactorSettings } from "@/components/TwoFactorSettings";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Loader2, Shield } from "lucide-react";

export function SecuritySection() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePassword = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/account/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "تم التغيير", description: "تم تحديث كلمة المرور بنجاح" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "تعذّر التغيير",
        description: err.message || "تحقق من كلمة المرور الحالية وحاول مجددًا",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({
        variant: "destructive",
        title: "كلمة مرور قصيرة",
        description: "يجب أن تكون كلمة المرور 8 أحرف على الأقل",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "غير متطابقة",
        description: "تأكيد كلمة المرور لا يطابق الكلمة الجديدة",
      });
      return;
    }
    changePassword.mutate();
  };

  return (
    <div className="space-y-6" data-testid="security-section">
      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            كلمة المرور
          </CardTitle>
          <CardDescription>غيّر كلمة مرور حسابك على سبق</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="current-password">كلمة المرور الحالية</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                data-testid="input-current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">كلمة المرور الجديدة</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                data-testid="input-new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">تأكيد كلمة المرور</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                data-testid="input-confirm-password"
              />
            </div>
            <Button
              type="submit"
              disabled={changePassword.isPending || !currentPassword || !newPassword}
              data-testid="button-change-password"
            >
              {changePassword.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جارٍ التحديث…
                </>
              ) : (
                "تغيير كلمة المرور"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <Shield className="h-5 w-5" />
            الأجهزة والجلسات
          </CardTitle>
          <CardDescription>
            إدارة الجلسات النشطة على أجهزتك — قيد التوسعة على الويب
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          عند تغيير كلمة المرور تُنهى الجلسات على الأجهزة الأخرى تلقائيًا.
          قائمة الأجهزة التفصيلية وحذف الحساب على الويب قادمة قريبًا؛ على تطبيقات
          الموبايل تتوفر خيارات إضافية عبر إعدادات الحساب هناك.
        </CardContent>
      </Card>

      {/* نفس مكوّن 2FA دون تغيير منطق الاستدعاءات */}
      <TwoFactorSettings />
    </div>
  );
}
