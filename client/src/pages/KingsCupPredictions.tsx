import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronRight, Trophy, Target, ListOrdered } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatKickoffDay, formatKickoffTime, type KcFixture, type KcTeam } from "@/components/kingscup/kcTypes";

const COMP = "kings-cup";

interface LongResponse {
  teams: { id: number; name: string; logo: string }[];
  locked: boolean;
  championVotes: { teamId: number | null; n: number }[];
  mine: { kind: string; teamId: number | null; teamName: string | null; playerName: string | null; status: string; pointsAwarded: number }[];
}

interface LeaderboardEntry {
  userId: string;
  name: string;
  avatar: string | null;
  totalPoints: number;
  predictions: number;
  rank: number;
}

function MatchPredictRow({ fixture, canEdit }: { fixture: KcFixture; canEdit: boolean }) {
  const { toast } = useToast();
  const { data } = useQuery<{ prediction: { predHome: number; predAway: number } | null }>({
    queryKey: [`/api/sports/match/${fixture.id}/predict`],
    queryFn: getQueryFn({ on401: "returnNull", silent: true }),
    enabled: canEdit,
  });
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  useEffect(() => {
    if (data?.prediction) {
      setHome(String(data.prediction.predHome));
      setAway(String(data.prediction.predAway));
    }
  }, [data?.prediction]);

  const mutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/sports/match/${fixture.id}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          predHome: Number(home),
          predAway: Number(away),
          kickoffTs: fixture.timestamp,
          competitionSlug: COMP,
          homeId: fixture.home.id,
          awayId: fixture.away.id,
          homeName: fixture.home.name,
          awayName: fixture.away.name,
          homeLogo: fixture.home.logo,
          awayLogo: fixture.away.logo,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/sports/match/${fixture.id}/predict`] });
      toast({ title: "تم حفظ توقّعك" });
    },
    onError: () => toast({ title: "تعذّر حفظ التوقّع", variant: "destructive" }),
  });

  const locked = fixture.status.live || fixture.status.finished || fixture.timestamp * 1000 <= Date.now();

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-2">
        <span>{fixture.round}</span>
        <span>{formatKickoffDay(fixture.date)} · {formatKickoffTime(fixture.date)}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <img src={fixture.home.logo} alt="" className="h-8 w-8 object-contain shrink-0" />
          <span className="text-sm font-bold truncate">{fixture.home.name}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0" dir="ltr">
          <Input
            type="number" min={0} max={30}
            value={home} onChange={(e) => setHome(e.target.value)}
            disabled={!canEdit || locked}
            className="w-12 h-9 text-center px-1"
          />
          <span className="text-muted-foreground">-</span>
          <Input
            type="number" min={0} max={30}
            value={away} onChange={(e) => setAway(e.target.value)}
            disabled={!canEdit || locked}
            className="w-12 h-9 text-center px-1"
          />
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-row-reverse">
          <img src={fixture.away.logo} alt="" className="h-8 w-8 object-contain shrink-0" />
          <span className="text-sm font-bold truncate">{fixture.away.name}</span>
        </div>
      </div>
      {canEdit && !locked && (
        <div className="flex justify-end mt-2">
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || home === "" || away === ""}
          >
            حفظ التوقّع
          </Button>
        </div>
      )}
      {locked && <p className="text-[11px] text-muted-foreground mt-2 text-left">أُقفل التوقّع</p>}
    </div>
  );
}

export default function KingsCupPredictions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isLoggedIn = Boolean(user);

  useEffect(() => {
    document.title = "توقّعات كأس خادم الحرمين الشريفين | سبق";
  }, []);

  const { data: fixturesData } = useQuery<{ fixtures: KcFixture[] }>({
    queryKey: ["/api/kings-cup/fixtures"],
    staleTime: 60_000,
  });
  const fixtures = Array.isArray(fixturesData?.fixtures) ? fixturesData.fixtures : [];
  const openFixtures = fixtures.filter((f) => !f.status.finished).sort((a, b) => a.timestamp - b.timestamp);

  const { data: longData } = useQuery<LongResponse>({
    queryKey: [`/api/sports/predictions/long?comp=${COMP}`],
    queryFn: getQueryFn({ on401: "returnNull", silent: true }),
  });
  const teams: KcTeam[] = (longData?.teams ?? []).map((t) => ({ ...t, winner: null }));

  const { data: leaderboardData } = useQuery<{ leaderboard: LeaderboardEntry[] }>({
    queryKey: ["/api/sports/leaderboard"],
    staleTime: 60_000,
  });
  const leaderboard = Array.isArray(leaderboardData?.leaderboard) ? leaderboardData.leaderboard : [];

  const [champion, setChampion] = useState("");
  const [scorer, setScorer] = useState("");
  useEffect(() => {
    const myChamp = longData?.mine?.find((m) => m.kind === "champion");
    const myScorer = longData?.mine?.find((m) => m.kind === "top_scorer");
    if (myChamp?.teamId) setChampion(String(myChamp.teamId));
    if (myScorer?.playerName) setScorer(myScorer.playerName);
  }, [longData?.mine]);

  const longMutation = useMutation({
    mutationFn: async (payload: { kind: "champion" | "top_scorer"; teamId?: number; playerName?: string }) =>
      apiRequest("/api/sports/predictions/long", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitionSlug: COMP, ...payload }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/sports/predictions/long?comp=${COMP}`] });
      toast({ title: "تم حفظ توقّعك" });
    },
    onError: () => toast({ title: "تعذّر الحفظ — قد تكون التوقّعات مُقفلة", variant: "destructive" }),
  });

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1 container max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Link href="/kings-cup">
          <a className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ChevronRight className="h-4 w-4" />
            العودة لمركز كأس الملك
          </a>
        </Link>

        <h1 className="text-2xl font-black mb-1">توقّعات كأس خادم الحرمين الشريفين</h1>
        <p className="text-sm text-muted-foreground mb-6">
          توقّع نتائج المباريات والبطل والهدّاف، واجمع النقاط.
        </p>

        {!isLoggedIn && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-4 mb-6 text-sm">
            سجّل الدخول لحفظ توقّعاتك والمنافسة على لوحة المتصدّرين.{" "}
            <Link href="/login"><a className="font-bold text-amber-700 dark:text-amber-400 underline">تسجيل الدخول</a></Link>
          </div>
        )}

        <Tabs defaultValue="matches">
          <TabsList className="grid grid-cols-3 mb-4">
            <TabsTrigger value="matches" className="gap-1"><Target className="h-4 w-4" /> المباريات</TabsTrigger>
            <TabsTrigger value="long" className="gap-1"><Trophy className="h-4 w-4" /> البطل والهدّاف</TabsTrigger>
            <TabsTrigger value="board" className="gap-1"><ListOrdered className="h-4 w-4" /> المتصدّرون</TabsTrigger>
          </TabsList>

          <TabsContent value="matches" className="space-y-3">
            {openFixtures.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">لا توجد مباريات قادمة للتوقّع حاليًا.</p>
            ) : (
              openFixtures.map((fx) => <MatchPredictRow key={fx.id} fixture={fx} canEdit={isLoggedIn} />)
            )}
          </TabsContent>

          <TabsContent value="long" className="space-y-6">
            {longData?.locked && (
              <p className="text-sm text-amber-600">أُقفلت توقّعات البطل والهدّاف (انطلقت الأدوار الحاسمة).</p>
            )}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2 font-bold"><Trophy className="h-4 w-4 text-amber-500" /> توقّع بطل البطولة</div>
              <Select value={champion} onValueChange={setChampion} disabled={!isLoggedIn || longData?.locked}>
                <SelectTrigger><SelectValue placeholder="اختر النادي البطل" /></SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!isLoggedIn || !champion || longData?.locked || longMutation.isPending}
                onClick={() => longMutation.mutate({ kind: "champion", teamId: Number(champion) })}
              >
                حفظ توقّع البطل
              </Button>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2 font-bold"><Target className="h-4 w-4 text-emerald-500" /> توقّع هدّاف البطولة</div>
              <Input
                placeholder="اسم اللاعب"
                value={scorer}
                onChange={(e) => setScorer(e.target.value)}
                disabled={!isLoggedIn || longData?.locked}
              />
              <Button
                size="sm"
                disabled={!isLoggedIn || scorer.trim().length < 2 || longData?.locked || longMutation.isPending}
                onClick={() => longMutation.mutate({ kind: "top_scorer", playerName: scorer.trim() })}
              >
                حفظ توقّع الهدّاف
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="board">
            {leaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">لا توجد نقاط بعد — كن أول المتوقّعين.</p>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                {leaderboard.map((e) => (
                  <div key={e.userId} className="flex items-center gap-3 p-3">
                    <span className="w-6 text-center font-black text-muted-foreground tabular-nums">{e.rank}</span>
                    {e.avatar ? (
                      <img src={e.avatar} alt="" className="h-9 w-9 rounded-full object-cover bg-muted" />
                    ) : (
                      <span className="h-9 w-9 rounded-full bg-muted" />
                    )}
                    <span className="flex-1 text-sm font-bold truncate">{e.name}</span>
                    <span className="text-sm font-black text-emerald-600 tabular-nums">{e.totalPoints} نقطة</span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <Footer />
    </div>
  );
}
