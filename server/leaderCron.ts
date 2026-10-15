import { registerShutdownHook } from "./shutdown";
import cron from "node-cron";
import { isLeader } from "./leaderElection";

const active = new Set<Promise<unknown>>();
registerShutdownHook("leader-cron", async () => { await Promise.allSettled([...active]); }, "drain");

/** Register once on each enabled replica; check ownership on every tick. */
export function schedule(expression: string,
  callback: Exclude<Parameters<typeof cron.schedule>[1], string>,
  options?: Parameters<typeof cron.schedule>[2]) {
  let running = false;
  return cron.schedule(expression, async context => {
    if (!isLeader() || running) return;
    running = true;
    const task = Promise.resolve().then(() => callback(context));
    active.add(task);
    try { await task; } finally { active.delete(task); running = false; }
  }, options);
}
export default { ...cron, schedule };
