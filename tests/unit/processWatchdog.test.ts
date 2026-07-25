import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// الحارس يقرأ عتباته من البيئة وقت تحميل الوحدة، ويحمل حالة وحدة (started/
// exiting) — لذا يُعاد استيراده نظيفًا في كل اختبار عبر vi.resetModules.

vi.mock("@sentry/node", () => ({
  captureMessage: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
}));

// عزل قاعدة البيانات: بلا هذا المحاكي يستورد المسبار db.ts الحقيقي في بيئة
// الاختبار ويحوّل فشل الاتصال إلى ضربات تُخرج العملية.
vi.mock("../../server/db", () => ({
  pool: undefined,
  isDatabaseReadyOnce: () => false,
}));

vi.mock("../../server/utils/runtimeDiagnostics", () => ({
  runtimeSnapshot: () => ({
    uptimeS: 1000,
    rssMb: 3000,
    heapUsedMb: 2500,
    heapTotalMb: 2600,
    externalMb: 50,
    openFds: 100,
    handles: 20,
    sockets: 10,
    handlesByType: {},
    pool: { total: 5, idle: 1, waiting: 0 },
    caches: [],
    loopLagMs: 0,
    maxLoopLagMs: 0,
  }),
}));

function fakeServer() {
  return { close: vi.fn((cb?: () => void) => cb && cb()) } as any;
}

async function loadWatchdog() {
  const mod = await import("../../server/utils/processWatchdog");
  return mod.startProcessWatchdog;
}

describe("processWatchdog", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let uptimeSpy: ReturnType<typeof vi.spyOn>;
  let memSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    uptimeSpy = vi.spyOn(process, "uptime").mockReturnValue(10_000);
    memSpy = vi.spyOn(process, "memoryUsage").mockReturnValue({
      rss: 500 * 1024 * 1024,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    } as any);
    delete process.env.WATCHDOG_ENABLED;
  });

  afterEach(() => {
    vi.useRealTimers();
    exitSpy.mockRestore();
    uptimeSpy.mockRestore();
    memSpy.mockRestore();
  });

  it("لا يخرج والذاكرة والحلقة سليمتان", async () => {
    const start = await loadWatchdog();
    start(fakeServer());
    await vi.advanceTimersByTimeAsync(10 * 30_000);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("يخرج بعد 10 فحوص متتالية فوق عتبة RSS", async () => {
    memSpy.mockReturnValue({
      rss: 3000 * 1024 * 1024,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    } as any);
    const Sentry = await import("@sentry/node");
    const start = await loadWatchdog();
    const server = fakeServer();
    start(server);
    // 9 فحوص لا تكفي
    await vi.advanceTimersByTimeAsync(9 * 30_000);
    expect(exitSpy).not.toHaveBeenCalled();
    // الفحص العاشر يطلق الخروج المنضبط
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("[Watchdog] self-restart"),
      expect.objectContaining({ level: "fatal" }),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("تصفير العدّاد عند فحص سليم بين الفحوص المريضة", async () => {
    const sick = { rss: 3000 * 1024 * 1024, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } as any;
    const healthy = { rss: 500 * 1024 * 1024, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 } as any;
    let call = 0;
    memSpy.mockImplementation(() => (++call % 5 === 0 ? healthy : sick) as any);
    const start = await loadWatchdog();
    start(fakeServer());
    await vi.advanceTimersByTimeAsync(20 * 30_000);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("لا يتسلّح قبل مهلة الإقلاع", async () => {
    uptimeSpy.mockReturnValue(60); // دقيقة واحدة فقط من الإقلاع
    memSpy.mockReturnValue({
      rss: 3000 * 1024 * 1024,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    } as any);
    const start = await loadWatchdog();
    start(fakeServer());
    await vi.advanceTimersByTimeAsync(20 * 30_000);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("WATCHDOG_ENABLED=false يعطّله بالكامل", async () => {
    process.env.WATCHDOG_ENABLED = "false";
    memSpy.mockReturnValue({
      rss: 3000 * 1024 * 1024,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    } as any);
    const start = await loadWatchdog();
    start(fakeServer());
    await vi.advanceTimersByTimeAsync(20 * 30_000);
    expect(exitSpy).not.toHaveBeenCalled();
    delete process.env.WATCHDOG_ENABLED;
  });
});
