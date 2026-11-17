import { useEffect, useState } from "react";
import { apiRequest, apiUrl, getCsrfToken, queryClient } from "@/lib/queryClient";

type State = { id: string | undefined; owned: boolean; message: string };
// Serialize lifecycle operations for the same article, including StrictMode's
// mount/cleanup/mount sequence. An old release must not delete a new lease.
const queues = new Map<string, Promise<void>>();
function enqueue(id: string, work: () => Promise<void>) {
  const next = (queues.get(id) ?? Promise.resolve()).catch(() => {}).then(work);
  queues.set(id, next);
  void next.finally(() => { if (queues.get(id) === next) queues.delete(id); }).catch(() => {});
  return next;
}

export function useEnglishArticleEditLock(id: string | undefined, enabled: boolean) {
  const [state, setState] = useState<State>({ id, owned: false, message: "Acquiring edit lock…" });
  useEffect(() => {
    if (!enabled || !id) return;
    let active = true;
    let owned = false;
    const url = `/api/en/dashboard/articles/${id}/lock`;
    const release = async () => {
      await fetch(apiUrl(url), { method: "DELETE", credentials: "include", keepalive: true,
        headers: { "x-csrf-token": getCsrfToken() || "" } });
    };
    setState({ id, owned: false, message: "Acquiring edit lock…" });
    void enqueue(id, async () => {
      if (!active) return;
      try {
        await apiRequest(url, { method: "POST" });
        owned = true;
        if (!active) return; // cleanup is queued after this request
        await queryClient.invalidateQueries({ queryKey: ["/api/en/dashboard/articles", id] });
        if (active) setState({ id, owned: true, message: "" });
      } catch {
        if (active) setState({ id, owned: false, message: "This article is locked or the lock could not be acquired. Reload to try again." });
      }
    });
    const timer = setInterval(() => {
      if (!owned) return;
      void enqueue(id, async () => {
        if (!active || !owned) return;
        try { await apiRequest(`${url}/heartbeat`, { method: "POST" }); }
        catch {
          owned = false;
          if (active) setState({ id, owned: false, message: "The edit lock was lost. Copy any unsaved changes, then reload before editing." });
        }
      });
    }, 45_000);
    const unload = () => { if (owned) void release().catch(() => {}); };
    window.addEventListener("beforeunload", unload);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("beforeunload", unload);
      void enqueue(id, async () => { if (owned) { owned = false; await release(); } }).catch(() => {});
    };
  }, [id, enabled]);
  return state.id === id && enabled ? state : { owned: false, message: "Acquiring edit lock…" };
}
