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
        <div className="flex items-center gap-4 rounded-2xl border bg-card p-5">
          <Link href="/dashboard/staff-profiles">
            <Button size="icon" variant="ghost" className="text-muted-foreground"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          {data?.user?.profileImageUrl ? (
            <img src={data.user.profileImageUrl} alt="" className="h-14 w-14 rounded-full border-2 border-sky-500/30 object-cover" />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-full bg-sky-500/15 text-lg font-black text-sky-600">
              {name.slice(0, 1)}
            </div>
          )}
          <div>
            <h1 className="text-lg font-black text-foreground">{name}</h1>
            <span className="mt-0.5 inline-block rounded-full bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-bold text-sky-600" dir="ltr">
              {data?.profile?.employeeNumber ?? "بلا رقم وظيفي بعد"}
            </span>
          </div>
          <div className="mr-auto text-center">
            <div
              className="grid h-16 w-16 place-items-center rounded-full"
              style={{ background: `conic-gradient(#1CA4F0 ${percent}%, hsl(var(--muted)) 0)` }}
            >
              <div className="grid h-12 w-12 place-items-center rounded-full bg-card text-sm font-black text-foreground">{percent}%</div>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">اكتمال الملف</div>
          </div>
        </div>

        {userId && <StaffProfileForm userId={userId} mode="page" />}
      </div>
    </DashboardLayout>
  );
}
