// صفحة ملف المنسوب — /dashboard/staff-profiles/:userId
// الرأس الداكن (الاسم + الرقم الوظيفي + حلقة الاكتمال) + الفورم بوضع الصفحة.

import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StaffProfileForm } from "@/components/staff/StaffProfileForm";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function StaffProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;

  const { data: dataRaw } = useQuery({ queryKey: [`/api/staff-profiles/${userId}`], enabled: Boolean(userId) });
  const data = (dataRaw ?? null) as {
    user?: { firstName: string | null; lastName: string | null; email: string; profileImageUrl: string | null };
    profile?: { employeeNumber?: string | null; completionPercent?: number } | null;
  } | null;

  const name = data?.user
    ? [data.user.firstName, data.user.lastName].filter(Boolean).join(" ") || data.user.email
    : "…";
  const percent = data?.profile?.completionPercent ?? 0;

  return (
    <DashboardLayout>
      <div dir="rtl" className="space-y-4 p-1">
        <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-l from-[#10233A] to-[#17294A] p-5 text-white">
          <Link href="/dashboard/staff-profiles">
            <Button size="icon" variant="ghost" className="text-white/80 hover:text-white"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          {data?.user?.profileImageUrl ? (
            <img src={data.user.profileImageUrl} alt="" className="h-14 w-14 rounded-full border-2 border-white/25 object-cover" />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-full border-2 border-white/25 bg-sky-500 text-lg font-black">
              {name.slice(0, 1)}
            </div>
          )}
          <div>
            <h1 className="text-lg font-black">{name}</h1>
            <div className="text-xs text-white/60" dir="ltr">{data?.profile?.employeeNumber ?? "بلا رقم وظيفي بعد"}</div>
          </div>
          <div className="mr-auto text-center">
            <div
              className="grid h-16 w-16 place-items-center rounded-full"
              style={{ background: `conic-gradient(#17A26B ${percent}%, rgba(255,255,255,.12) 0)` }}
            >
              <div className="grid h-12 w-12 place-items-center rounded-full bg-[#10233A] text-sm font-black">{percent}%</div>
            </div>
            <div className="mt-1 text-[10px] text-white/60">اكتمال الملف</div>
          </div>
        </div>

        {userId && <StaffProfileForm userId={userId} mode="page" />}
      </div>
    </DashboardLayout>
  );
}
