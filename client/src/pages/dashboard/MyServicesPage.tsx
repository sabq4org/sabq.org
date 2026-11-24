// ملفي وخدماتي — صفحة الكاتب والمراسل (المرحلة 1 من خطة تطوير لوحة الكاتب):
// شريط جاهزية، ثم «كيف يراك القارئ»، ثم الأوراق الرسمية صفوفًا تنفتح في مكانها.
// المرحلة 3: الصورة و«حسابي» وأدواري وسجل نشاطي هنا، بدل صفحة «الملف الشخصي» للكاتب.

import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { WriterPageFrame, WriterSurface } from "@/components/writer/WriterPageFrame";
import { NewBadge } from "@/components/writer/NewBadge";
import { PublicBylineEditor, PUBLIC_BYLINE_QUERY, type MyPublicByline } from "@/components/writer/PublicBylineEditor";
import { StaffProfileForm } from "@/components/staff/StaffProfileForm";
import { MyOfficialLettersCard } from "@/components/officialLetters/MyOfficialLettersCard";
import { WriterMediaLicenseCard } from "@/pages/opinion-author/WriterMediaLicenseCard";
import { WRITER_MEDIA_LICENSE_ANCHOR } from "@/lib/mediaLicenseAnchor";
import {
  WriterAccountGroup,
  WriterActivityBody,
  WriterIdentityStrip,
  WriterRolesBody,
  roleLabelAr,
  type WriterAccountUser,
} from "@/components/writer/WriterAccountSection";
import { useNewFeature } from "@/hooks/useNewFeatures";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  bylineReadiness,
  lettersReadiness,
  licenseReadiness,
  profileReadiness,
  type Readiness,
  type ReadinessTone,
} from "@/lib/myServicesReadiness";

type RowKey = "profile" | "letters" | "license" | "roles" | "activity";

const TONE_CLASS: Record<ReadinessTone, string> = {
  ok: "text-[#13734E] dark:text-emerald-400",
  wait: "text-[#946000] dark:text-amber-400",
  action: "text-[#0B6FA8] dark:text-sky-400",
  muted: "text-[#617183] dark:text-muted-foreground",
};
const CHIP_CLASS: Record<ReadinessTone, string> = {
  ok: "bg-[#E8F6EF] text-[#13734E] dark:bg-emerald-950/40 dark:text-emerald-300",
  wait: "bg-[#FFF6E5] text-[#946000] dark:bg-amber-950/40 dark:text-amber-300",
  action: "bg-[#E6F4FD] text-[#0B6FA8] dark:bg-sky-950/40 dark:text-sky-300",
  muted: "bg-[#F1F4F7] text-[#55667A] dark:bg-muted dark:text-muted-foreground",
};

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function MyServicesPage() {
  const { user } = useAuth();
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const isReporter = roles.includes("reporter") || user?.role === "reporter";
  const licenseEndpoint = isReporter ? "/api/reporter/media-license" : "/api/opinion-author/media-license";
  const enabled = Boolean(user?.id);

  const { data: accountRaw } = useQuery<WriterAccountUser | null>({ queryKey: ["/api/auth/user"], enabled });
  const { data: bylineRaw } = useQuery({ queryKey: [PUBLIC_BYLINE_QUERY], enabled });
  const { data: profileRaw } = useQuery({ queryKey: ["/api/staff-profiles/me"], enabled });
  const { data: lettersRaw } = useQuery({ queryKey: ["/api/official-letters/mine"], enabled });
  const { data: licenseRaw } = useQuery({ queryKey: [licenseEndpoint], enabled, staleTime: 60 * 1000 });
  const { isNew: bylineIsNew } = useNewFeature("public-byline");

  const byline = (bylineRaw ?? null) as MyPublicByline | null;
  const showByline = Boolean(byline?.eligible);

  const [openRow, setOpenRow] = useState<RowKey | null>(null);
  useEffect(() => {
    const fromHash = () => {
      if (window.location.hash === `#${WRITER_MEDIA_LICENSE_ANCHOR}`) setOpenRow("license");
      if (window.location.hash === "#my-staff-profile") setOpenRow("profile");
      const id = window.location.hash.slice(1);
      if (id === "account" || id === "public-byline") window.setTimeout(() => scrollToId(id), 300);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const profile = profileReadiness(profileRaw);
  const letters = lettersReadiness(lettersRaw);
  const license = licenseReadiness(licenseRaw);

  const cells: Array<Readiness & { key: string; label: string; isNew?: boolean; onClick: () => void }> = [
    ...(showByline
      ? [{
          key: "byline",
          label: "كيف يراك القارئ",
          isNew: bylineIsNew,
          ...bylineReadiness(byline),
          onClick: () => scrollToId("public-byline"),
        }]
      : []),
    { key: "profile", label: "الملف المعتمد", ...profile, onClick: () => { setOpenRow("profile"); scrollToId("row-profile"); } },
    { key: "letters", label: "شهادة التعريف", ...letters, onClick: () => { setOpenRow("letters"); scrollToId("row-letters"); } },
    { key: "license", label: "الترخيص المهني", ...license, onClick: () => { setOpenRow("license"); scrollToId("row-license"); } },
  ];

  const account = accountRaw && typeof accountRaw === "object" && "id" in accountRaw ? accountRaw : null;
  const roleLabel =
    account?.roleLabel || roleLabelAr(byline?.staffType ?? (isReporter ? "reporter" : "opinion_author"));

  const rows: Array<{ key: RowKey; label: string; sub: string; readiness?: Readiness; action: string; body: ReactNode }> = [
    {
      key: "profile",
      label: "الملف المعتمد",
      sub: "الاسم الرباعي والصورة وبيانات التواصل. يعتمده مسؤول المنسوبين، ويؤهلك لإصدار شهادة التعريف.",
      readiness: profile,
      action: profile.tone === "ok" ? "عرض الملف" : "استكمال الملف",
      body: user?.id ? <StaffProfileForm userId={user.id} mode="page" access="self" /> : null,
    },
    {
      key: "letters",
      label: "شهادة التعريف",
      sub: "شهادة رسمية باسمك من سبق، تُصدرها وتحمّلها بنفسك بعد اعتماد ملفك.",
      readiness: letters,
      action: letters.tone === "ok" ? "تحميل" : "إصدار",
      body: <MyOfficialLettersCard />,
    },
    {
      key: "license",
      label: "الترخيص المهني",
      sub: "رقم ترخيص هيئة تنظيم الإعلام وتاريخ انتهائه وصورته.",
      readiness: license,
      action: license.tone === "ok" ? "تحديث" : "تسجيل الترخيص",
      body: <WriterMediaLicenseCard endpoint={licenseEndpoint} />,
    },
    {
      key: "roles",
      label: "أدواري",
      sub: `${roleLabel}: ما تستطيع فعله في لوحة التحكم.`,
      action: "عرض",
      body: <WriterRolesBody />,
    },
    {
      key: "activity",
      label: "سجل نشاطي",
      sub: "ما فعلته في لوحة التحكم: الإرسال والتعديل وغيرهما.",
      action: "عرض السجل",
      body: <WriterActivityBody />,
    },
  ];

  return (
    <WriterPageFrame
      title="ملفي وخدماتي"
      description="كل ما يخصك في مكان واحد: حسابك، وكيف يراك القارئ، وأوراقك الرسمية."
      titleTestId="text-my-services-title"
    >
      {account && (
        <WriterIdentityStrip user={account} title={byline?.current?.titleAr ?? null} roleLabel={roleLabel} />
      )}

      <WriterSurface
        className={cn(
          "grid gap-px overflow-hidden bg-[#EEF2F6] dark:bg-border",
          cells.length === 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-3",
        )}
      >
        {cells.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={c.onClick}
            className="flex min-h-[76px] flex-col items-start gap-1.5 bg-card px-5 py-4 text-start transition hover:bg-[#F7F9FB] dark:hover:bg-muted/40"
            data-testid={`readiness-${c.key}`}
          >
            <span className="flex items-center gap-2 text-[13px] text-[#617183] dark:text-muted-foreground">
              {c.label}
              {c.isNew && <NewBadge />}
            </span>
            <span className={cn("text-[15px] font-semibold", TONE_CLASS[c.tone])}>{c.value}</span>
          </button>
        ))}
      </WriterSurface>

      {account && <WriterAccountGroup user={account} />}

      {showByline && <PublicBylineEditor />}

      <div className="space-y-2.5">
        <h2 className="text-[17px] font-bold">أوراقي وسجلي</h2>
        <WriterSurface className="divide-y divide-[#EEF2F6] dark:divide-border">
          {rows.map((r) => {
            const open = openRow === r.key;
            return (
              <div key={r.key} id={`row-${r.key}`} className="scroll-mt-24">
                <button
                  type="button"
                  onClick={() => setOpenRow(open ? null : r.key)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-4 px-5 py-4 text-start sm:px-6"
                  data-testid={`row-toggle-${r.key}`}
                >
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block text-[15px] font-semibold">{r.label}</span>
                    <span className="block text-[13px] leading-6 text-[#55667A] dark:text-muted-foreground">{r.sub}</span>
                  </span>
                  {r.readiness && (
                    <span className={cn("hidden shrink-0 rounded-full px-3 py-1 text-xs font-semibold sm:inline", CHIP_CLASS[r.readiness.tone])}>
                      {r.readiness.chip}
                    </span>
                  )}
                  <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-[#0B6FA8]">
                    {open ? "إغلاق" : r.action}
                    <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
                  </span>
                </button>
                {open && <div className="px-4 pb-5 sm:px-6">{r.body}</div>}
              </div>
            );
          })}
        </WriterSurface>
      </div>
    </WriterPageFrame>
  );
}
