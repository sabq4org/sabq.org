import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * يشغّل مساري ثيم اليوم الوطني على خادم حقيقي عبر HTTP، بتخزين مُستبدَل —
 * فلا حاجة لقاعدة بيانات. المقصود إثبات السلوك الذي يعتمد عليه التطبيق:
 * القراءة العامة، والسقوط الآمن عند فشل التخزين، ورفض غير المصرّح له،
 * والتحقق من نوع القيمة قبل الكتابة.
 */
const state = vi.hoisted(() => ({
  setting: null as unknown,
  getThrows: false,
  upserts: [] as Array<{ key: string; value: unknown; category: string; isPublic: boolean }>,
  authed: true,
  permitted: true,
}));

vi.mock("../../server/storage", () => ({
  storage: {
    async getSystemSetting(key: string) {
      if (state.getThrows) throw new Error("db down");
      return key === "ios_national_day_theme" ? state.setting : null;
    },
    async upsertSystemSetting(key: string, value: unknown, category: string, isPublic: boolean) {
      state.upserts.push({ key, value, category, isPublic });
    },
  },
}));

vi.mock("../../server/rbac", () => ({
  requireAuth: (_req: unknown, res: any, next: () => void) =>
    state.authed ? next() : res.status(401).json({ message: "unauthenticated" }),
  requirePermission: () => (_req: unknown, res: any, next: () => void) =>
    state.permitted ? next() : res.status(403).json({ message: "forbidden" }),
}));

// الموجّه يستورد هذين عند التحميل؛ خارج نطاق هذه الحالة.
vi.mock("../../server/routes/summaryAudioSettings", () => ({ default: express.Router() }));
vi.mock("../../server/services/tournamentBlockSettings", () => ({ TOURNAMENT_BLOCK_KEYS: {} }));

import router from "../../server/routes/systemSettings";

const PATH = "/api/system/ios-national-day-theme";

describe("مسارا ثيم اليوم الوطني لتطبيق iOS", () => {
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(router);
    server = await new Promise<Server>((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    state.setting = null;
    state.getThrows = false;
    state.upserts = [];
    state.authed = true;
    state.permitted = true;
  });

  it("القراءة عامة وتسقط على معطّل عندما لا يوجد صف", async () => {
    const res = await fetch(origin + PATH);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false, updatedAt: null });
  });

  it("تعيد المحفوظ كما هو", async () => {
    state.setting = { enabled: true, updatedAt: "2026-09-19T10:00:00.000Z" };
    const res = await fetch(origin + PATH);
    expect(await res.json()).toEqual({
      enabled: true,
      updatedAt: "2026-09-19T10:00:00.000Z",
    });
  });

  it("فشل التخزين يعيد «معطّل» بحالة 200 لا خطأ 500", async () => {
    // التطبيق يعامل أي فشل شبكة بإبقاء آخر حالة عنده؛ الخادم لا يزيد
    // الطين بلّة بردّ 500 على قراءة عامة.
    state.getThrows = true;
    const res = await fetch(origin + PATH);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false, updatedAt: null });
  });

  it("الكتابة تحفظ القيمة وتختم وقتها وتعلن الصف عامًا", async () => {
    const res = await fetch(origin + PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, enabled: true });

    expect(state.upserts).toHaveLength(1);
    const [saved] = state.upserts;
    expect(saved.key).toBe("ios_national_day_theme");
    expect(saved.category).toBe("appearance");
    // لا بد أن يكون عامًا وإلا لم يستطع التطبيق قراءته بلا مصادقة.
    expect(saved.isPublic).toBe(true);
    expect((saved.value as { enabled: boolean }).enabled).toBe(true);
    expect(
      Number.isFinite(Date.parse((saved.value as { updatedAt: string }).updatedAt)),
    ).toBe(true);
  });

  it("الإطفاء يُحفظ صراحةً", async () => {
    await fetch(origin + PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect((state.upserts[0].value as { enabled: boolean }).enabled).toBe(false);
  });

  it("ترفض قيمة غير منطقية بلا كتابة", async () => {
    for (const body of [{ enabled: "true" }, { enabled: 1 }, {}]) {
      const res = await fetch(origin + PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);
    }
    expect(state.upserts).toHaveLength(0);
  });

  it("الكتابة تتطلب جلسة وصلاحية إدارة الإعدادات", async () => {
    state.authed = false;
    let res = await fetch(origin + PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(401);

    state.authed = true;
    state.permitted = false;
    res = await fetch(origin + PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(403);

    expect(state.upserts).toHaveLength(0);
  });
});
