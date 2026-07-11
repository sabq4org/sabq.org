import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Copy, Crown, LogOut, Plus, Trash2, Users } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/format";

/**
 * «مجالس التوقعات» — دوريات خاصة برمز دعوة: أنشئ مجلسك، شارك الرمز، ونافس
 * أهل ديوانيتك في ترتيب خاص يقرأ نقاط المسابقة نفسها. تبويب داخل صفحة
 * التوقعات (للمسجّلين فقط — الزائر يرى دعوة تسجيل).
 */

interface MajlisSummary {
  id: string;
  name: string;
  code: string;
  isOwner: boolean;
  membersCount: number;
}

interface MajlisLeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  avatar: string | null;
  isOwner: boolean;
  totalPoints: number;
  correctCount: number;
  exactCount: number;
  playedCount: number;
}

export function GcMajlisTab({
  isAuthenticated,
  currentUserId,
  onRequireLogin,
}: {
  isAuthenticated: boolean;
  currentUserId?: string;
  onRequireLogin: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: mineData, isLoading } = useQuery<{ majalis: MajlisSummary[] }>({
    queryKey: ["/api/gulf-cup/majlis/mine"],
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
  const majalis = Array.isArray(mineData?.majalis) ? mineData.majalis : [];

  const invalidateMine = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/gulf-cup/majlis/mine"] });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/gulf-cup/majlis", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: (data: any) => {
      toast({ title: "أُنشئ مجلسك 🎉", description: `شارك الرمز ${data?.code ?? ""} مع من تحب` });
      setName("");
      invalidateMine();
    },
    onError: (e: any) =>
      toast({ title: "تعذّر الإنشاء", description: e?.message || "حاول مجددًا", variant: "destructive" }),
  });

  const joinMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/gulf-cup/majlis/join", { method: "POST", body: JSON.stringify({ code }) }),
    onSuccess: (data: any) => {
      toast({ title: "انضممت ✅", description: `أهلًا بك في «${data?.name ?? "المجلس"}»` });
      setCode("");
      invalidateMine();
    },
    onError: (e: any) =>
      toast({ title: "تعذّر الانضمام", description: e?.message || "تأكد من الرمز", variant: "destructive" }),
  });

  const leaveMutation = useMutation({
    mutationFn: (majlisId: string) =>
      apiRequest(`/api/gulf-cup/majlis/${majlisId}`, { method: "DELETE" }),
    onSuccess: (_d, majlisId) => {
      if (openId === majlisId) setOpenId(null);
      invalidateMine();
    },
    onError: (e: any) =>
      toast({ title: "تعذّر التنفيذ", description: e?.message || "حاول مجددًا", variant: "destructive" }),
  });

  if (!isAuthenticated) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-14 text-center">
        <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="font-bold">المجالس لأعضاء سبق</p>
        <p className="mt-1 text-sm text-muted-foreground">
          سجّل دخولك لتنشئ مجلسك الخاص وتنافس أهلك وزملاءك برمز دعوة.
        </p>
        <button
          onClick={onRequireLogin}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#0F8054] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#0A6B47]"
        >
          تسجيل الدخول
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* إنشاء + انضمام */}
      <div className="grid gap-3 sm:grid-cols-2">
        <form
          className="rounded-2xl border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2 && !createMutation.isPending) createMutation.mutate();
          }}
        >
          <p className="mb-2 flex items-center gap-1.5 text-sm font-black text-foreground">
            <Plus className="h-4 w-4 text-[#0F8054]" />
            أنشئ مجلسك
          </p>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="اسم المجلس — مثل: ديوانية الجمعة"
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400/40"
            />
            <button
              type="submit"
              disabled={name.trim().length < 2 || createMutation.isPending}
              className="shrink-0 rounded-xl bg-[#0F8054] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#0A6B47] disabled:opacity-50"
            >
              إنشاء
            </button>
          </div>
        </form>

        <form
          className="rounded-2xl border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length >= 4 && !joinMutation.isPending) joinMutation.mutate();
          }}
        >
          <p className="mb-2 flex items-center gap-1.5 text-sm font-black text-foreground">
            <Users className="h-4 w-4 text-amber-500" />
            انضم برمز دعوة
          </p>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={8}
              placeholder="مثل: 7KQ2MD"
              dir="ltr"
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-center text-sm font-black tracking-widest outline-none focus:ring-2 focus:ring-amber-400/40"
            />
            <button
              type="submit"
              disabled={code.trim().length < 4 || joinMutation.isPending}
              className="shrink-0 rounded-xl bg-gradient-to-b from-[#F5D46B] to-[#E7A93C] px-4 py-2 text-sm font-black text-emerald-950 transition disabled:opacity-50"
            >
              انضمام
            </button>
          </div>
        </form>
      </div>

      {/* مجالسي */}
      {isLoading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-muted/60" />
      ) : majalis.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-12 text-center">
          <Crown className="mx-auto mb-3 h-9 w-9 text-muted-foreground/50" />
          <p className="font-bold">لا مجالس بعد</p>
          <p className="mt-1 text-sm text-muted-foreground">
            أنشئ مجلسك الأول أو انضم برمز وصلك من صديق — المنافسة أحلى جماعة.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {majalis.map((m) => (
            <MajlisCard
              key={m.id}
              majlis={m}
              open={openId === m.id}
              currentUserId={currentUserId}
              onToggle={() => setOpenId(openId === m.id ? null : m.id)}
              onLeave={() => leaveMutation.mutate(m.id)}
              leaving={leaveMutation.isPending && leaveMutation.variables === m.id}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function MajlisCard({
  majlis,
  open,
  currentUserId,
  onToggle,
  onLeave,
  leaving,
}: {
  majlis: MajlisSummary;
  open: boolean;
  currentUserId?: string;
  onToggle: () => void;
  onLeave: () => void;
  leaving: boolean;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: board, isLoading } = useQuery<{ rows: MajlisLeaderboardRow[] }>({
    queryKey: [`/api/gulf-cup/majlis/${majlis.id}/leaderboard`],
    enabled: open,
    staleTime: 30_000,
  });
  const rows = Array.isArray(board?.rows) ? board.rows : [];

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(majlis.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast({ title: majlis.code, description: "انسخ الرمز يدويًا" });
    }
  };

  return (
    <li className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-start">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#0F8054]/10 text-lg">
            {majlis.isOwner ? "👑" : "🪑"}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-black text-foreground">{majlis.name}</span>
            <span className="text-[11px] text-muted-foreground">
              {formatNumber(majlis.membersCount)} عضو {majlis.isOwner ? "· أنت صاحب المجلس" : ""}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={copyCode}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-black tracking-widest text-foreground transition hover:bg-muted/70"
          dir="ltr"
          title="انسخ رمز الدعوة"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          {majlis.code}
        </button>
        <button
          type="button"
          onClick={() => {
            if (majlis.isOwner && !confirm(`حذف «${majlis.name}» نهائيًا لكل الأعضاء؟`)) return;
            onLeave();
          }}
          disabled={leaving}
          className="shrink-0 rounded-full p-2 text-muted-foreground transition hover:bg-red-500/10 hover:text-[#DE2B3D] disabled:opacity-50"
          title={majlis.isOwner ? "حذف المجلس" : "مغادرة المجلس"}
        >
          {majlis.isOwner ? <Trash2 className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border px-4 py-3">
          {isLoading ? (
            <div className="h-24 animate-pulse rounded-xl bg-muted/60" />
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا أعضاء بعد</p>
          ) : (
            <ol className="space-y-1.5">
              {rows.map((r) => (
                <li
                  key={r.userId}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm ${
                    r.userId === currentUserId ? "bg-[#0F8054]/8 ring-1 ring-[#0F8054]/20" : "bg-muted/40"
                  }`}
                >
                  <span className="w-6 text-center font-black tabular-nums text-muted-foreground">
                    {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : r.rank}
                  </span>
                  <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-muted">
                    {r.avatar ? <img src={r.avatar} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-bold text-foreground">
                    {r.name}
                    {r.isOwner ? " 👑" : ""}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatNumber(r.correctCount)} إصابة
                  </span>
                  <span className="font-black tabular-nums text-[#0A6B47] dark:text-emerald-300">
                    {formatNumber(r.totalPoints)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}
