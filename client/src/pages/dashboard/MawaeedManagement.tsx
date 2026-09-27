import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";

type SeriesRow = { id: string; slug: string; titleAr: string; kind: string };
type OccurrenceRow = {
  id: string;
  seriesId: string;
  titleAr: string;
  startsOn: string;
  endsOn: string | null;
  sourceUrl: string;
  sourceTitle: string;
  certainty: "confirmed" | "expected" | "unverified";
  status: "scheduled" | "cancelled" | "superseded";
  published: boolean;
  regionGroup: "all" | "riyadh_most" | "western";
  hijriLabel: string | null;
  publicNote: string | null;
  ruleNote: string | null;
};
type ChangeRow = {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};
type AdminPayload = { series: SeriesRow[]; occurrences: OccurrenceRow[]; changes: ChangeRow[] };

type FormState = {
  id: string | null;
  seriesId: string;
  titleAr: string;
  startsOn: string;
  endsOn: string;
  sourceUrl: string;
  sourceTitle: string;
  certainty: OccurrenceRow["certainty"];
  status: OccurrenceRow["status"];
  published: boolean;
  regionGroup: OccurrenceRow["regionGroup"];
  hijriLabel: string;
  publicNote: string;
  ruleNote: string;
};

const EMPTY: FormState = {
  id: null,
  seriesId: "",
  titleAr: "",
  startsOn: "",
  endsOn: "",
  sourceUrl: "",
  sourceTitle: "",
  certainty: "confirmed",
  status: "scheduled",
  published: false,
  regionGroup: "all",
  hijriLabel: "",
  publicNote: "",
  ruleNote: "",
};

function labelFor(certainty: OccurrenceRow["certainty"], published: boolean): string {
  if (!published || certainty === "unverified") return "مسودة";
  if (certainty === "expected") return "متوقع";
  return "مؤكد";
}

export default function MawaeedManagement() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery<AdminPayload>({
    queryKey: ["/api/mawaeed/admin"],
    queryFn: () => apiRequest<AdminPayload>("/api/mawaeed/admin"),
  });
  const [form, setForm] = useState<FormState>(EMPTY);
  const [message, setMessage] = useState("");

  const series = data?.series ?? [];
  const occurrences = data?.occurrences ?? [];
  const changes = data?.changes ?? [];
  const grouped = useMemo(() => series.map((item) => ({
    series: item,
    rows: occurrences.filter((row) => row.seriesId === item.id),
  })), [series, occurrences]);

  const save = useMutation({
    mutationFn: async (body: FormState) => {
      const payload = {
        seriesId: body.seriesId,
        titleAr: body.titleAr,
        startsOn: body.startsOn,
        endsOn: body.endsOn || null,
        sourceUrl: body.sourceUrl,
        sourceTitle: body.sourceTitle,
        certainty: body.certainty,
        status: body.status,
        published: body.certainty === "unverified" ? false : body.published,
        regionGroup: body.regionGroup,
        hijriLabel: body.hijriLabel || null,
        publicNote: body.publicNote || null,
        ruleNote: body.ruleNote || null,
      };
      if (body.id) return apiRequest(`/api/mawaeed/admin/occurrences/${body.id}`, { method: "PUT", body: JSON.stringify(payload) });
      return apiRequest("/api/mawaeed/admin/occurrences", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: async () => {
      setMessage("حُفظ الموعد وسُجّل التغيير.");
      setForm(EMPTY);
      await queryClient.invalidateQueries({ queryKey: ["/api/mawaeed/admin"] });
    },
    onError: () => setMessage("لم يُحفظ الموعد. تحقق من الرابط والتاريخ."),
  });

  const confirm = useMutation({
    mutationFn: async (row: OccurrenceRow) => apiRequest(`/api/mawaeed/admin/occurrences/${row.id}/confirm`, {
      method: "POST",
      body: JSON.stringify({ sourceUrl: row.sourceUrl, sourceTitle: row.sourceTitle }),
    }),
    onSuccess: async () => {
      setMessage("أصبح الموعد مؤكدًا وظهر للزوار.");
      await queryClient.invalidateQueries({ queryKey: ["/api/mawaeed/admin"] });
    },
    onError: () => setMessage("التأكيد يحتاج رابط مصدر رسمي."),
  });

  function edit(row: OccurrenceRow) {
    setForm({
      id: row.id,
      seriesId: row.seriesId,
      titleAr: row.titleAr,
      startsOn: row.startsOn,
      endsOn: row.endsOn || "",
      sourceUrl: row.sourceUrl,
      sourceTitle: row.sourceTitle,
      certainty: row.certainty,
      status: row.status,
      published: row.published,
      regionGroup: row.regionGroup,
      hijriLabel: row.hijriLabel || "",
      publicNote: row.publicNote || "",
      ruleNote: row.ruleNote || "",
    });
    setMessage("");
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6" dir="rtl">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">مواعيدك</h1>
          <p className="text-sm text-muted-foreground">
            تحرير مواعيد الرواتب والإجازات والإيداع. المسودات لا تظهر في الصفحة العامة. كل حفظ يُكتب في سجل التغييرات.
          </p>
          <a className="text-sm text-primary underline" href="/mawaeed" target="_blank" rel="noreferrer">عرض الصفحة العامة</a>
        </header>

        {isLoading && <p>جارٍ التحميل…</p>}
        {isError && <Button type="button" variant="outline" onClick={() => refetch()}>تعذر التحميل — إعادة المحاولة</Button>}

        <form
          className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(form);
          }}
        >
          <h2 className="md:col-span-2 text-lg font-semibold">{form.id ? "تعديل موعد" : "موعد جديد"}</h2>
          <label className="space-y-1 text-sm">القسم
            <select className="h-10 w-full rounded-md border bg-background px-2" value={form.seriesId} onChange={(event) => setForm({ ...form, seriesId: event.target.value })} required>
              <option value="">اختر</option>
              {series.map((item) => <option key={item.id} value={item.id}>{item.titleAr}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">العنوان
            <Input value={form.titleAr} onChange={(event) => setForm({ ...form, titleAr: event.target.value })} required />
          </label>
          <label className="space-y-1 text-sm">يبدأ
            <Input type="date" value={form.startsOn} onChange={(event) => setForm({ ...form, startsOn: event.target.value })} required />
          </label>
          <label className="space-y-1 text-sm">ينتهي (اختياري)
            <Input type="date" value={form.endsOn} onChange={(event) => setForm({ ...form, endsOn: event.target.value })} />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">رابط المصدر الرسمي
            <Input value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} required dir="ltr" />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">اسم المصدر
            <Input value={form.sourceTitle} onChange={(event) => setForm({ ...form, sourceTitle: event.target.value })} required />
          </label>
          <label className="space-y-1 text-sm">الحالة للقارئ
            <select className="h-10 w-full rounded-md border bg-background px-2" value={form.certainty} onChange={(event) => setForm({ ...form, certainty: event.target.value as FormState["certainty"], published: event.target.value === "unverified" ? false : form.published })}>
              <option value="confirmed">مؤكد</option>
              <option value="expected">متوقع (محسوب)</option>
              <option value="unverified">بانتظار التحقق (مخفي)</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">النطاق
            <select className="h-10 w-full rounded-md border bg-background px-2" value={form.regionGroup} onChange={(event) => setForm({ ...form, regionGroup: event.target.value as FormState["regionGroup"] })}>
              <option value="all">كل المناطق</option>
              <option value="riyadh_most">الرياض ومعظم المناطق</option>
              <option value="western">مكة والمدينة وجدة والطائف</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.published} disabled={form.certainty === "unverified"} onChange={(event) => setForm({ ...form, published: event.target.checked })} />
            منشور في الصفحة العامة
          </label>
          <label className="space-y-1 text-sm">حالة السجل
            <select className="h-10 w-full rounded-md border bg-background px-2" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as FormState["status"] })}>
              <option value="scheduled">مجدول</option>
              <option value="cancelled">ملغى</option>
              <option value="superseded">استُبدل</option>
            </select>
          </label>
          <label className="space-y-1 text-sm md:col-span-2">ملاحظة للقارئ
            <Textarea value={form.publicNote} onChange={(event) => setForm({ ...form, publicNote: event.target.value })} />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">ملاحظة داخلية
            <Textarea value={form.ruleNote} onChange={(event) => setForm({ ...form, ruleNote: event.target.value })} />
          </label>
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "جارٍ الحفظ…" : "حفظ"}</Button>
            {form.id && <Button type="button" variant="outline" onClick={() => setForm(EMPTY)}>إلغاء التعديل</Button>}
          </div>
          {message && <p className="md:col-span-2 text-sm">{message}</p>}
        </form>

        {grouped.map((group) => (
          <section key={group.series.id} className="space-y-2">
            <h2 className="text-lg font-semibold">{group.series.titleAr}</h2>
            <ul className="space-y-2">
              {group.rows.map((row) => (
                <li key={row.id} className="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium">{row.titleAr}</p>
                    <p className="text-sm text-muted-foreground" dir="ltr">{row.startsOn} — {labelFor(row.certainty, row.published)} — {row.regionGroup}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => edit(row)}>تعديل</Button>
                    {row.certainty !== "confirmed" && (
                      <Button type="button" size="sm" variant="secondary" onClick={() => confirm.mutate(row)}>تحويل إلى مؤكد</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section>
          <h2 className="mb-2 text-lg font-semibold">سجل التغييرات</h2>
          <ul className="space-y-2 text-sm">
            {changes.map((change) => (
              <li key={change.id} className="rounded-lg border p-2">
                <span>{change.action}</span>
                {" — "}
                <span>{change.actorName || "النظام"}</span>
                {" — "}
                <time dateTime={change.createdAt}>{change.createdAt}</time>
              </li>
            ))}
            {changes.length === 0 && <li className="text-muted-foreground">لا تغييرات بعد.</li>}
          </ul>
        </section>
      </div>
    </DashboardLayout>
  );
}
