import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Eye,
  EyeOff,
  XCircle,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth, hasPermission } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type PublisherToken = {
  id: string;
  userId: string;
  email: string;
  name: string;
  tokenPrefix: string;
  label: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

type IssuedToken = {
  tokenId: string;
  token: string;
  tokenPrefix: string;
  user: { id: string; email: string; name: string };
  label: string | null;
  expiresAt: string;
};

const TOKENS_QUERY_KEY = ["/api/admin/bot-publisher-tokens"];

function asTokenList(value: unknown): PublisherToken[] {
  if (Array.isArray(value)) return value as PublisherToken[];
  if (value && typeof value === "object" && Array.isArray((value as { tokens?: unknown }).tokens)) {
    return (value as { tokens: PublisherToken[] }).tokens;
  }
  return [];
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusMeta(token: PublisherToken): { label: string; variant: "default" | "secondary" | "destructive" } {
  if (token.revokedAt) return { label: "ملغى", variant: "destructive" };
  if (new Date(token.expiresAt).getTime() <= Date.now()) {
    return { label: "منتهي", variant: "secondary" };
  }
  return { label: "نشط", variant: "default" };
}

export default function PublisherTokensPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const allowed = hasPermission(user, "system.manage_settings");
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [issuedToken, setIssuedToken] = useState<IssuedToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [confirmation, setConfirmation] = useState<{ action: "revoke" | "rotate"; token: PublisherToken } | null>(null);

  const tokensQuery = useQuery({
    queryKey: TOKENS_QUERY_KEY,
    queryFn: () => apiRequest("/api/admin/bot-publisher-tokens"),
    enabled: allowed,
  });
  const tokens = useMemo(() => asTokenList(tokensQuery.data), [tokensQuery.data]);

  const issueMutation = useMutation({
    mutationFn: () => apiRequest("/api/admin/bot-publisher-tokens", {
      method: "POST",
      body: JSON.stringify({
        email: email.trim(),
        ...(label.trim() ? { label: label.trim() } : {}),
        ...(expiresInDays.trim() ? { expiresInDays: Number(expiresInDays) } : {}),
      }),
    }) as Promise<IssuedToken>,
    onSuccess: (result) => {
      setIssuedToken(result);
      setCopied(false);
      setShowToken(false);
      setEmail("");
      setLabel("");
      setExpiresInDays("");
      queryClient.invalidateQueries({ queryKey: TOKENS_QUERY_KEY });
      toast({ title: "صدر التوكن", description: "سيظهر التوكن مرة واحدة فقط. انسخه واحفظه في مكان آمن." });
    },
    onError: (error: unknown) => toast({ title: "تعذر إصدار التوكن", description: error instanceof Error ? error.message : "تحقق من البريد والبيانات ثم أعد المحاولة.", variant: "destructive" }),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "revoke" | "rotate" }) =>
      apiRequest(`/api/admin/bot-publisher-tokens/${id}/${action}`, { method: "POST" }) as Promise<IssuedToken | unknown>,
    onSuccess: (result, variables) => {
      setConfirmation(null);
      if (variables.action === "rotate" && result && typeof result === "object" && "token" in result) {
        setIssuedToken(result as IssuedToken);
        setCopied(false);
        setShowToken(false);
      }
      queryClient.invalidateQueries({ queryKey: TOKENS_QUERY_KEY });
      toast({ title: variables.action === "revoke" ? "تم إبطال التوكن" : "تم تدوير التوكن", description: variables.action === "rotate" ? "انسخ التوكن الجديد الآن؛ سيظهر مرة واحدة فقط." : undefined });
    },
    onError: (error: unknown) => toast({ title: "تعذر تنفيذ الإجراء", description: error instanceof Error ? error.message : "حدث خطأ غير متوقع.", variant: "destructive" }),
  });

  async function copyIssuedToken() {
    if (!issuedToken?.token) return;
    try {
      await navigator.clipboard.writeText(issuedToken.token);
      setCopied(true);
      toast({ title: "تم النسخ", description: "لم يُحفظ التوكن في المتصفح." });
    } catch {
      toast({ title: "تعذر النسخ", description: "انسخ التوكن يدويًا من الحقل.", variant: "destructive" });
    }
  }

  if (!allowed) {
    return <DashboardLayout><div className="p-8 text-center" dir="rtl"><AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-500" /><h2 className="mb-2 text-2xl font-bold">لا تملك صلاحية الوصول</h2><p className="text-muted-foreground">إدارة توكنات النشر متاحة لمن يملك صلاحية إدارة إعدادات النظام.</p></div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={KeyRound}
          title="توكنات نشر سبق"
          description="التوكن يلتزم بصلاحيات حساب المستخدم ويستخدم لمسارات أخبار سبق فقط. يظهر كاملًا عند الإصدار أو التدوير لمرة واحدة."
        />

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4" />إصدار توكن لحساب موجود</CardTitle></CardHeader>
          <CardContent>
            <form
              className="grid gap-4 md:grid-cols-[1.3fr_1fr_180px_auto] md:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                if (!email.trim() || issueMutation.isPending) return;
                issueMutation.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="publisher-token-email">بريد المستخدم</Label>
                <Input id="publisher-token-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" dir="ltr" required />
                <p className="text-xs text-muted-foreground">يجب أن يكون الحساب موجودًا مسبقًا.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="publisher-token-label">وصف التوكن</Label>
                <Input id="publisher-token-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="بوت نشر الأخبار" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="publisher-token-expiry">مدة الصلاحية بالأيام</Label>
                <Input id="publisher-token-expiry" type="number" min="1" max="365" value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)} placeholder="90" dir="ltr" />
              </div>
              <Button type="submit" disabled={!email.trim() || issueMutation.isPending}>
                {issueMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                إصدار التوكن
              </Button>
            </form>
          </CardContent>
        </Card>

        {issuedToken ? (
          <Card className="border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20">
            <CardHeader>
              <CardTitle className="text-base text-emerald-800 dark:text-emerald-200">التوكن الجديد — يظهر مرة واحدة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-emerald-900/80 dark:text-emerald-100/80">
                {issuedToken.user.email} · {issuedToken.label || "بدون وصف"}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={showToken ? issuedToken.token : "•".repeat(issuedToken.token.length)} readOnly dir="ltr" className="font-mono text-xs" aria-label="التوكن الجديد" />
                <Button type="button" variant="outline" onClick={() => setShowToken((value) => !value)}>
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {showToken ? "إخفاء" : "إظهار"}
                </Button>
                <Button type="button" variant="outline" onClick={copyIssuedToken}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "تم النسخ" : "نسخ التوكن"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">احفظه في مدير أسرار آمن؛ لن تعاد قيمته الكاملة من القائمة.</p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">التوكنات المصدرة</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => void tokensQuery.refetch()} disabled={tokensQuery.isFetching}>
              <RefreshCw className={`h-4 w-4 ${tokensQuery.isFetching ? "animate-spin" : ""}`} />
              تحديث
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {tokensQuery.isLoading ? (
              <div className="space-y-3 p-6"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
            ) : tokensQuery.isError ? (
              <div className="p-6 text-sm text-destructive">تعذر تحميل التوكنات. أعد المحاولة.</div>
            ) : tokens.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">لا توجد توكنات مصدرة حتى الآن.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-sm">
                  <thead className="border-b bg-muted/40 text-right text-xs text-muted-foreground">
                    <tr><th className="px-4 py-3 font-medium">المستخدم</th><th className="px-4 py-3 font-medium">الوصف</th><th className="px-4 py-3 font-medium">الانتهاء</th><th className="px-4 py-3 font-medium">آخر استخدام</th><th className="px-4 py-3 font-medium">الحالة</th><th className="px-4 py-3 font-medium">إجراءات</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {tokens.map((token) => {
                      const status = statusMeta(token);
                      const busy = actionMutation.isPending && actionMutation.variables?.id === token.id;
                      return (
                        <tr key={token.id} className="align-middle">
                          <td className="px-4 py-4"><div className="font-medium">{token.name || "—"}</div><div className="font-mono text-xs text-muted-foreground" dir="ltr">{token.email}</div></td>
                          <td className="px-4 py-4">{token.label || "—"}</td>
                          <td className="px-4 py-4 text-muted-foreground">{formatDate(token.expiresAt)}</td>
                          <td className="px-4 py-4 text-muted-foreground">{formatDate(token.lastUsedAt)}</td>
                          <td className="px-4 py-4"><Badge variant={status.variant}>{status.label}</Badge></td>
                          <td className="px-4 py-4">
                            <div className="flex gap-2">
                              {status.label === "نشط" ? <>
                                <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmation({ action: "rotate", token })}><RefreshCw className="h-3.5 w-3.5" />تدوير</Button>
                                <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => setConfirmation({ action: "revoke", token })}><XCircle className="h-3.5 w-3.5" />إبطال</Button>
                              </> : <span className="text-xs text-muted-foreground">لا إجراءات</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!confirmation} onOpenChange={(open) => !open && setConfirmation(null)}>
        <AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>{confirmation?.action === "revoke" ? "إبطال التوكن؟" : "تدوير التوكن؟"}</AlertDialogTitle><AlertDialogDescription>{confirmation?.action === "revoke" ? "سيُمنع هذا التوكن من العمل فورًا ولا يمكن التراجع عن الإبطال." : "سيُبطل التوكن الحالي ويصدر توكنًا جديدًا. سيظهر التوكن الجديد مرة واحدة فقط."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter className="flex-row-reverse gap-2"><AlertDialogCancel disabled={actionMutation.isPending}>إلغاء</AlertDialogCancel><AlertDialogAction disabled={actionMutation.isPending} onClick={(event) => { event.preventDefault(); if (confirmation) actionMutation.mutate({ id: confirmation.token.id, action: confirmation.action }); }}>{actionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmation?.action === "revoke" ? "إبطال التوكن" : "تدوير التوكن"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
