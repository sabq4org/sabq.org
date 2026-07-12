import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { AcMatchCenterDialog } from "@/components/asiancup/AcMatchCenterDialog";
import { AcPlayerCardDialog } from "@/components/asiancup/AcPlayerCardDialog";

/**
 * صفحة مسار المباراة — تفتح مركز المباراة مباشرةً، وعند الإغلاق تعود لكأس آسيا.
 */
export default function AsianCupMatch() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const matchId = parseInt(params.id ?? "", 10);
  const validId = Number.isFinite(matchId) && matchId > 0;

  const [openFixtureId, setOpenFixtureId] = useState<number | null>(validId ? matchId : null);
  const [openPlayerId, setOpenPlayerId] = useState<number | null>(null);

  useEffect(() => {
    document.title = "مركز المباراة — كأس آسيا 2027 | سبق";
  }, []);

  useEffect(() => {
    setOpenFixtureId(validId ? matchId : null);
  }, [matchId, validId]);

  const handleClose = () => {
    setOpenFixtureId(null);
    setLocation("/asian-cup");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />
      <main className="flex-1" />
      <AcMatchCenterDialog
        fixtureId={openFixtureId}
        onClose={handleClose}
        onOpenPlayer={setOpenPlayerId}
      />
      <AcPlayerCardDialog playerId={openPlayerId} onClose={() => setOpenPlayerId(null)} />
      <Footer />
    </div>
  );
}
