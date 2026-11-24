// مراجعة «صفتك تحت اسمك»: الحالي (ظاهر للقراء) بجانب المقترح، ثم اعتماد ونشر أو طلب تعديل.
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatWhen } from "@/components/writer/PublicBylineEditor";

const LIST_QUERY = "/api/admin/public-byline/requests?status=pending";

type Item = {
  userId: string;
  name: string;
  profileImageUrl: string | null;
  publicSlug: string | null;
  current: { titleAr: string | null; bioAr: string | null };
  proposed: { titleAr: string | null; bioAr: string | null };
  submittedAt: string | null;
};
type ListResponse = { counts: { pending: number; approvedLast30Days: number }; items: Item[] };

function Side({ label, title, bio, tone }: { label: string; title: string | null; bio: string | null; tone: "current" | "proposed" }) {
  const proposed = tone === "proposed";
  return (
    <div className={proposed ? "space-y-2 rounded-[18px] bg-[#E6F4FD] p-4 dark:bg-sky-950/30" : "space-y-2 rounded-[18px] bg-[#F7F9FB] p-4 dark:bg-muted/40"}>
      <p className={proposed ? "text-xs text-[#0B6FA8]" : "text-xs text-[#617183]"}>{label}</p>
      <p className="text-[15px] font-semibold">{title?.trim() || "بلا صفة"}</p>
      <p className="whitespace-pre-line text-[13px] leading-7 text-[#55667A] dark:text-muted-foreground">{bio?.trim() || "لا توجد نبذة."}</p>
    </div>
  );
}

function RequestCard({ item }: { item: Item }) {
  const { toast } = useToast();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const done = () => {
    queryClient.invalidateQueries({ queryKey: [LIST_QUERY] });
  };
  const approve = useMutation({
    mutationFn: () => apiRequest(`/api/admin/public-byline/requests/${encodeURIComponent(item.userId)}/approve`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "نُشرت الصفة الجديدة", description: `تظهر الآن تحت اسم ${item.name} على الموقع والتطبيقين.` });
      done();
    },
    onError: (e: unknown) => toast({ title: "تعذر الاعتماد", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });
  const askChanges = useMutation({
    mutationFn: () =>
      apiRequest(`/api/admin/public-byline/requests/${encodeURIComponent(item.userId)}/request-changes`, {
        method: "POST",
        body: JSON.stringify({ note }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      toast({ title: "أُرسلت ملاحظتك", description: "تبقى الصفة الحالية ظاهرة حتى يرسل التعديل." });
      done();
    },
    onError: (e: unknown) => toast({ title: "تعذر الإرسال", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });
  const busy = approve.isPending || askChanges.isPending;

  return (
    <div className="space-y-4 rounded-[22px] bg-card p-5 shadow-[0_2px_14px_rgba(27,43,58,0.06)] dark:border dark:border-border sm:p-6" data-testid={`byline-request-${item.userId}`}>
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          <AvatarImage src={item.profileImageUrl || undefined} alt="" />
          <AvatarFallback className="bg-[#E6F4FD] font-bold text-[#0B6FA8]">{item.name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold">{item.name || "بلا اسم"}</p>
          <p className="text-[13px] text-[#55667A] dark:text-muted-foreground">أُرسل {formatWhen(item.submittedAt)}</p>
        </div>
        {item.publicSlug && (
          <a href={`/reporter/${item.publicSlug}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-[#0B6FA8] hover:text-[#08557F]">
            صفحته للقراء
          </a>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Side label="الحالي (ظاهر للقراء)" title={item.current.titleAr} bio={item.current.bioAr} tone="current" />
        <Side label="المقترح" title={item.proposed.titleAr} bio={item.proposed.bioAr} tone="proposed" />
      </div>
      {asking && (
        <div className="space-y-2">
          <label htmlFor={`note-${item.userId}`} className="text-sm font-semibold">ما الذي يحتاج تعديلًا؟</label>
          <textarea
            id={`note-${item.userId}`}
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="مثل: اختصر الصفة إلى سطر واحد."
            className="w-full resize-none rounded-[14px] border border-[#DCE4EC] bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#1E9BE6] dark:border-border"
          />
        </div>
      )}
      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => approve.mutate()}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-[#1E9BE6] px-6 text-[15px] font-semibold text-white shadow-[0_4px_14px_rgba(30,155,230,0.3)] hover:bg-[#178BD0] disabled:opacity-50"
          data-testid={`button-byline-approve-${item.userId}`}
        >
          {approve.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          اعتماد ونشر
        </button>
        <button
          type="button"
          disabled={busy || (asking && !note.trim())}
          onClick={() => (asking ? askChanges.mutate() : setAsking(true))}
          className="h-11 rounded-full bg-background px-5 text-[15px] shadow-[inset_0_0_0_1px_#DCE4EC] disabled:opacity-50"
          data-testid={`button-byline-ask-${item.userId}`}
        >
          {asking ? "إرسال الملاحظة" : "طلب تعديل"}
        </button>
        {asking && (
          <button type="button" onClick={() => { setAsking(false); setNote(""); }} className="h-11 px-3 text-sm text-[#55667A]">
            إلغاء
          </button>
        )}
      </div>
    </div>
  );
}

export function PublicBylineReviewQueue() {
  const { data } = useQuery({ queryKey: [LIST_QUERY] });
  const list = (data ?? null) as ListResponse | null;
  const items = Array.isArray(list?.items) ? list.items : [];
  if (!list || items.length === 0) return null;

  return (
    <section className="space-y-3" dir="rtl" data-testid="section-public-byline-queue">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">صفات ونبذ بانتظارك</h2>
          <p className="text-xs text-[#617183] dark:text-muted-foreground">
            الاعتماد ينشر الصفة والنبذة فورًا على الموقع وiOS وأندرويد، ويصل الكاتب إشعار.
          </p>
        </div>
        <div className="flex gap-2">
          <span className="rounded-full bg-[#FFF6E5] px-3.5 py-1.5 text-[13px] font-semibold text-[#946000]">{list.counts.pending} بانتظارك</span>
          <span className="rounded-full bg-[#E8F6EF] px-3.5 py-1.5 text-[13px] font-semibold text-[#13734E]">{list.counts.approvedLast30Days} منشورة آخر 30 يومًا</span>
        </div>
      </div>
      {items.map((item) => (
        <RequestCard key={item.userId} item={item} />
      ))}
    </section>
  );
}
