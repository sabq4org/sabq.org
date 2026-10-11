import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Radio, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { apiRequest } from "@/lib/queryClient";
import { hasPermission, useAuth } from "@/hooks/useAuth";

type Item = { id: string; articleIds: string[]; href: string | null; label: string; text: string };
type Bulletin = {
  id: string;
  title: string;
  status: "draft" | "generating" | "failed" | "published";
  revision: number;
  items: Item[];
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  publishedAt: string | null;
  error: string | null;
  audio: { url: string; durationSec: number; provider: string; chapters: Array<{ start: number; label: string }> } | null;
};
type AdminView = {
  scheduleEnabled: boolean;
  slots: number[];
  intro: string;
  outro: string;
  draft: Bulletin | null;
  current: Bulletin | null;
  live: boolean;
  history: Array<{ id: string; title: string; publishedAt: string | null; durationSec: number; provider: string; hiddenAt?: string }>;
  storageConfigured: boolean;
  sourceTitles: Record<string, string>;
};

const KEY = ["/api/audio-bulletin/admin"];
const PROVIDER: Record<string, string> = { gemini: "Gemini", humain: "HUMAIN", elevenlabs: "ElevenLabs", google: "Google" };
const dateTime = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
const fmtDate = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : "—");
const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export default function AudioBulletinPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canSchedule = hasPermission(user, "system.manage_settings");
  const [message, setMessage] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery<AdminView | null>({
    queryKey: KEY,
    // While audio is being produced, check every few seconds until it is published or fails.
    refetchInterval: (query) => ((query.state.data as AdminView | null)?.draft?.status === "generating" ? 4000 : false),
  });
  const draft = data?.draft ?? null;
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    setTitle(draft?.title ?? "");
    setItems(draft?.items ?? []);
  }, [draft?.id, draft?.revision]);

  const dirty = Boolean(draft && (title !== draft.title || JSON.stringify(items.map((i) => [i.id, i.label, i.text])) !== JSON.stringify(draft.items.map((i) => [i.id, i.label, i.text]))));
  const totalWords = words(data?.intro ?? "") + items.reduce((n, i) => n + words(i.text), 0) + words(data?.outro ?? "");
  const estimatedMinutes = totalWords / 135;

  const call = (url: string, method: string, body?: unknown) =>
    apiRequest<AdminView>(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const onDone = (text: string) => (next: AdminView) => { queryClient.setQueryData(KEY, next); setMessage(text); };
  const onFail = (error: Error) => setMessage(error.message);

  const create = useMutation({ mutationFn: () => call("/api/audio-bulletin/admin/draft", "POST"), onSuccess: onDone("كُتبت مسودة من أهم الأخبار المنشورة. راجعها قبل الاعتماد."), onError: onFail });
  const save = useMutation({ mutationFn: () => call("/api/audio-bulletin/admin/draft", "PUT", { revision: draft!.revision, title, items: items.map(({ id, label, text }) => ({ id, label, text })) }), onSuccess: onDone("حُفظ التعديل."), onError: onFail });
  const approve = useMutation({ mutationFn: () => call("/api/audio-bulletin/admin/draft/approve", "POST", { revision: draft!.revision }), onSuccess: onDone("اعتُمدت النشرة. يجري الآن تسجيلها بالصوت، وتظهر على الموقع فور انتهائه."), onError: onFail });
  const discard = useMutation({ mutationFn: () => call("/api/audio-bulletin/admin/draft", "DELETE"), onSuccess: onDone("حُذفت المسودة."), onError: onFail });
  const hide = useMutation({ mutationFn: () => call("/api/audio-bulletin/admin/hide", "POST"), onSuccess: onDone("أُخفيت النشرة من الموقع."), onError: onFail });
  const schedule = useMutation({ mutationFn: (enabled: boolean) => call("/api/audio-bulletin/admin/schedule", "PUT", { enabled }), onSuccess: onDone("حُفظت الجدولة."), onError: onFail });
  const busy = create.isPending || save.isPending || approve.isPending || discard.isPending;

  const move = (index: number, delta: number) => setItems((list) => {
    const next = [...list];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved);
    return next;
  });
  const patch = (id: string, change: Partial<Item>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...change } : i)));

  return (
    <DashboardLayout>
      <div className="mx-auto flex max-w-3xl flex-col gap-8 p-4 sm:p-6" dir="rtl">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold">نشرة سبق الصوتية</h1>
          </div>
          <p className="max-w-prose text-sm text-muted-foreground">
            جولة مسموعة لأهم الأخبار تظهر تحت الهيدر. يكتب النظام مسودة من الأخبار المنشورة، وتراجعها هنا وتعتمدها، ثم تُسجَّل بصوت الموجز وتُنشر. لا يُسمع شيء قبل الاعتماد، وتختفي النشرة من الموقع بعد 6 ساعات.
          </p>
          {message && <p className="text-sm text-primary" role="status">{message}</p>}
          {data && !data.storageConfigured && <p className="text-sm text-destructive">تخزين الملفات الصوتية غير مضبوط على الخادم، فلن يكتمل الاعتماد.</p>}
        </header>

        {isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
        {isError && <p className="text-sm text-destructive">تعذّر تحميل النشرة.</p>}

        {data && (
          <>
            <section className="flex flex-col gap-3" aria-labelledby="live">
              <h2 id="live" className="text-lg font-semibold">على الموقع الآن</h2>
              {data.current?.audio ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm">
                    <span className="font-medium">{data.current.title}</span>
                    <span className="text-muted-foreground"> · نُشرت {fmtDate(data.current.publishedAt)} · {fmtDuration(data.current.audio.durationSec)} · {PROVIDER[data.current.audio.provider] ?? data.current.audio.provider}</span>
                    {!data.live && <span className="text-muted-foreground"> · انتهت مدتها ولم تعد ظاهرة</span>}
                  </p>
                  <audio controls preload="none" src={data.current.audio.url} className="w-full" />
                  <div>
                    <Button variant="outline" size="sm" onClick={() => hide.mutate()} disabled={hide.isPending}>أخفِ النشرة من الموقع</Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">لا توجد نشرة منشورة.</p>
              )}
            </section>

            <Separator />

            <section className="flex flex-col gap-4" aria-labelledby="draft">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="draft" className="text-lg font-semibold">المسودة</h2>
                <Button onClick={() => create.mutate()} disabled={busy || draft?.status === "generating"}>
                  {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {draft ? "اكتب مسودة جديدة" : "اكتب مسودة الآن"}
                </Button>
              </div>

              {!draft && !create.isPending && <p className="text-sm text-muted-foreground">لا توجد مسودة. اكتب واحدة الآن، أو فعّل الجدولة لتُكتب تلقائياً في مواعيدها.</p>}
              {create.isPending && <p className="text-sm text-muted-foreground">يختار النظام أهم الأخبار ويكتب النص، وقد يستغرق ذلك دقيقة.</p>}

              {draft && (
                <div className="flex flex-col gap-5">
                  <p className="text-sm text-muted-foreground">
                    {draft.createdBy ? "كُتبت يدوياً" : "كُتبت تلقائياً"} {fmtDate(draft.createdAt)} · {items.length} أخبار · نحو {totalWords} كلمة (قرابة {Math.max(1, Math.round(estimatedMinutes))} دقائق)
                  </p>
                  {draft.status === "generating" && (
                    <p className="flex items-center gap-2 text-sm text-primary"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />يجري تسجيل النشرة بالصوت…</p>
                  )}
                  {draft.status === "failed" && draft.error && <p className="text-sm text-destructive">{draft.error}</p>}

                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    اسم النشرة
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} disabled={draft.status === "generating"} />
                  </label>

                  <p className="border-s-2 border-border ps-3 text-sm text-muted-foreground">{data.intro}</p>

                  <ol className="flex flex-col gap-5">
                    {items.map((item, index) => (
                      <li key={item.id} className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 shrink-0 text-sm tabular-nums text-muted-foreground">{index + 1}</span>
                          <Input aria-label="عنوان الفقرة في المشغّل" value={item.label} maxLength={60} onChange={(e) => patch(item.id, { label: e.target.value })} disabled={draft.status === "generating"} />
                          <Button variant="ghost" size="icon" aria-label="انقل للأعلى" disabled={index === 0 || draft.status === "generating"} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" aria-label="انقل للأسفل" disabled={index === items.length - 1 || draft.status === "generating"} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" aria-label="احذف الفقرة" disabled={items.length <= 1 || draft.status === "generating"} onClick={() => setItems((list) => list.filter((i) => i.id !== item.id))}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        <Textarea value={item.text} rows={4} onChange={(e) => patch(item.id, { text: e.target.value })} disabled={draft.status === "generating"} className="leading-7" />
                        <p className="text-xs text-muted-foreground">
                          المصدر: {item.articleIds.map((id) => data.sourceTitles[id] ?? "خبر محذوف").join(" · ")}
                          {item.href && <> · <a href={item.href} target="_blank" rel="noreferrer" className="text-primary hover:underline">افتح الخبر</a></>}
                        </p>
                      </li>
                    ))}
                  </ol>

                  <p className="border-s-2 border-border ps-3 text-sm text-muted-foreground">{data.outro}</p>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => save.mutate()} disabled={!dirty || busy || draft.status === "generating"}>احفظ التعديل</Button>
                    <Button onClick={() => approve.mutate()} disabled={dirty || busy || draft.status === "generating" || !data.storageConfigured}>
                      {approve.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      اعتمد وسجّل وانشر
                    </Button>
                    <Button variant="ghost" onClick={() => discard.mutate()} disabled={busy || draft.status === "generating"}>احذف المسودة</Button>
                  </div>
                  {dirty && <p className="text-xs text-muted-foreground">احفظ التعديل أولاً، ثم اعتمد.</p>}
                </div>
              )}
            </section>

            <Separator />

            <section className="flex flex-col gap-3" aria-labelledby="schedule">
              <h2 id="schedule" className="text-lg font-semibold">الجدولة</h2>
              <label className="flex items-center gap-3 text-sm">
                <Switch checked={data.scheduleEnabled} onCheckedChange={(v) => schedule.mutate(v)} disabled={!canSchedule || schedule.isPending} />
                اكتب مسودة تلقائياً في {data.slots.map((h) => `${h}:00`).join(" و")} بتوقيت الرياض
              </label>
              <p className="text-xs text-muted-foreground">المسودة المجدولة تنتظر الاعتماد ولا تُنشر وحدها. {canSchedule ? "" : "تغيير الجدولة لمن يملك صلاحية إعدادات النظام."}</p>
            </section>

            {data.history.length > 0 && (
              <>
                <Separator />
                <section className="flex flex-col gap-3" aria-labelledby="history">
                  <h2 id="history" className="text-lg font-semibold">النشرات السابقة</h2>
                  <ul className="flex flex-col divide-y divide-border text-sm">
                    {data.history.map((h) => (
                      <li key={h.id} className="flex flex-wrap justify-between gap-2 py-2">
                        <span>{h.title} · {fmtDate(h.publishedAt)}</span>
                        <span className="tabular-nums text-muted-foreground">{fmtDuration(h.durationSec)} · {PROVIDER[h.provider] ?? h.provider}{h.hiddenAt ? " · أُخفيت" : ""}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
