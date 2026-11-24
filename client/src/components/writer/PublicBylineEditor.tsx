// «كيف يراك القارئ»: الكاتب أو المراسل يقترح صفته ونبذته مع معاينة حيّة،
// والمحرر يعتمد من «مراجعة ملفات المنسوبين». القارئ يرى الحالي حتى الاعتماد.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNewFeature } from "@/hooks/useNewFeatures";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { PUBLIC_BIO_MAX, PUBLIC_TITLE_MAX, type PublicBylineStatus } from "@shared/publicByline";
import { NewBadge } from "./NewBadge";
import { WriterSurface } from "./WriterPageFrame";

export const PUBLIC_BYLINE_QUERY = "/api/public-byline/me";

export type MyPublicByline = {
  eligible: boolean;
  staffType: "opinion_author" | "reporter" | null;
  current: { slug: string | null; titleAr: string | null; bioAr: string | null };
  request: {
    titleAr: string | null;
    bioAr: string | null;
    status: PublicBylineStatus;
    reviewNote: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
  } | null;
};

const SUGGESTIONS = {
  opinion_author: ["كاتب رأي", "كاتب ومحلل اقتصادي", "أكاديمي وباحث"],
  reporter: ["مراسل صحفي", "مراسل ميداني", "محرر ومراسل"],
} as const;

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ar-SA-u-ca-gregory-nu-latn", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join(" ");
}

export function PublicBylineEditor() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isNew, markOpened } = useNewFeature("public-byline");
  const { data: raw, isLoading } = useQuery({ queryKey: [PUBLIC_BYLINE_QUERY], enabled: Boolean(user?.id) });
  const data = (raw ?? null) as MyPublicByline | null;

  const pendingOrNeedsChanges =
    data?.request && (data.request.status === "pending" || data.request.status === "needs_changes")
      ? data.request
      : null;
  const basis = useMemo(
    () => ({
      title: (pendingOrNeedsChanges ? pendingOrNeedsChanges.titleAr : data?.current.titleAr) ?? "",
      bio: (pendingOrNeedsChanges ? pendingOrNeedsChanges.bioAr : data?.current.bioAr) ?? "",
    }),
    [data, pendingOrNeedsChanges],
  );
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const basisKey = `${basis.title}\u0000${basis.bio}\u0000${data?.request?.status ?? ""}`;
  useEffect(() => {
    if (!data || loadedFor === basisKey) return;
    setTitle(basis.title);
    setBio(basis.bio);
    setLoadedFor(basisKey);
  }, [data, basis, basisKey, loadedFor]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: [PUBLIC_BYLINE_QUERY] });
  const submit = useMutation({
    mutationFn: () =>
      apiRequest(PUBLIC_BYLINE_QUERY, {
        method: "PUT",
        body: JSON.stringify({ titleAr: title, bioAr: bio }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      markOpened();
      toast({ title: "أُرسل للمراجعة", description: "تبقى صفتك الحالية ظاهرة للقراء حتى يعتمد المحرر." });
      refresh();
    },
    onError: (e: unknown) =>
      toast({ title: "تعذر الإرسال", description: e instanceof Error ? e.message : "حاول مرة أخرى", variant: "destructive" }),
  });
  const withdraw = useMutation({
    mutationFn: () => apiRequest(`${PUBLIC_BYLINE_QUERY}/withdraw`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "سُحب الطلب" });
      setLoadedFor(null);
      refresh();
    },
    onError: (e: unknown) =>
      toast({ title: "تعذر السحب", description: e instanceof Error ? e.message : "حاول مرة أخرى", variant: "destructive" }),
  });

  if (!user?.id || (data && !data.eligible)) return null;

  const staffType = data?.staffType ?? "opinion_author";
  const fallbackTitle = staffType === "reporter" ? "مراسل صحفي" : "كاتب رأي";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "اسمك";
  const status = data?.request?.status ?? null;
  const isPending = status === "pending";
  const needsChanges = status === "needs_changes";
  const changed = title.trim() !== basis.title.trim() || bio.trim() !== basis.bio.trim();
  const canSubmit = !submit.isPending && (changed || needsChanges) && Boolean(title.trim() || bio.trim());
  const submitLabel = isPending ? "تحديث الطلب" : needsChanges ? "إعادة الإرسال" : "إرسال للمراجعة";
  const stateText = isPending
    ? `أُرسل للمراجعة ${formatWhen(data?.request?.submittedAt)}`
    : data?.current.titleAr
      ? "منشورة الآن"
      : "لم تُضف صفة بعد";
  const titleShown = title.trim() || fallbackTitle;
  const bioShown = bio.trim() || "لم تُكتب نبذة بعد.";

  return (
    <div
      id="public-byline"
      className="flex scroll-mt-24 flex-col gap-6 lg:flex-row lg:items-start"
      onFocusCapture={markOpened}
      onPointerDownCapture={markOpened}
    >
      <WriterSurface className="min-w-0 flex-1 space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-[19px] font-bold">كيف يراك القارئ</h2>
          {isNew && <NewBadge />}
          <span className="ms-auto text-xs text-[#617183] dark:text-muted-foreground" data-testid="text-public-byline-state">
            {isLoading ? "…" : stateText}
          </span>
        </div>
        <p className="-mt-2 text-sm leading-7 text-[#55667A] dark:text-muted-foreground">
          صفتك ونبذتك تظهران تحت اسمك في كل {staffType === "reporter" ? "خبر" : "مقال"}، على الموقع والتطبيقين. يعتمدها المحرر قبل النشر.
        </p>

        {isPending && (
          <div className="rounded-2xl bg-[#FFF6E5] px-4 py-3 text-sm leading-7 text-[#946000]" data-testid="banner-public-byline-pending">
            تعديلك بانتظار المحرر. يرى القراء صفتك الحالية حتى الاعتماد.
          </div>
        )}
        {needsChanges && (
          <div className="rounded-2xl bg-[#FFF6E5] px-4 py-3 text-sm leading-7 text-[#946000]" data-testid="banner-public-byline-needs-changes">
            <span className="font-semibold">ملاحظة المحرر: </span>
            {data?.request?.reviewNote}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="public-byline-title" className="text-sm font-semibold">صفتك تحت اسمك</label>
            <span className="text-xs tabular-nums text-[#617183]">{title.length} / {PUBLIC_TITLE_MAX}</span>
          </div>
          <input
            id="public-byline-title"
            value={title}
            maxLength={PUBLIC_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value.replace(/\s*\n\s*/g, " "))}
            placeholder={fallbackTitle}
            className="h-12 w-full rounded-[14px] border border-[#DCE4EC] bg-background px-4 text-[15px] outline-none focus:ring-2 focus:ring-[#1E9BE6] dark:border-border"
            data-testid="input-public-byline-title"
          />
          <p className="text-xs text-[#617183] dark:text-muted-foreground">سطر قصير يعرّف بك: تخصصك أو صفتك المهنية.</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS[staffType].map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => setTitle(label)}
                className="h-9 rounded-full bg-[#E6F4FD] px-3.5 text-[13px] font-medium text-[#0B6FA8] transition hover:bg-[#D6ECFB]"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-[#EEF2F6] dark:bg-border" />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="public-byline-bio" className="text-sm font-semibold">نبذة عنك</label>
            <span className="text-xs tabular-nums text-[#617183]">{bio.length} / {PUBLIC_BIO_MAX}</span>
          </div>
          <textarea
            id="public-byline-bio"
            rows={5}
            value={bio}
            maxLength={PUBLIC_BIO_MAX}
            onChange={(e) => setBio(e.target.value)}
            className="w-full resize-none rounded-[14px] border border-[#DCE4EC] bg-background px-4 py-3 text-[15px] leading-8 outline-none focus:ring-2 focus:ring-[#1E9BE6] dark:border-border"
            data-testid="input-public-byline-bio"
          />
          <p className="text-xs text-[#617183] dark:text-muted-foreground">تظهر في صفحتك للقراء.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => submit.mutate()}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-[#1E9BE6] px-6 text-[15px] font-semibold text-white shadow-[0_4px_14px_rgba(30,155,230,0.3)] transition hover:bg-[#178BD0] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            data-testid="button-public-byline-submit"
          >
            {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitLabel}
          </button>
          {changed && (
            <button
              type="button"
              onClick={() => {
                setTitle(basis.title);
                setBio(basis.bio);
              }}
              className="h-12 rounded-full bg-background px-5 text-[15px] text-[#55667A] shadow-[inset_0_0_0_1px_#DCE4EC]"
            >
              تراجع
            </button>
          )}
          {isPending && (
            <button
              type="button"
              disabled={withdraw.isPending}
              onClick={() => withdraw.mutate()}
              className="h-12 rounded-full bg-background px-5 text-[15px] text-[#BF3038] shadow-[inset_0_0_0_1px_#F2D3D5]"
              data-testid="button-public-byline-withdraw"
            >
              سحب الطلب
            </button>
          )}
          {!isPending && (
            <span className="text-xs text-[#617183] dark:text-muted-foreground">تبقى صفتك الحالية ظاهرة حتى الاعتماد.</span>
          )}
        </div>
      </WriterSurface>

      <div className="flex w-full shrink-0 flex-col gap-3 lg:w-[400px]">
        <span className="text-[13px] text-[#55667A] dark:text-muted-foreground">معاينة حيّة</span>
        <WriterSurface className="space-y-3 p-5">
          <span className="text-xs text-[#617183]">{staffType === "reporter" ? "في الخبر" : "في المقال"}</span>
          <p className="text-[17px] font-bold leading-relaxed">
            {staffType === "reporter"
              ? "وزارة الصحة: بدء التسجيل في حملة لقاح الإنفلونزا الموسمية عبر تطبيق «صحتي»"
              : "جودة الحياة تبدأ من الوقاية: ماذا تغيّر في حملات التطعيم الموسمية؟"}
          </p>
          <div className="flex items-center gap-3 border-t border-[#EEF2F6] pt-3 dark:border-border">
            <Avatar className="h-11 w-11">
              <AvatarImage src={user.profileImageUrl || undefined} alt="" />
              <AvatarFallback className="bg-[#E6F4FD] font-bold text-[#0B6FA8]">{initials(name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-bold">{name}</p>
              <p className={cn("truncate text-[13px] text-[#55667A]")} data-testid="text-public-byline-preview-title">{titleShown}</p>
            </div>
          </div>
        </WriterSurface>
        <WriterSurface className="space-y-2 p-5">
          <span className="text-xs text-[#617183]">في صفحتك</span>
          <p className="text-sm font-medium text-[#0B6FA8]">{titleShown}</p>
          <p className="whitespace-pre-line text-[13px] leading-7 text-[#55667A] dark:text-muted-foreground">{bioShown}</p>
        </WriterSurface>
        <span className="text-xs text-[#617183] dark:text-muted-foreground">نفس الصفة تظهر في تطبيقي iOS وأندرويد دون تحديث.</span>
      </div>
    </div>
  );
}
