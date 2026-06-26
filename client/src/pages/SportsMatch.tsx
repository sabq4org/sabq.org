/**
 * صفحة المباراة المستقلّة — /sports/match/:id
 *
 * تعيد استخدام مكوّن MatchCenter الغنيّ نفسه الذي تستخدمه نافذة MatchDialog
 * (مجريات + تشكيلات + xG + ضغط + زخم + تعليق + تقييمات + مواجهات + ملخّص ذكي)،
 * لكن كصفحة كاملة قابلة للمشاركة والفهرسة (canonical + عنوان ديناميكي) بدل modal.
 */
import { useEffect } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { MatchCenter } from "./SportsHub";

interface MatchTitleData {
  fixture?: { home: { name: string }; away: { name: string }; round: string } | null;
}

export default function SportsMatch() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const valid = Number.isFinite(id) && id > 0;

  // استعلام خفيف للعنوان فقط؛ MatchCenter يعيد استخدام نفس الكاش (لا طلب مكرّر).
  const { data } = useQuery<MatchTitleData>({
    queryKey: [`/api/sports/match/${id}`],
    enabled: valid,
  });
  const fx = data?.fixture ?? null;

  useEffect(() => {
    document.title = fx
      ? `${fx.home.name} ضد ${fx.away.name} — مركز المباراة | سبق`
      : "مركز المباراة | سبق";
  }, [fx]);
  useCanonical(`https://sabq.org/sports/match/${valid ? id : ""}`);

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <Header user={user || undefined} />

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          <Link
            href="/sports"
            className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowRight className="h-4 w-4" /> البوابة الرياضية
          </Link>

          {valid ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <MatchCenter id={id} />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center text-sm text-muted-foreground">
              رقم المباراة غير صالح.
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
