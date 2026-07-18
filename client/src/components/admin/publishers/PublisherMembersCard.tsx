import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Crown, Loader2, UserMinus, UserPlus, Users } from "lucide-react";

interface Member {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: string | null;
  status: string | null;
  isOwner: boolean;
}

const memberName = (m: Member) =>
  [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email;

/**
 * مستخدمو الوكالة: المالك + الموظفون المرتبطون عبر linkedPublisherId.
 * أي موظف مرتبط يدخل بوابة الناشر وتُنسب مواده للوكالة ويُخصم نشره من رصيدها.
 */
export function PublisherMembersCard({ publisherId }: { publisherId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const membersKey = [`/api/admin/publishers/${publisherId}/members`];

  const [addOpen, setAddOpen] = useState(false);
  const [mode, setMode] = useState<"link" | "create">("link");
  const [linkEmail, setLinkEmail] = useState("");
  const [createForm, setCreateForm] = useState({ email: "", password: "", firstName: "", lastName: "" });
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  const { data, isLoading } = useQuery<{ members: Member[] }>({ queryKey: membersKey });
  const members = Array.isArray(data?.members) ? data!.members : [];

  const resetAddState = () => {
    setLinkEmail("");
    setCreateForm({ email: "", password: "", firstName: "", lastName: "" });
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      const body = mode === "link"
        ? { mode: "link", email: linkEmail }
        : { mode: "create", ...createForm };
      return apiRequest(`/api/admin/publishers/${publisherId}/members`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: (result: { message?: string }) => {
      queryClient.invalidateQueries({ queryKey: membersKey });
      toast({ title: "تمت الإضافة", description: result?.message || "أُضيف المستخدم للوكالة" });
      setAddOpen(false);
      resetAddState();
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إضافة المستخدم",
        variant: "destructive",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      return apiRequest(`/api/admin/publishers/${publisherId}/members/${memberId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membersKey });
      toast({ title: "تم فك الربط", description: "لم يعد المستخدم موظفاً في الوكالة" });
      setRemoveTarget(null);
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في فك الربط",
        variant: "destructive",
      });
      setRemoveTarget(null);
    },
  });

  const canSubmit = mode === "link"
    ? linkEmail.includes("@")
    : createForm.email.includes("@")
      && createForm.password.length >= 8
      && createForm.firstName.trim().length >= 2
      && createForm.lastName.trim().length >= 2;

  return (
    <Card className="border-border/60 h-full" data-testid="card-publisher-members">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          مستخدمو الوكالة
          {members.length > 0 && <Badge variant="secondary">{members.length}</Badge>}
        </CardTitle>
        <Button size="sm" onClick={() => setAddOpen(true)} data-testid="button-add-member">
          <UserPlus className="ml-2 h-4 w-4" />
          إضافة موظف
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : members.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">لا يوجد مستخدمون مرتبطون بالوكالة</p>
        ) : (
          <div className="divide-y rounded-xl border">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 px-3 py-2.5"
                data-testid={`member-row-${member.id}`}
              >
                <Avatar className="h-9 w-9">
                  {member.profileImageUrl && <AvatarImage src={member.profileImageUrl} alt={memberName(member)} />}
                  <AvatarFallback>{memberName(member).slice(0, 1)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{memberName(member)}</p>
                  <p className="truncate text-xs text-muted-foreground" dir="ltr">{member.email}</p>
                </div>
                {member.isOwner ? (
                  <Badge className="gap-1 border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" variant="outline">
                    <Crown className="h-3 w-3" />
                    مالك الحساب
                  </Badge>
                ) : (
                  <>
                    <Badge variant="secondary">موظف</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => setRemoveTarget(member)}
                      disabled={removeMutation.isPending}
                      title="فك الربط عن الوكالة"
                      data-testid={`button-remove-member-${member.id}`}
                    >
                      <UserMinus className="h-4 w-4 text-red-600" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* حوار الإضافة */}
      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetAddState(); }}>
        <DialogContent className="sm:max-w-[480px]" data-testid="dialog-add-member">
          <DialogHeader>
            <DialogTitle>إضافة موظف للوكالة</DialogTitle>
            <DialogDescription>
              الموظف المرتبط يدخل لوحة الناشر، وتُنسب مواده للوكالة ويُخصم نشره من رصيدها.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={mode} onValueChange={(v) => setMode(v as "link" | "create")} dir="rtl">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="link" data-testid="tab-link-existing">ربط حساب موجود</TabsTrigger>
              <TabsTrigger value="create" data-testid="tab-create-new">إنشاء حساب جديد</TabsTrigger>
            </TabsList>

            <TabsContent value="link" className="space-y-3 pt-3">
              <label className="text-sm font-medium">البريد الإلكتروني للحساب الموجود</label>
              <Input
                type="email"
                placeholder="employee@agency.com"
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
                dir="ltr"
                data-testid="input-link-email"
              />
            </TabsContent>

            <TabsContent value="create" className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">الاسم الأول *</label>
                  <Input
                    value={createForm.firstName}
                    onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })}
                    dir="rtl"
                    data-testid="input-member-firstname"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">اسم العائلة *</label>
                  <Input
                    value={createForm.lastName}
                    onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })}
                    dir="rtl"
                    data-testid="input-member-lastname"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">البريد الإلكتروني *</label>
                <Input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  dir="ltr"
                  data-testid="input-member-email"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">كلمة المرور * (8 أحرف على الأقل)</label>
                <Input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  dir="ltr"
                  data-testid="input-member-password"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                سيُنشأ الحساب بدور «ناشر» ومربوطاً بهذه الوكالة مباشرة.
              </p>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addMutation.isPending}>
              إلغاء
            </Button>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={!canSubmit || addMutation.isPending}
              data-testid="button-confirm-add-member"
            >
              {addMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {mode === "link" ? "ربط الحساب" : "إنشاء وربط"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* تأكيد فك الربط */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent data-testid="dialog-remove-member">
          <AlertDialogHeader>
            <AlertDialogTitle>فك ربط الموظف</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget && `سيفقد ${memberName(removeTarget)} الوصول إلى لوحة الوكالة، وتبقى مواده السابقة منسوبة للوكالة.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeTarget && removeMutation.mutate(removeTarget.id)}
              disabled={removeMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              فك الربط
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
