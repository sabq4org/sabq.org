import { lazy, Suspense } from "react";
import { useRoute } from "wouter";
import { Loader2 } from "lucide-react";

const Profile = lazy(() => import("@/pages/Profile"));
const PublicProfile = lazy(() => import("@/pages/PublicProfile"));

/** تبويبات الملف الشخصي للعضو الحالي — أي شيء آخر يُعامل كمعرّف مستخدم عام */
export const PROFILE_TAB_IDS = new Set([
  "overview",
  "saved",
  "activity",
  "network",
  "cards",
  // أسماء قديمة للتوافق مع روابط قائمة/إشارات
  "bookmarks",
  "journey",
  "followers",
  "wallet",
  "settings",
]);

function Fallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

/**
 * يفرّق بين `/profile/saved` (تبويب) و`/profile/<userId>` (ملف عام).
 */
export default function ProfileSegmentRouter() {
  const [, params] = useRoute("/profile/:segment");
  const segment = params?.segment ?? "";
  const isTab = PROFILE_TAB_IDS.has(segment);

  return (
    <Suspense fallback={<Fallback />}>
      {isTab ? <Profile /> : <PublicProfile />}
    </Suspense>
  );
}
