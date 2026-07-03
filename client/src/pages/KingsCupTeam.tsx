import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { ChevronRight } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { KcMatchCard } from "@/components/kingscup/KcMatchCard";
import { KcMatchDialog } from "@/components/kingscup/KcMatchDialog";
import { KcPlayerDialog } from "@/components/kingscup/KcPlayerDialog";
import type { KcTeamProfile } from "@/components/kingscup/kcTypes";

export default function KingsCupTeam() {
  const { user } = useAuth();
  const [, params] = useRoute("/kings-cup/team/:teamId");
  const teamId = Number(params?.teamId);
  const [openFixtureId, setOpenFixtureId] = useState<number | null>(null);
  const [openPlayerId, setOpenPlayerId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<KcTeamProfile>({
    queryKey: [`/api/kings-cup/team/${teamId}`],
    enabled: Number.isFinite(teamId) && teamId > 0,
  });

  useEffect(() => {
    document.title = data?.team?.name
      ? `${data.team.name} — كأس خادم الحرمين الشريفين | سبق`
      : "نادٍ — كأس خادم الحرمين الشريفين | سبق";
  }, [data?.team?.name]);

  const fixtures = Array.isArray(data?.fixtures) ? data.fixtures : [];
  const squad = Array.isArray(data?.squad) ? data.squad : [];

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1 container max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Link href="/kings-cup">
          <a className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ChevronRight className="h-4 w-4" />
            العودة لمركز كأس الملك
          </a>
        </Link>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8">جارٍ التحميل…</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground py-8">تعذّر العثور على النادي.</p>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-8">
              <span className="h-20 w-20 rounded-full bg-white p-2 ring-1 ring-border shadow-sm shrink-0">
                <img src={data.team.logo} alt={data.team.name} className="h-full w-full object-contain" />
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-black truncate">{data.team.name}</h1>
                <div className="text-sm text-muted-foreground space-y-0.5 mt-1">
                  {data.team.founded && <p>تأسّس عام {data.team.founded}</p>}
                  {data.team.venue?.name && (
                    <p>
                      {data.team.venue.name}
                      {data.team.venue.city ? ` · ${data.team.venue.city}` : ""}
                      {data.team.venue.capacity ? ` · ${data.team.venue.capacity.toLocaleString("en-US")} متفرّج` : ""}
                    </p>
                  )}
                  {data.coach && <p>المدرّب: {data.coach.name}</p>}
                </div>
              </div>
            </div>

            {fixtures.length > 0 && (
              <section className="mb-8">
                <h2 className="text-lg font-black mb-4">مباريات النادي</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {fixtures.map((fx) => (
                    <KcMatchCard key={fx.id} fixture={fx} onOpen={setOpenFixtureId} />
                  ))}
                </div>
              </section>
            )}

            {squad.length > 0 && (
              <section className="mb-8">
                <h2 className="text-lg font-black mb-4">التشكيلة</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {squad.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => p.id > 0 && setOpenPlayerId(p.id)}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-right hover-elevate active-elevate-2"
                    >
                      {p.photo ? (
                        <img src={p.photo} alt={p.name} className="h-10 w-10 rounded-full object-cover bg-muted shrink-0" />
                      ) : (
                        <span className="h-10 w-10 rounded-full bg-muted shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {p.position}
                          {p.number != null ? ` · ${p.number}` : ""}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <KcMatchDialog
        fixtureId={openFixtureId}
        onClose={() => setOpenFixtureId(null)}
        onOpenPlayer={setOpenPlayerId}
      />
      <KcPlayerDialog playerId={openPlayerId} onClose={() => setOpenPlayerId(null)} />
      <Footer />
    </div>
  );
}
