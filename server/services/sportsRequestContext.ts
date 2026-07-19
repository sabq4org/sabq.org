import { AsyncLocalStorage } from "node:async_hooks";

/** أولوية نداء مزوّد الرياضة: طلب الزائر يسبق التسخين والمهام المجدولة. */
export type SportsRequestPriority = "interactive" | "normal" | "background";

const store = new AsyncLocalStorage<SportsRequestPriority>();

export function runWithSportsPriority<T>(priority: SportsRequestPriority, fn: () => T): T {
  return store.run(priority, fn);
}

export function currentSportsPriority(): SportsRequestPriority {
  return store.getStore() ?? "normal";
}
