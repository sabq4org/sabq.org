/** Bounded, process-local fallback for the two opt-in homepage components. */
export interface ComponentFreshness {
  state: "fresh" | "stale";
  /** Last successful service retrieval, not the provider's event timestamp. */
  updatedAt: string;
  retryAfterSeconds: number;
}

export class ComponentSnapshotUnavailable extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Sports component temporarily unavailable");
    this.name = "ComponentSnapshotUnavailable";
  }
}

interface Entry<T> {
  snapshot?: { data: T; at: number };
  inFlight?: Promise<void>;
  retryAt: number;
}

export class SportsComponentSnapshot<T> {
  private readonly entries = new Map<string, Entry<T>>();
  constructor(private readonly options: {
    blockedForMs: () => number;
    freshMs?: number;
    maxAgeMs?: number;
    deadlineMs?: number;
    retryMs?: number;
    maxKeys?: number;
    now?: () => number;
  }) {}

  async get(key: string, fetcher: () => Promise<T>): Promise<{ data: T; freshness: ComponentFreshness }> {
    const now = this.options.now ?? Date.now;
    const retryMs = this.options.retryMs ?? 15_000;
    const maxAge = this.options.maxAgeMs ?? 10 * 60_000;
    let entry = this.entries.get(key);
    if (!entry) {
      // Never evict running work: that would allow a second fetch for its key.
      for (const [oldKey, old] of this.entries) {
        if (!old.inFlight && now() - (old.snapshot?.at ?? old.retryAt) > maxAge) this.entries.delete(oldKey);
      }
      if (this.entries.size >= (this.options.maxKeys ?? 32)) {
        const idle = [...this.entries].find(([, item]) => !item.inFlight);
        if (!idle) throw new ComponentSnapshotUnavailable(Math.ceil(retryMs / 1000));
        this.entries.delete(idle[0]);
      }
      entry = { retryAt: 0 };
      this.entries.set(key, entry);
    }
    const current = entry;
    const retryAfter = () => Math.max(0, Math.ceil(Math.max(current.retryAt - now(), this.options.blockedForMs()) / 1000));
    const result = () => {
      const saved = current.snapshot;
      if (!saved || now() - saved.at > maxAge) return null;
      const fresh = now() - saved.at < (this.options.freshMs ?? 15_000) && retryAfter() === 0;
      return { data: saved.data, freshness: {
        state: fresh ? "fresh" as const : "stale" as const,
        updatedAt: new Date(saved.at).toISOString(),
        retryAfterSeconds: retryAfter(),
      } };
    };
    const cached = result();
    if (cached?.freshness.state === "fresh") return cached;
    if (!current.inFlight && retryAfter() === 0) {
      current.inFlight = Promise.resolve().then(fetcher).then(data => {
        current.snapshot = { data, at: now() };
        current.retryAt = 0;
      }).catch(() => {
        current.retryAt = now() + Math.max(retryMs, this.options.blockedForMs());
      }).finally(() => { current.inFlight = undefined; });
    }
    if (cached) return cached; // Refresh in the background; never hold warm readers.
    if (current.inFlight) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          current.inFlight,
          new Promise<void>(resolve => { timer = setTimeout(resolve, this.options.deadlineMs ?? 3_000); }),
        ]);
      } finally { clearTimeout(timer); }
    }
    const loaded = result();
    if (loaded) return loaded;
    // A deadline does not release single-flight: the bounded provider call may
    // still complete and warm this entry for the next reader.
    throw new ComponentSnapshotUnavailable(Math.max(Math.ceil(retryMs / 1000), retryAfter()));
  }
}

export function sportsComponentDay(date?: string): string {
  return date ?? new Date(Date.now() + 3 * 60 * 60_000).toISOString().slice(0, 10);
}
