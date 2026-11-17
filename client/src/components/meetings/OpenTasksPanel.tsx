// «مهام مفتوحة من اجتماعاتي» — المهام غير المنجزة من محاضر الاجتماعات التي
// استضافها المستخدم. الإنجاز من هنا مباشرة، والعنوان يفتح محضر الاجتماع.

import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type OpenTask = {
  meetingId: string;
  meetingTitle: string;
  endedAt: string | null;
  index: number;
  task: string;
  owner: string | null;
  due: string | null;
};

const KEY = "/api/meetings-archive/open-tasks";

export function OpenTasksPanel() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: raw, isLoading } = useQuery({ queryKey: [KEY], staleTime: 30_000 });
  const tasksRaw = (raw as { tasks?: OpenTask[] } | null | undefined)?.tasks;
  const tasks = Array.isArray(tasksRaw) ? tasksRaw : [];

  const complete = useMutation({
    mutationFn: (t: OpenTask) =>
      apiRequest(`/api/meetings/${t.meetingId}/minutes/tasks/${t.index}`, {
        method: "PATCH",
        body: JSON.stringify({ done: true, task: t.task }),
      }),
    onSuccess: (_r, t) => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
      queryClient.invalidateQueries({ queryKey: ["/api/meetings-archive"] });
      queryClient.invalidateQueries({ queryKey: [`/api/meetings/${t.meetingId}/minutes`] });
      toast({ title: "أُنجزت المهمة" });
    },
    onError: (e: Error) => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
      toast({ title: "تعذر تحديث المهمة", description: e.message, variant: "destructive" });
    },
  });

  // لا لوحة فارغة لمن لم يستضف اجتماعاً بمحضر
  if (isLoading || tasks.length === 0) return null;

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card" data-testid="panel-open-tasks">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-bold">مهام مفتوحة من اجتماعاتي</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{tasks.length}</span>
      </header>
      <ul className="divide-y divide-border">
        {tasks.map((t) => (
          <li
            key={`${t.meetingId}:${t.index}`}
            className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-4 py-3"
            data-testid={`row-open-task-${t.meetingId}-${t.index}`}
          >
            <label className="-m-3 flex h-11 w-11 shrink-0 items-center justify-center">
              <Checkbox
                className="no-min-touch-size"
                checked={false}
                disabled={complete.isPending}
                onCheckedChange={(v) => v === true && complete.mutate(t)}
                aria-label={`إنجاز: ${t.task}`}
              />
            </label>
            <button
              type="button"
              className="min-w-0 text-right hover:text-primary"
              onClick={() => setLocation(`/dashboard/meetings/${t.meetingId}/minutes`)}
            >
              <span className="block text-sm font-medium leading-6">{t.task}</span>
              <span className="block text-xs leading-5 text-muted-foreground">
                {[t.owner || "بلا مسؤول", `من ${t.meetingTitle}`, t.due].filter(Boolean).join(" · ")}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
