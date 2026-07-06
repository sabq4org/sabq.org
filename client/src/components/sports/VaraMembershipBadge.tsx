import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

// مفتاح المعاينة: يظهر العنصر فقط عند فتح /sports?vara=1 (يُحفظ في localStorage).
// ?vara=0 يوقفه. بدون المفتاح لا يُعرض شيء إطلاقًا — فالزوار على /sports العادية لا يرونه.
function useVaraPreview(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("vara");
      if (q === "1") {
        localStorage.setItem("vara_preview", "1");
        setOn(true);
        return;
      }
      if (q === "0") {
        localStorage.removeItem("vara_preview");
        setOn(false);
        return;
      }
      setOn(localStorage.getItem("vara_preview") === "1");
    } catch {
      setOn(false);
    }
  }, []);
  return on;
}

// مؤشّر «الدخول بعضوية سبق» على البوابة الرياضية — تجربة ربط الموقع بعضوية سبق
// (نفس مفهوم مؤشّر الحساب في تطبيق VARA). خلف مفتاح ?vara=1 حتى الجاهزية الكاملة.
export function VaraMembershipBadge() {
  const preview = useVaraPreview();
  const { user, isAuthenticated, isLoading } = useAuth();
  if (!preview || isLoading) return null;

  const displayName = user?.firstName || user?.name || "حسابي";
  const initial = (user?.firstName || user?.name || user?.email || "؟").trim().charAt(0) || "؟";

  return (
    <div className="mt-4 flex items-center justify-center gap-2" data-testid="vara-membership">
      {isAuthenticated ? (
        <a
          href="/profile"
          className="inline-flex items-center gap-2.5 rounded-full border border-primary/25 bg-primary/5 px-3.5 py-1.5 transition hover:bg-primary/10"
          data-testid="vara-member-badge"
        >
          {user?.profileImageUrl ? (
            <img
              src={user.profileImageUrl}
              alt=""
              className="h-7 w-7 rounded-full object-cover ring-2 ring-primary/30"
            />
          ) : (
            <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
              {initial}
            </span>
          )}
          <span className="text-right leading-tight">
            <span className="block text-[13px] font-bold text-foreground">{displayName}</span>
            <span className="block text-[10.5px] font-extrabold text-primary">عضو سبق</span>
          </span>
        </a>
      ) : (
        <a
          href="/login"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-extrabold text-primary-foreground shadow-sm transition hover:opacity-90"
          data-testid="vara-login-cta"
        >
          <LogIn className="h-4 w-4" strokeWidth={2.4} />
          الدخول بعضوية سبق
        </a>
      )}
      <span
        className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400"
        title="عنصر معاينة — غير مرئي للزوار (?vara=1)"
      >
        معاينة
      </span>
    </div>
  );
}
