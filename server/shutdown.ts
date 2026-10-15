import type { Server } from "node:http";

type Phase = "drain" | "flush" | "release";
type Hook = () => void | Promise<void>;
// bootstrap and index are separate bundles; share one registry in the process.
const key = Symbol.for("sabq.shutdown");
const state = ((globalThis as any)[key] ??= {
  stopping: false, installed: false, hooks: new Map<string, { phase: Phase; run: Hook }>(),
}) as { stopping: boolean; installed: boolean; hooks: Map<string, { phase: Phase; run: Hook }> };
export const isShuttingDown = () => state.stopping;
export function registerShutdownHook(name: string, run: Hook, phase: Phase = "flush") {
  state.hooks.set(name, { run, phase });
}
export async function boundedPhase(work: Promise<unknown>[], timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.allSettled(work).then(results => results.every(r => r.status === "fulfilled")),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
export async function drainServer(server: Server, deadlineMs = 25000): Promise<boolean> {
  state.stopping = true;
  const closed = new Promise<void>(resolve => server.close(() => resolve()));
  server.closeIdleConnections?.();
  const idleSweep = setInterval(() => server.closeIdleConnections?.(), 25);
  let ok = true;
  for (const [phase, fraction] of [["drain", .6], ["flush", .3], ["release", .1]] as const) {
    const work = [...state.hooks.values()].filter(h => h.phase === phase)
      .map(h => Promise.resolve().then(h.run));
    if (phase === "drain") work.push(closed);
    const completed = await boundedPhase(work, deadlineMs * fraction);
    if (!completed) console.error(`[Shutdown] ${phase} did not finish cleanly within its budget`);
    ok = completed && ok;
    if (phase === "drain") {
      clearInterval(idleSweep);
      if (!completed) server.closeAllConnections?.();
    }
  }
  return ok;
}
export function installShutdown(server: Server) {
  if (state.installed) return;
  state.installed = true;
  const stop = () => {
    if (state.stopping) return;
    void drainServer(server).then(ok => process.exit(ok ? 0 : 1), error => {
      console.error("[Shutdown] Failed", error); process.exit(1);
    });
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
