import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import {
  Bell,
  BellOff,
  ChevronLeft,
  CircleAlert,
  Crown,
  DoorOpen,
  Loader2,
  LogIn,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Swords,
  Trash2,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatNumber } from "@/lib/format";
import {
  clearMajlisJoinIntent,
  hasMajlisJoinIntent,
  normalizeMajlisInviteCode,
  rememberMajlisJoinIntent,
  rememberPostAuthReturn,
} from "@/lib/postAuthRedirect";
import { GcMajlisOnboarding } from "@/components/gulfcup/majlis/GcMajlisOnboarding";
import { GcMajlisShareDialog } from "@/components/gulfcup/majlis/GcMajlisShareDialog";
import {
  GcMajlisChampionPicksView,
  GcMajlisDuelsView,
  GcMajlisFantasyView,
  GcMajlisHarvestView,
  GcMajlisLeaderboardView,
  GcMajlisTodayView,
} from "@/components/gulfcup/majlis/GcMajlisViews";
import {
  gcMajlisKeys,
  type GcMajlisInvitePreview,
  type GcMajlisSummary,
  unwrapInvite,
} from "@/components/gulfcup/majlis/gcMajlisTypes";

type MajlisView = "today" | "leaderboard" | "fantasy" | "champion" | "duels" | "harvest";

const VIEWS: { key: MajlisView; label: string; icon: typeof Trophy }[] = [
  { key: "today", label: "اليوم", icon: Sparkles },
  { key: "leaderboard", label: "الترتيب", icon: Trophy },
  { key: "fantasy", label: "الفانتازي", icon: Crown },
  { key: "champion", label: "البطل", icon: ShieldCheck },
  { key: "duels", label: "التحديات", icon: Swords },
  { key: "harvest", label: "الحصاد", icon: Trophy },
];

function viewFromSearch(): MajlisView {
  if (typeof window === "undefined") return "today";
  const value = new URLSearchParams(window.location.search).get("view") as MajlisView | null;
  return VIEWS.some((item) => item.key === value) ? value! : "today";
}

function inviteCodeFromSearch(): { raw: string | null; code: string | null } {
  if (typeof window === "undefined") return { raw: null, code: null };
  const raw = new URLSearchParams(window.location.search).get("code");
  return { raw, code: normalizeMajlisInviteCode(raw) };
}

function majlisIdFromSearch(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("id")?.trim() ?? "";
  return /^[A-Za-z0-9-]{8,80}$/.test(value) ? value : null;
}

function fixtureIdFromSearch(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("fixture")?.trim() ?? "";
  return /^\d{1,12}$/.test(value) ? value : null;
}

function unwrapMajlis(raw: unknown): GcMajlisSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const nested = root.majlis ?? root.data;
  const row = nested && typeof nested === "object" && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : root;
  if (typeof row.id !== "string" || typeof row.name !== "string") return null;
  return {
    id: row.id,
    name: row.name,
    code: String(row.code ?? ""),
    isOwner: row.isOwner === true,
    membersCount: Number(row.membersCount ?? 1),
    createdAt: typeof row.createdAt === "string" ? row.createdAt : undefined,
  };
}

function listFromMine(raw: unknown): GcMajlisSummary[] {
  if (!raw || typeof raw !== "object") return [];
  const rows = (raw as Record<string, unknown>).majalis;
  return Array.isArray(rows) ? (rows as GcMajlisSummary[]) : [];
}

function notificationEnabled(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return true;
  const root = raw as Record<string, unknown>;
  const value = root.preference && typeof root.preference === "object" ? root.preference as Record<string, unknown> : root;
  return value.enabled !== false;
}

export default function GulfCupMajlis() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const [view, setView] = useState<MajlisView>(() => viewFromSearch());
  const inviteSearch = inviteCodeFromSearch();
  const inviteCode = inviteSearch.code;
  const queryMajlisId = majlisIdFromSearch();
  const focusFixtureId = fixtureIdFromSearch();

  useEffect(() => {
    document.title = "مجالس توقعات خليجي 27 | سبق";
  }, []);

  useEffect(() => setView(viewFromSearch()), [location]);

  const mineQuery = useQuery<unknown>({
    queryKey: gcMajlisKeys.mine,
    enabled: isAuthenticated,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
  });
  const majalis = listFromMine(mineQuery.data);
  const selectedId = params.id ?? queryMajlisId ?? "";
  const selected = majalis.find((majlis) => majlis.id === selectedId) ?? (!selectedId ? majalis[0] : undefined);

  useEffect(() => {
    if (inviteSearch.raw || params.id || queryMajlisId || !majalis[0]?.id) return;
    setLocation(`/gulf-cup/majlis/${majalis[0].id}`, { replace: true });
  }, [inviteSearch.raw, params.id, queryMajlisId, majalis, setLocation]);

  const joinMutation = useMutation({
    mutationFn: (code: string) => apiRequest("/api/gulf-cup/majlis/join", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
    onSuccess: async (raw) => {
      clearMajlisJoinIntent();
      const joined = unwrapMajlis(raw);
      await queryClient.invalidateQueries({ queryKey: gcMajlisKeys.mine });
      toast({ title: "أهلًا بك في المجلس", description: joined ? `انضممت إلى «${joined.name}»` : "تم الانضمام بنجاح" });
      if (joined?.id) setLocation(`/gulf-cup/majlis/${joined.id}`);
      else setLocation("/gulf-cup/majlis");
    },
    onError: (error: Error) => {
      clearMajlisJoinIntent();
      toast({ title: "تعذّر الانضمام", description: error.message || "تحقق من رمز الدعوة", variant: "destructive" });
    },
  });
  const resumedCode = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !inviteCode || !hasMajlisJoinIntent(inviteCode)) return;
    if (resumedCode.current === inviteCode || joinMutation.isPending) return;
    resumedCode.current = inviteCode;
    joinMutation.mutate(inviteCode);
  }, [isAuthenticated, inviteCode, joinMutation]);

  const beginInviteJoin = (code: string) => {
    rememberMajlisJoinIntent(code);
    if (!isAuthenticated) {
      rememberPostAuthReturn(`/gulf-cup/majlis?code=${encodeURIComponent(code)}&resume=1`);
      setLocation("/login");
      return;
    }
    joinMutation.mutate(code);
  };

  const openView = (next: MajlisView) => {
    if (!selected) return;
    setView(next);
    const suffix = next === "today" ? "" : `?view=${next}`;
    setLocation(`/gulf-cup/majlis/${selected.id}${suffix}`);
  };

  if (inviteSearch.raw) {
    return (
      <InviteLanding
        code={inviteCode}
        rawCode={inviteSearch.raw}
        user={user}
        authLoading={authLoading}
        joining={joinMutation.isPending}
        onJoin={beginInviteJoin}
        onBack={() => setLocation("/gulf-cup/majlis")}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-gradient-to-b from-emerald-50/70 via-background to-background dark:from-emerald-950/20 dark:via-background dark:to-background" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Link href="/gulf-cup" className="transition hover:text-foreground">خليجي 27</Link>
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <Link href="/gulf-cup/predictions" className="transition hover:text-foreground">التوقعات</Link>
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-bold text-foreground">المجالس</span>
          </div>

          {authLoading ? (
            <HubSkeleton />
          ) : !isAuthenticated ? (
            <GuestHub onLogin={() => {
              rememberPostAuthReturn(`${window.location.pathname}${window.location.search}`);
              setLocation("/login");
            }} onCode={(code) => setLocation(`/gulf-cup/majlis?code=${encodeURIComponent(code)}`)} />
          ) : mineQuery.isError ? (
            <div className="rounded-3xl border border-border bg-card px-6 py-16 text-center">
              <CircleAlert className="mx-auto h-10 w-10 text-destructive/70" />
              <h1 className="mt-3 text-xl font-black">تعذّر جلب مجالسك</h1>
              <p className="mt-1 text-sm text-muted-foreground">لم نفقد أي بيانات. حاول تحديث القائمة.</p>
              <Button variant="outline" className="mt-4 gap-2" onClick={() => void mineQuery.refetch()}>
                <RefreshCcw className="h-4 w-4" /> إعادة المحاولة
              </Button>
            </div>
          ) : (
            <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="hidden lg:sticky lg:top-20 lg:block">
                <MajlisRail majalis={majalis} selectedId={selected?.id} onSelect={(id) => setLocation(`/gulf-cup/majlis/${id}`)} />
              </aside>

              <div className="min-w-0">
                <MobileMajlisSelector majalis={majalis} selectedId={selected?.id} onSelect={(id) => setLocation(`/gulf-cup/majlis/${id}`)} />
                {selected ? (
                  <>
                    <MajlisHero majlis={selected} />
                    <MajlisViewTabs active={view} onChange={openView} />
                    <section id="majlis-view-panel" role="tabpanel" aria-label={VIEWS.find((item) => item.key === view)?.label} className="mt-4">
                      {view === "today" && <GcMajlisTodayView majlisId={selected.id} focusFixtureId={focusFixtureId} />}
                      {view === "leaderboard" && <GcMajlisLeaderboardView majlisId={selected.id} currentUserId={user?.id} />}
                      {view === "fantasy" && <GcMajlisFantasyView majlisId={selected.id} currentUserId={user?.id} />}
                      {view === "champion" && <GcMajlisChampionPicksView majlisId={selected.id} />}
                      {view === "duels" && <GcMajlisDuelsView majlisId={selected.id} currentUserId={user?.id} />}
                      {view === "harvest" && <GcMajlisHarvestView majlisId={selected.id} />}
                    </section>
                    {user?.id ? (
                      <GcMajlisOnboarding
                        userId={user.id}
                        majlisId={selected.id}
                        majlisName={selected.name}
                        onSkip={() => openView("today")}
                        onPredictNow={() => setLocation("/gulf-cup/predictions")}
                      />
                    ) : null}
                  </>
                ) : (
                  <EmptyMajlis onCreated={(majlis) => setLocation(`/gulf-cup/majlis/${majlis.id}`)} onInvite={(code) => setLocation(`/gulf-cup/majlis?code=${encodeURIComponent(code)}`)} />
                )}
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function InviteLanding({
  code,
  rawCode,
  user,
  authLoading,
  joining,
  onJoin,
  onBack,
}: {
  code: string | null;
  rawCode: string;
  user: ReturnType<typeof useAuth>["user"];
  authLoading: boolean;
  joining: boolean;
  onJoin: (code: string) => void;
  onBack: () => void;
}) {
  const previewQuery = useQuery<unknown>({
    queryKey: code ? gcMajlisKeys.invite(code) : ["gc-majlis-invalid-invite", rawCode],
    enabled: Boolean(code),
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const preview = code ? unwrapInvite(previewQuery.data, code) : null;

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-gradient-to-b from-emerald-950 via-[#0F8054] to-background" dir="rtl">
      <Header user={user || undefined} />
      <main className="grid flex-1 place-items-center px-4 py-10">
        <section className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/15 bg-card shadow-2xl shadow-emerald-950/30">
          <div className="relative overflow-hidden bg-gradient-to-bl from-[#14905C] via-[#0F8054] to-[#075339] px-6 py-9 text-white">
            <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(circle_at_20%_30%,white_1px,transparent_1px)] [background-size:24px_24px]" />
            <div className="relative">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                <Users className="h-7 w-7" aria-hidden="true" />
              </span>
              <p className="mt-5 text-sm font-bold text-emerald-100">وصلتك دعوة خاصة</p>
              <h1 className="mt-1 text-3xl font-black">مجلس توقعات خليجي 27</h1>
              <p className="mt-2 text-sm leading-7 text-emerald-50/85">نافس أهلك وأصدقاءك، واكتشف توقعاتهم بعد إقفال كل مباراة.</p>
            </div>
          </div>

          <div className="p-6">
            {!code ? (
              <InviteError title="رمز الدعوة غير صالح" description="تأكد من أن الرابط وصل كاملًا، أو اطلب من صاحب المجلس مشاركته مجددًا." onBack={onBack} />
            ) : previewQuery.isLoading || authLoading ? (
              <div className="space-y-3" role="status" aria-label="جارٍ التحقق من الدعوة">
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="h-16 w-full rounded-2xl" />
                <Skeleton className="h-11 w-full rounded-xl" />
              </div>
            ) : previewQuery.isError || !preview ? (
              <InviteError title="لم نجد هذا المجلس" description="قد يكون الرابط منتهيًا أو حُذف المجلس. تحقق من الرمز وحاول مرة أخرى." onBack={onBack} retry={() => void previewQuery.refetch()} />
            ) : (
              <InviteConsent preview={preview} joining={joining} onJoin={() => onJoin(code)} onBack={onBack} />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function InviteConsent({ preview, joining, onJoin, onBack }: { preview: GcMajlisInvitePreview; joining: boolean; onJoin: () => void; onBack: () => void }) {
  const full = preview.full === true || (preview.maxMembers != null && preview.membersCount >= preview.maxMembers);
  return (
    <>
      <div className="rounded-2xl border border-emerald-600/20 bg-emerald-600/[0.06] p-4">
        <p className="text-xs font-bold text-muted-foreground">المجلس</p>
        <h2 className="mt-1 text-2xl font-black">{preview.name}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" /> {formatNumber(preview.membersCount)}{preview.maxMembers ? ` من ${formatNumber(preview.maxMembers)}` : ""} عضو</span>
          <span className="rounded-full bg-background px-2.5 py-1 font-black tracking-widest ring-1 ring-border" dir="ltr">{preview.code}</span>
        </div>
      </div>
      <div className={`mt-5 rounded-xl px-3 py-3 text-xs leading-6 ${full ? "bg-amber-500/10 text-amber-800 dark:text-amber-200" : "bg-muted/50 text-muted-foreground"}`}>
        {full
          ? "اكتمل هذا المجلس ووصل إلى الحد الأعلى. إن كنت عضوًا فيه فاضغط «فتح المجلس» للعودة إليه؛ أما العضو الجديد فلن يُضاف حتى يتوفر مقعد."
          : "لن تنضم تلقائيًا بمجرد فتح الرابط. بالضغط على «انضم إلى المجلس» توافق على ظهور اسمك وترتيبك وتوقعاتك بعد إقفال المباريات لأعضاء هذا المجلس."}
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Button onClick={onJoin} disabled={joining} className="flex-1 gap-2 bg-[#0F8054] text-white hover:bg-[#0A6B47]">
          {joining ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <UserPlus className="h-4 w-4" />}
          {joining ? "جارٍ الفتح…" : full ? "فتح المجلس" : "انضم إلى المجلس"}
        </Button>
        <Button variant="ghost" onClick={onBack}>ليس الآن</Button>
      </div>
    </>
  );
}

function InviteError({ title, description, onBack, retry }: { title: string; description: string; onBack: () => void; retry?: () => void }) {
  return (
    <div className="py-4 text-center">
      <CircleAlert className="mx-auto h-10 w-10 text-destructive/70" />
      <h2 className="mt-3 text-xl font-black">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="mt-4 flex justify-center gap-2">
        {retry ? <Button variant="outline" onClick={retry}>أعد المحاولة</Button> : null}
        <Button variant="ghost" onClick={onBack}>افتح المجالس</Button>
      </div>
    </div>
  );
}

function HubSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]" role="status" aria-label="جارٍ تحميل المجالس">
      <Skeleton className="hidden h-[520px] rounded-3xl lg:block" />
      <div className="space-y-4"><Skeleton className="h-52 rounded-3xl" /><Skeleton className="h-12 rounded-full" /><Skeleton className="h-40 rounded-2xl" /></div>
    </div>
  );
}

function GuestHub({ onLogin, onCode }: { onLogin: () => void; onCode: (code: string) => void }) {
  const [code, setCode] = useState("");
  return (
    <section className="relative overflow-hidden rounded-3xl border border-emerald-800/20 bg-gradient-to-bl from-[#14905C] via-[#0F8054] to-[#075339] px-6 py-12 text-white shadow-xl sm:px-10">
      <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(circle_at_20%_30%,white_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="relative max-w-2xl">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold ring-1 ring-white/20"><Users className="h-4 w-4" /> توقعاتك بين ناسك</span>
        <h1 className="mt-5 text-4xl font-black sm:text-5xl">المجلس يحوّل كل مباراة إلى مسامرة</h1>
        <p className="mt-4 max-w-xl text-base leading-8 text-emerald-50/90">أنشئ مجلسك، ادعُ من تحب، وشاهد توقعات الجميع لحظة إقفال المباراة. المنافسة هنا أقرب وأمتع من ترتيب آلاف الغرباء.</p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Button onClick={onLogin} className="gap-2 bg-white text-[#0A6B47] hover:bg-emerald-50"><LogIn className="h-4 w-4" /> سجّل دخولك وأنشئ مجلسًا</Button>
          <form onSubmit={(event) => { event.preventDefault(); const normalized = normalizeMajlisInviteCode(code); if (normalized) onCode(normalized); }} className="flex gap-2">
            <label className="sr-only" htmlFor="guest-majlis-code">رمز دعوة المجلس</label>
            <input id="guest-majlis-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} dir="ltr" maxLength={8} placeholder="رمز الدعوة" className="min-w-0 flex-1 rounded-xl border border-white/25 bg-white/10 px-3 text-center text-sm font-black tracking-widest text-white placeholder:text-emerald-100/65 outline-none focus:ring-2 focus:ring-white/60" />
            <Button type="submit" disabled={!normalizeMajlisInviteCode(code)} variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">فتح الدعوة</Button>
          </form>
        </div>
      </div>
    </section>
  );
}

function MajlisRail({ majalis, selectedId, onSelect }: { majalis: GcMajlisSummary[]; selectedId?: string; onSelect: (id: string) => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [, setLocation] = useLocation();
  const create = useMutation({
    mutationFn: () => apiRequest("/api/gulf-cup/majlis", { method: "POST", body: JSON.stringify({ name: name.trim() }) }),
    onSuccess: async (raw) => {
      const majlis = unwrapMajlis(raw);
      setName("");
      await queryClient.invalidateQueries({ queryKey: gcMajlisKeys.mine });
      toast({ title: "أُنشئ مجلسك 🎉", description: majlis?.code ? `رمز الدعوة ${majlis.code}` : undefined });
      if (majlis) onSelect(majlis.id);
    },
    onError: (error: Error) => toast({ title: "تعذّر إنشاء المجلس", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-center gap-2"><Users className="h-5 w-5 text-[#0F8054]" /><h2 className="font-black">مجالسي</h2><span className="mr-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-black">{formatNumber(majalis.length)}</span></div>
      </div>
      <nav aria-label="قائمة المجالس" className="max-h-64 space-y-1 overflow-y-auto p-2">
        {majalis.length ? majalis.map((majlis) => (
          <button key={majlis.id} onClick={() => onSelect(majlis.id)} aria-current={majlis.id === selectedId ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-right transition ${majlis.id === selectedId ? "bg-[#0F8054] text-white shadow-sm" : "hover:bg-muted"}`}>
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${majlis.id === selectedId ? "bg-white/15" : "bg-emerald-600/10"}`}>{majlis.isOwner ? "👑" : "🪑"}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{majlis.name}</span><span className={`text-[10px] ${majlis.id === selectedId ? "text-emerald-100" : "text-muted-foreground"}`}>{formatNumber(majlis.membersCount)} عضو</span></span>
          </button>
        )) : <p className="px-3 py-6 text-center text-xs text-muted-foreground">أنشئ مجلسك الأول من الأسفل.</p>}
      </nav>

      <div className="space-y-3 border-t border-border p-3">
        <form onSubmit={(event) => { event.preventDefault(); if (name.trim().length >= 2) create.mutate(); }} className="space-y-2">
          <label htmlFor="majlis-name" className="text-xs font-black">أنشئ مجلسًا</label>
          <div className="flex gap-2"><input id="majlis-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="ديوانية الجمعة" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500/30" /><Button type="submit" size="icon" disabled={name.trim().length < 2 || create.isPending} aria-label="إنشاء المجلس" className="shrink-0 bg-[#0F8054] text-white hover:bg-[#0A6B47]">{create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}</Button></div>
        </form>
        <form onSubmit={(event) => { event.preventDefault(); const normalized = normalizeMajlisInviteCode(code); if (normalized) setLocation(`/gulf-cup/majlis?code=${encodeURIComponent(normalized)}`); }} className="space-y-2">
          <label htmlFor="majlis-invite-code" className="text-xs font-black">انضم برمز</label>
          <div className="flex gap-2"><input id="majlis-invite-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} dir="ltr" maxLength={8} placeholder="7KQ2MD" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-center text-xs font-black tracking-widest outline-none focus:ring-2 focus:ring-amber-500/30" /><Button type="submit" size="icon" disabled={!normalizeMajlisInviteCode(code)} aria-label="فتح دعوة المجلس" variant="outline"><UserPlus className="h-4 w-4" /></Button></div>
        </form>
      </div>
    </div>
  );
}

function MobileMajlisSelector({ majalis, selectedId, onSelect }: { majalis: GcMajlisSummary[]; selectedId?: string; onSelect: (id: string) => void }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const create = useMutation({
    mutationFn: () => apiRequest("/api/gulf-cup/majlis", { method: "POST", body: JSON.stringify({ name: name.trim() }) }),
    onSuccess: async (raw) => {
      const majlis = unwrapMajlis(raw);
      setName("");
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: gcMajlisKeys.mine });
      if (majlis) onSelect(majlis.id);
    },
    onError: (error: Error) => toast({ title: "تعذّر إنشاء المجلس", description: error.message, variant: "destructive" }),
  });
  return (
    <div className="mb-3 lg:hidden">
      <div className="mb-1 flex items-center gap-2"><label htmlFor="mobile-majlis-selector" className="block text-xs font-black">المجلس الحالي</label><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="mobile-majlis-manager" className="mr-auto inline-flex items-center gap-1 text-xs font-bold text-[#0F8054] dark:text-emerald-300"><Plus className="h-3.5 w-3.5" /> مجلس أو دعوة</button></div>
      <select id="mobile-majlis-selector" value={selectedId ?? ""} onChange={(event) => onSelect(event.target.value)} disabled={!majalis.length} className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm font-bold shadow-sm">
        {!majalis.length ? <option value="">لا مجالس بعد</option> : null}
        {majalis.map((majlis) => <option key={majlis.id} value={majlis.id}>{majlis.name} · {formatNumber(majlis.membersCount)} عضو</option>)}
      </select>
      {open ? (
        <div id="mobile-majlis-manager" className="mt-2 grid gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm sm:grid-cols-2">
          <form onSubmit={(event) => { event.preventDefault(); if (name.trim().length >= 2) create.mutate(); }} className="flex gap-2">
            <label htmlFor="mobile-majlis-name" className="sr-only">اسم المجلس الجديد</label>
            <input id="mobile-majlis-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="اسم مجلس جديد" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs" />
            <Button type="submit" size="sm" disabled={name.trim().length < 2 || create.isPending} className="bg-[#0F8054] text-white hover:bg-[#0A6B47]">إنشاء</Button>
          </form>
          <form onSubmit={(event) => { event.preventDefault(); const normalized = normalizeMajlisInviteCode(code); if (normalized) setLocation(`/gulf-cup/majlis?code=${encodeURIComponent(normalized)}`); }} className="flex gap-2">
            <label htmlFor="mobile-majlis-code" className="sr-only">رمز دعوة مجلس</label>
            <input id="mobile-majlis-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} dir="ltr" maxLength={8} placeholder="رمز الدعوة" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-center text-xs font-black tracking-widest" />
            <Button type="submit" size="sm" variant="outline" disabled={!normalizeMajlisInviteCode(code)}>فتح</Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function MajlisHero({ majlis }: { majlis: GcMajlisSummary }) {
  const { toast } = useToast();
  const notificationQuery = useQuery<unknown>({
    queryKey: ["/api/gulf-cup/majlis/notification-preference"],
    staleTime: 60_000,
  });
  const enabled = notificationEnabled(notificationQuery.data);
  const preferenceMutation = useMutation({
    mutationFn: (next: boolean) => apiRequest("/api/gulf-cup/majlis/notification-preference", {
      method: "PUT",
      body: JSON.stringify({ enabled: next }),
    }),
    onMutate: async (next) => {
      const key = ["/api/gulf-cup/majlis/notification-preference"];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, { enabled: next });
      return { previous };
    },
    onError: (error: Error, _next, context) => {
      queryClient.setQueryData(["/api/gulf-cup/majlis/notification-preference"], context?.previous);
      toast({ title: "تعذّر حفظ تفضيل الإشعارات", description: error.message, variant: "destructive" });
    },
    onSuccess: (_data, next) => toast({ title: next ? "فُعّلت إشعارات المجالس" : "أُوقفت إشعارات المجالس" }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["/api/gulf-cup/majlis/notification-preference"] }),
  });

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-bl from-[#14905C] via-[#0F8054] to-[#075339] p-5 text-white shadow-lg sm:p-7">
      <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(circle_at_20%_30%,white_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-100"><span>{majlis.isOwner ? "عميد المجلس" : "عضو في المجلس"}</span><span>·</span><span>{formatNumber(majlis.membersCount)} عضو</span></div>
          <h1 className="mt-2 truncate text-3xl font-black sm:text-4xl">{majlis.name}</h1>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/20"><span className="text-[10px] font-bold text-emerald-100">رمز الدعوة</span><span className="font-black tracking-widest text-amber-200" dir="ltr">{majlis.code}</span></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="icon"
            disabled={notificationQuery.isLoading || preferenceMutation.isPending}
            onClick={() => preferenceMutation.mutate(!enabled)}
            className="text-white hover:bg-white/10 hover:text-white"
            aria-label={enabled ? "إيقاف إشعارات المجالس" : "تفعيل إشعارات المجالس"}
            title={enabled ? "إيقاف إشعارات المجالس" : "تفعيل إشعارات المجالس"}
          >
            {enabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
          </Button>
          <GcMajlisShareDialog majlis={majlis} />
          <LeaveMajlisButton majlis={majlis} />
        </div>
      </div>
    </section>
  );
}

function LeaveMajlisButton({ majlis }: { majlis: GcMajlisSummary }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const mutation = useMutation({
    mutationFn: () => apiRequest(`/api/gulf-cup/majlis/${majlis.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: gcMajlisKeys.mine });
      toast({ title: majlis.isOwner ? "حُذف المجلس" : "غادرت المجلس" });
      setLocation("/gulf-cup/majlis");
    },
    onError: (error: Error) => toast({ title: "تعذّر التنفيذ", description: error.message, variant: "destructive" }),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" aria-label={majlis.isOwner ? "حذف المجلس" : "مغادرة المجلس"}>{majlis.isOwner ? <Trash2 className="h-5 w-5" /> : <DoorOpen className="h-5 w-5" />}</Button></AlertDialogTrigger>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader className="text-right"><AlertDialogTitle>{majlis.isOwner ? `حذف «${majlis.name}»؟` : `مغادرة «${majlis.name}»؟`}</AlertDialogTitle><AlertDialogDescription>{majlis.isOwner ? "سيُحذف المجلس من جميع الأعضاء نهائيًا. لا يمكن التراجع عن هذه الخطوة." : "ستختفي منافسة المجلس من حسابك، ويمكنك العودة لاحقًا برمز دعوة صالح."}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:flex-row-reverse"><AlertDialogAction onClick={() => mutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{mutation.isPending ? "جارٍ التنفيذ…" : majlis.isOwner ? "حذف نهائي" : "مغادرة"}</AlertDialogAction><AlertDialogCancel>إلغاء</AlertDialogCancel></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MajlisViewTabs({ active, onChange }: { active: MajlisView; onChange: (view: MajlisView) => void }) {
  const moveFocus = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowLeft") nextIndex = (index + 1) % VIEWS.length;
    if (event.key === "ArrowRight") nextIndex = (index - 1 + VIEWS.length) % VIEWS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = VIEWS.length - 1;
    if (nextIndex == null) return;
    event.preventDefault();
    const next = VIEWS[nextIndex].key;
    onChange(next);
    window.requestAnimationFrame(() => document.getElementById(`majlis-tab-${next}`)?.focus());
  };

  return (
    <div role="tablist" aria-label="أقسام المجلس" className="mt-4 flex gap-1 overflow-x-auto rounded-full bg-muted p-1 [scrollbar-width:none]">
      {VIEWS.map((item, index) => {
        const Icon = item.icon;
        const selected = active === item.key;
        return <button key={item.key} id={`majlis-tab-${item.key}`} role="tab" aria-selected={selected} aria-controls="majlis-view-panel" tabIndex={selected ? 0 : -1} onClick={() => onChange(item.key)} onKeyDown={(event) => moveFocus(event, index)} className={`inline-flex min-w-max flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-black transition motion-reduce:transition-none ${selected ? "bg-[#0F8054] text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{item.label}</button>;
      })}
    </div>
  );
}

function EmptyMajlis({ onCreated, onInvite }: { onCreated: (majlis: GcMajlisSummary) => void; onInvite: (code: string) => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const create = useMutation({
    mutationFn: () => apiRequest("/api/gulf-cup/majlis", { method: "POST", body: JSON.stringify({ name: name.trim() }) }),
    onSuccess: async (raw) => {
      const majlis = unwrapMajlis(raw);
      await queryClient.invalidateQueries({ queryKey: gcMajlisKeys.mine });
      if (majlis) onCreated(majlis);
    },
    onError: (error: Error) => toast({ title: "تعذّر إنشاء المجلس", description: error.message, variant: "destructive" }),
  });
  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="mx-auto max-w-2xl text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-600/10 text-[#0F8054]"><Users className="h-8 w-8" /></span><h1 className="mt-4 text-2xl font-black">ابدأ مجلسك الأول</h1><p className="mt-2 text-sm leading-7 text-muted-foreground">سمّه باسم ديوانيتكم أو فريق العمل، ثم شارك الدعوة. أو افتح رمزًا وصلك من صديق.</p></div>
      <div className="mx-auto mt-7 grid max-w-2xl gap-4 sm:grid-cols-2">
        <form onSubmit={(event) => { event.preventDefault(); if (name.trim().length >= 2) create.mutate(); }} className="rounded-2xl border border-border p-4"><label htmlFor="empty-majlis-name" className="text-sm font-black">أنشئ مجلسك</label><input id="empty-majlis-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="مثل: ديوانية الجمعة" className="mt-3 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30" /><Button type="submit" disabled={name.trim().length < 2 || create.isPending} className="mt-2 w-full gap-2 bg-[#0F8054] text-white hover:bg-[#0A6B47]"><Plus className="h-4 w-4" />{create.isPending ? "جارٍ الإنشاء…" : "إنشاء المجلس"}</Button></form>
        <form onSubmit={(event) => { event.preventDefault(); const normalized = normalizeMajlisInviteCode(code); if (normalized) onInvite(normalized); }} className="rounded-2xl border border-border p-4"><label htmlFor="empty-majlis-code" className="text-sm font-black">انضم بدعوة</label><input id="empty-majlis-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} dir="ltr" maxLength={8} placeholder="7KQ2MD" className="mt-3 h-11 w-full rounded-xl border border-border bg-background px-3 text-center text-sm font-black tracking-widest outline-none focus:ring-2 focus:ring-amber-500/30" /><Button type="submit" disabled={!normalizeMajlisInviteCode(code)} variant="outline" className="mt-2 w-full gap-2"><UserPlus className="h-4 w-4" />فتح الدعوة</Button></form>
      </div>
    </section>
  );
}
