import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { AcPlayerCardDialog } from "@/components/asiancup/AcPlayerCardDialog";

/**
 * صفحة مسار اللاعب — تفتح بطاقة اللاعب مباشرةً، وعند الإغلاق تعود لكأس آسيا.
 */
export default function AsianCupPlayer() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const playerId = parseInt(params.id ?? "", 10);
  const validId = Number.isFinite(playerId) && playerId > 0;

  const [openPlayerId, setOpenPlayerId] = useState<number | null>(validId ? playerId : null);

  useEffect(() => {
    document.title = "بطاقة اللاعب — كأس آسيا 2027 | سبق";
  }, []);

  useEffect(() => {
    setOpenPlayerId(validId ? playerId : null);
  }, [playerId, validId]);

  const handleClose = () => {
    setOpenPlayerId(null);
    setLocation("/asian-cup");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />
      <main className="flex-1" />
      <AcPlayerCardDialog playerId={openPlayerId} onClose={handleClose} />
      <Footer />
    </div>
  );
}
