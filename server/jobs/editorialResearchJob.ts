import { processResearchJobs } from "../services/editorialResearchService";

/** Durable DB leases coordinate replicas; also reconciles old jobs when admission is disabled. */
export function startEditorialResearchJob() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await processResearchJobs(); }
    catch { console.warn("[editorial-research] could not reconcile jobs"); }
    finally { running = false; }
  };
  const timer = setInterval(() => { void tick(); }, 10_000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
