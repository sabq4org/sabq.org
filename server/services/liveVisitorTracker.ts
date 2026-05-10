interface VisitorInfo {
  visitorId: string;
  userId?: string;
  page: string;
  lastPing: number;
}

class LiveVisitorTracker {
  private visitors: Map<string, VisitorInfo> = new Map();
  private readonly TIMEOUT_MS = 60000; // 1 minute timeout
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanup();
  }

  private startCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const entries = Array.from(this.visitors.entries());
      for (const [id, visitor] of entries) {
        if (now - visitor.lastPing > this.TIMEOUT_MS) {
          this.visitors.delete(id);
        }
      }
    }, 30000); // Cleanup every 30 seconds
    
    this.cleanupInterval.unref();
  }

  ping(visitorId: string, userId?: string, page?: string) {
    const existing = this.visitors.get(visitorId);
    this.visitors.set(visitorId, {
      visitorId,
      userId: userId || existing?.userId,
      page: page || existing?.page || '/',
      lastPing: Date.now(),
    });
  }

  getStats() {
    const now = Date.now();
    let total = 0;
    let authenticated = 0;
    const pageViews: Record<string, number> = {};

    for (const visitor of Array.from(this.visitors.values())) {
      if (now - visitor.lastPing <= this.TIMEOUT_MS) {
        total++;
        if (visitor.userId) authenticated++;
        pageViews[visitor.page] = (pageViews[visitor.page] || 0) + 1;
      }
    }

    return {
      total,
      authenticated,
      anonymous: total - authenticated,
      pageViews,
    };
  }

  getActiveVisitors() {
    const now = Date.now();
    return Array.from(this.visitors.values()).filter(
      v => now - v.lastPing <= this.TIMEOUT_MS
    );
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.visitors.clear();
  }
}

export const liveVisitorTracker = new LiveVisitorTracker();
