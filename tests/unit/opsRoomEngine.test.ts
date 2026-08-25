// غرفة عمليات سبق الذكية — اختبارات المحرك فوق مخزن الذاكرة بوكلاء بديلة.
// لا شبكة ولا نماذج هنا: نختبر الانتقالات والتبعيات والتوازي والإيقاف
// وإعادة المحاولة ومنع الحلقات ورفض المخرج المخالف والاعتماد البشري.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { OpsRoomEngine } from "../../server/services/opsRoom/engine";
import { MemoryOpsStore } from "../../server/services/opsRoom/memoryStore";
import type { AgentRunResult, OpsAgentHandler } from "../../server/services/opsRoom/types";
import {
  OPS_MAX_REASSIGNMENTS,
  OPS_PERMISSIONS,
  OPS_ROUTES,
  OPS_STATUS_TRANSITIONS,
  OPS_TASK_STATUSES,
  canTransition,
  hasOpsPermission,
  validateRoute,
  type OpsAgentSlug,
} from "../../shared/opsRoom";

const editor = { id: "u1", name: "المحرر" };

function okOutput(extra: Record<string, unknown> = {}): AgentRunResult {
  return {
    ok: true,
    output: { summaryAr: "تم", factsUsed: [], sources: [], confidence: 80, missingInfo: [], warnings: [], nextActionAr: "", result: { ok: true, ...extra } },
  };
}

/** وكيل بديل: يسجّل استدعاءاته ويعيد ما نبرمجه. */
function stubAgent(slug: OpsAgentSlug, impl?: (n: number) => AgentRunResult | Promise<AgentRunResult>, schema: z.ZodTypeAny = z.object({ ok: z.boolean() }).passthrough()) {
  const calls: number[] = [];
  const handler: OpsAgentHandler = {
    slug,
    resultSchema: schema,
    async run() {
      calls.push(Date.now());
      return impl ? impl(calls.length) : okOutput();
    },
  };
  return { handler, calls };
}

function makeEngine(agents: Partial<Record<OpsAgentSlug, OpsAgentHandler>>, opts: { paused?: boolean; disabled?: string[] } = {}) {
  const store = new MemoryOpsStore();
  const engine = new OpsRoomEngine({
    store,
    agents,
    isPaused: async () => opts.paused ?? false,
    disabledAgents: async () => opts.disabled ?? [],
    retryDelayMs: 0,
  });
  return { store, engine };
}

/** طاقم كامل لمسار «عاجل» كله ناجح. */
function fullBreakingCrew() {
  const crew = {
    rased: stubAgent("rased"),
    muwathiq: stubAgent("muwathiq"),
    sabbaq: stubAgent("sabbaq"),
    qalam: stubAgent("qalam"),
    mizan: stubAgent("mizan"),
    adasa: stubAgent("adasa"),
    saai: stubAgent("saai"),
  };
  const agents = Object.fromEntries(Object.entries(crew).map(([k, v]) => [k, v.handler])) as Partial<Record<OpsAgentSlug, OpsAgentHandler>>;
  return { crew, agents };
}

describe("النموذج المشترك", () => {
  it("كل مسار سليم التبعيات وبلا دورات", () => {
    for (const route of Object.values(OPS_ROUTES)) expect(validateRoute(route)).toEqual([]);
  });

  it("جدول الانتقالات يغطي كل حالة ويمنع القفزات", () => {
    for (const s of OPS_TASK_STATUSES) expect(OPS_STATUS_TRANSITIONS[s]).toBeDefined();
    expect(canTransition("new", "completed")).toBe(false);
    expect(canTransition("ready", "running")).toBe(true);
    expect(canTransition("cancelled", "ready")).toBe(false);
  });

  it("wildcard الصلاحيات محفوظ", () => {
    expect(hasOpsPermission(["*"], OPS_PERMISSIONS.approve)).toBe(true);
    expect(hasOpsPermission(["ops_room.view"], OPS_PERMISSIONS.approve)).toBe(false);
    expect(hasOpsPermission(null, OPS_PERMISSIONS.view)).toBe(false);
  });
});

describe("المحرك — المسار الأساسي", () => {
  it("ينشئ المهمة ويقسّمها ويوزّعها بالترتيب حتى بوابة الاعتماد", async () => {
    const { crew, agents } = fullBreakingCrew();
    const { store, engine } = makeEngine(agents);
    const main = await engine.createTask({ title: "زلزال يضرب شمال البلاد", taskType: "breaking" }, editor);
    expect(main.status).toBe("ready");
    const steps = await store.listSteps(main.id);
    expect(steps.map((s) => s.stepKey)).toEqual(["signal", "verify", "draft", "edit", "qa", "image", "push"]);

    await engine.pump(main.id);
    const after = (await store.getTask(main.id))!;
    expect(after.status).toBe("awaiting_approval");
    // الترتيب: راصد ← موثّق ← سبّاق ← قلم ← ميزان، ولم يعمل عدسة/ساعي قبل الاعتماد
    expect(crew.rased.calls.length).toBe(1);
    expect(crew.muwathiq.calls.length).toBe(1);
    expect(crew.sabbaq.calls.length).toBe(1);
    expect(crew.qalam.calls.length).toBe(1);
    expect(crew.mizan.calls.length).toBe(1);
    expect(crew.adasa.calls.length).toBe(0);
    expect(crew.saai.calls.length).toBe(0);
    expect(crew.rased.calls[0]! <= crew.muwathiq.calls[0]!).toBe(true);
    // كل خطوة مكتملة تحمل مخرجًا منظمًا محفوظًا
    const done = (await store.listSteps(main.id)).filter((s) => s.status === "completed");
    expect(done.length).toBe(4);
    for (const s of done) expect(s.output).toMatchObject({ summaryAr: "تم", result: { ok: true } });
  });

  it("بعد الاعتماد تعمل عدسة وساعي بالتوازي ثم تنتظران اعتمادًا مستقلًا", async () => {
    const { crew, agents } = fullBreakingCrew();
    // نجعل الوكيلين بطيئين قليلًا لنثبت التزامن
    let concurrent = 0;
    let maxConcurrent = 0;
    const slow = (slug: OpsAgentSlug) => {
      const s = stubAgent(slug, async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 20));
        concurrent--;
        return okOutput();
      });
      return s;
    };
    crew.adasa = slow("adasa");
    crew.saai = slow("saai");
    agents.adasa = crew.adasa.handler;
    agents.saai = crew.saai.handler;
    const { store, engine } = makeEngine(agents);
    const main = await engine.createTask({ title: "خبر متوازٍ", taskType: "breaking" }, editor);
    await engine.pump(main.id);
    const qa = (await store.listSteps(main.id)).find((s) => s.stepKey === "qa")!;
    expect(qa.status).toBe("awaiting_approval");

    await engine.approve(qa.id, editor, "معتمد");
    const steps = await store.listSteps(main.id);
    expect(steps.find((s) => s.stepKey === "image")!.status).toBe("awaiting_approval");
    expect(steps.find((s) => s.stepKey === "push")!.status).toBe("awaiting_approval");
    expect(maxConcurrent).toBe(2);
    expect((await store.getTask(main.id))!.status).toBe("awaiting_approval");

    // اعتماد الاثنين → المهمة مكتملة، ولا شيء أُرسل (لا أداة إرسال أصلًا)
    await engine.approve(steps.find((s) => s.stepKey === "image")!.id, editor);
    await engine.approve(steps.find((s) => s.stepKey === "push")!.id, editor);
    expect((await store.getTask(main.id))!.status).toBe("completed");
    const events = await store.listEvents(main.id);
    expect(events.some((e) => /نشر|إرسال/.test(e.eventType))).toBe(false);
  });

  it("يتوقف المسار عند نقص الأدلة ويظهر للمحرر ثم يُستأنف بمعلومات إضافية", async () => {
    const { crew, agents } = fullBreakingCrew();
    let verifyCalls = 0;
    crew.muwathiq = stubAgent("muwathiq", () => {
      verifyCalls++;
      return verifyCalls === 1 ? { ok: false, escalate: "needs_info", reasonAr: "الأدلة غير كافية" } : okOutput();
    });
    agents.muwathiq = crew.muwathiq.handler;
    const { store, engine } = makeEngine(agents);
    const main = await engine.createTask({ title: "ادعاء بلا مصدر", taskType: "breaking" }, editor);
    await engine.pump(main.id);
    expect((await store.getTask(main.id))!.status).toBe("needs_info");
    expect(crew.sabbaq.calls.length).toBe(0);

    await engine.provideInfo(main.id, editor, "رابط بيان رسمي: https://example.gov.sa/x");
    expect(verifyCalls).toBe(2);
    expect((await store.getTask(main.id))!.status).toBe("awaiting_approval");
    const m = (await store.getTask(main.id))!;
    expect((m.input as Record<string, unknown>).humanNotes).toEqual(["رابط بيان رسمي: https://example.gov.sa/x"]);
  });
});

describe("المحرك — الأعطال والحدود", () => {
  it("يعيد المحاولة ضمن الحد ثم يفشل ويوقف المهمة عند الوكيل المتعثر", async () => {
    const { crew, agents } = fullBreakingCrew();
    crew.sabbaq = stubAgent("sabbaq", () => {
      throw new Error("انقطاع المزود");
    });
    agents.sabbaq = crew.sabbaq.handler;
    const { store, engine } = makeEngine(agents);
    const main = await engine.createTask({ title: "خبر يتعثر", taskType: "breaking" }, editor);
    await engine.pump(main.id);
    const m = (await store.getTask(main.id))!;
    expect(m.status).toBe("failed");
    expect(m.failedAtAgent).toBe("sabbaq");
    expect(crew.sabbaq.calls.length).toBe(2); // maxAttempts لسبّاق = 2
    const events = await store.listEvents(main.id);
    expect(events.filter((e) => e.eventType === "retry").length).toBe(1);
    expect(events.some((e) => e.eventType === "failed" && e.actor === "sabbaq")).toBe(true);
  });

  it("يرفض مخرجًا لا يطابق العقد", async () => {
    const { crew, agents } = fullBreakingCrew();
    crew.rased = stubAgent(
      "rased",
      () => ({ ok: true, output: { summaryAr: "x", factsUsed: [], sources: [], confidence: 50, missingInfo: [], warnings: [], nextActionAr: "", result: { wrong: 1 } } }),
      z.object({ eventSummaryAr: z.string() }),
    );
    agents.rased = crew.rased.handler;
    const { store, engine } = makeEngine(agents);
    const main = await engine.createTask({ title: "مخرج مخالف", taskType: "breaking" }, editor);
    await engine.pump(main.id);
    const events = await store.listEvents(main.id);
    expect(events.filter((e) => e.eventType === "output_rejected").length).toBeGreaterThan(0);
    expect((await store.getTask(main.id))!.status).toBe("failed");
    expect(crew.muwathiq.calls.length).toBe(0);
  });

  it("يمنع تكرار المهمة نفسها ويحترم إيقاف الغرفة", async () => {
    const { agents } = fullBreakingCrew();
    const { engine } = makeEngine(agents);
    await engine.createTask({ title: "خبر مكرر", taskType: "breaking" }, editor);
    await expect(engine.createTask({ title: "خبر  مكرر ", taskType: "breaking" }, editor)).rejects.toMatchObject({ status: 409 });
    const paused = makeEngine(agents, { paused: true });
    await expect(paused.engine.createTask({ title: "أثناء الإيقاف", taskType: "standard" }, editor)).rejects.toMatchObject({ status: 423 });
  });

  it("يوقف المهمة أثناء التنفيذ ويتجاهل مخرج الوكيل الجاري", async () => {
    const { crew, agents } = fullBreakingCrew();
    const { store, engine } = makeEngine(agents);
    let release!: () => void;
    crew.muwathiq = stubAgent("muwathiq", () => new Promise<AgentRunResult>((resolve) => { release = () => resolve(okOutput()); }));
    agents.muwathiq = crew.muwathiq.handler;
    const main = await engine.createTask({ title: "إيقاف وسط التنفيذ", taskType: "breaking" }, editor);
    const pumping = engine.pump(main.id);
    await new Promise((r) => setTimeout(r, 10));
    await engine.stop(main.id, editor, "قرار المحرر");
    release();
    await pumping;
    const m = (await store.getTask(main.id))!;
    expect(m.status).toBe("stopped");
    const verify = (await store.listSteps(main.id)).find((s) => s.stepKey === "verify")!;
    expect(verify.status).toBe("stopped");
    expect(verify.output).toBeNull();
    expect(crew.sabbaq.calls.length).toBe(0);
  });

  it("يمنع الحلقة: العودة التلقائية من ميزان لقلم مرة واحدة فقط، ثم للبشر", async () => {
    const { crew, agents } = fullBreakingCrew();
    crew.mizan = stubAgent("mizan", () => ({ ...okOutput(), returnToStepKey: "edit", returnReasonAr: "عنوان ضعيف" }) as AgentRunResult);
    agents.mizan = crew.mizan.handler;
    const { store, engine } = makeEngine(agents);
    const main = await engine.createTask({ title: "دوران ميزان-قلم", taskType: "breaking" }, editor);
    await engine.pump(main.id);
    expect(crew.qalam.calls.length).toBe(2);
    expect(crew.mizan.calls.length).toBe(2);
    expect((await store.getTask(main.id))!.status).toBe("awaiting_approval");
  });

  it("يحدّ إعادة التكليف البشري ويعيد الخطوات التابعة", async () => {
    const { crew, agents } = fullBreakingCrew();
    const { store, engine } = makeEngine(agents);
    const main = await engine.createTask({ title: "إعادة تكليف", taskType: "breaking" }, editor);
    await engine.pump(main.id);
    for (let i = 0; i < OPS_MAX_REASSIGNMENTS; i++) {
      await engine.reassign(main.id, editor, "draft", "أعد الصياغة");
      expect((await store.getTask(main.id))!.status).toBe("awaiting_approval");
    }
    // سبّاق أُعيد 3 مرات + الأصل
    expect(crew.sabbaq.calls.length).toBe(1 + OPS_MAX_REASSIGNMENTS);
    expect(crew.rased.calls.length).toBe(1); // ما قبل الهدف لا يُعاد
    await expect(engine.reassign(main.id, editor, "draft")).rejects.toMatchObject({ status: 429 });
  });

  it("الاعتماد مع تعديل بشري يُوسم، وطلب التعديل يعيد الخطوة لنفس الوكيل", async () => {
    const { crew, agents } = fullBreakingCrew();
    const { store, engine } = makeEngine(agents);
    const main = await engine.createTask({ title: "تعديل بشري", taskType: "factcheck" }, editor);
    await engine.pump(main.id);
    let qa = (await store.listSteps(main.id)).find((s) => s.stepKey === "qa")!;
    expect(qa.status).toBe("awaiting_approval");
    await engine.requestChanges(qa.id, editor, "أضف المصدر الرسمي");
    expect(crew.mizan.calls.length).toBe(2);
    qa = (await store.listSteps(main.id)).find((s) => s.stepKey === "qa")!;
    expect(qa.humanNote).toBe("أضف المصدر الرسمي");
    await engine.approve(qa.id, editor, "معتمد بعد تعديل", { finalHeadline: "عنوان معدّل بشريًا" });
    qa = (await store.listSteps(main.id)).find((s) => s.stepKey === "qa")!;
    expect(qa.humanEdited).toBe(true);
    expect((qa.output as { result: { finalHeadline: string } }).result.finalHeadline).toBe("عنوان معدّل بشريًا");
    expect((await store.getTask(main.id))!.status).toBe("completed");
  });

  it("الوكيل الموقوف لا يُوزَّع عليه شيء", async () => {
    const { crew, agents } = fullBreakingCrew();
    const { store, engine } = makeEngine(agents, { disabled: ["muwathiq"] });
    const main = await engine.createTask({ title: "وكيل موقوف", taskType: "breaking" }, editor);
    await engine.pump(main.id);
    expect(crew.rased.calls.length).toBe(1);
    expect(crew.muwathiq.calls.length).toBe(0);
    const verify = (await store.listSteps(main.id)).find((s) => s.stepKey === "verify")!;
    expect(verify.status).toBe("ready");
    expect((await store.listEvents(main.id)).some((e) => e.eventType === "blocked")).toBe(true);
  });

  it("يرفض انتقالًا غير مسجل (استئناف مهمة غير موقوفة)", async () => {
    const { agents } = fullBreakingCrew();
    const { engine } = makeEngine(agents);
    const main = await engine.createTask({ title: "انتقال ممنوع", taskType: "notification" }, editor);
    await expect(engine.resume(main.id, editor)).rejects.toMatchObject({ status: 409 });
  });
});
