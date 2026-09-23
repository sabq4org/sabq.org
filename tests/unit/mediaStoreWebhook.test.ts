import express from "express";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { validateCsrfToken } from "../../server/csrf";
import { verifyMediaStoreCharge } from "../../server/services/mediaStoreWebhook";

const mocks = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn(), insert: vi.fn(), retrieve: vi.fn(), order: {} as Record<string, unknown>, updateWon: true }));
vi.mock("../../server/db", () => ({ db: {
  select: (...args: unknown[]) => {
    mocks.select(...args);
    const q: any = { from: () => q, where: () => q, limit: async () => [mocks.order] };
    return q;
  },
  update: (...args: unknown[]) => { mocks.update(...args); return { set: () => ({ where: () => ({ returning: async () => mocks.updateWon ? [{ id: "order1" }] : [] }) }) }; },
  insert: (...args: unknown[]) => { mocks.insert(...args); return { values: async () => [] }; },
} }));
vi.mock("../../server/services/tapPaymentService", async importOriginal => ({
  ...await importOriginal<typeof import("../../server/services/tapPaymentService")>(),
  retrieveCharge: mocks.retrieve,
}));
import router from "../../server/routes/mediaStoreRoutes";

const secret = "test-only-synthetic-key";
const charge = {
  id: "chg_test123", object: "charge", status: "CAPTURED", amount: 115, currency: "SAR",
  reference: { gateway: "gateway", payment: "payment" }, transaction: { created: "1700000000000" },
  metadata: { orderId: "order1", title: "خدمة إعلامية" },
};
// Independent fixed signing vector from Tap's documented field ordering / SAR precision.
const signature = () => createHmac("sha256", secret)
  .update("x_idchg_test123x_amount115.00x_currencySARx_gateway_referencegatewayx_payment_referencepaymentx_statusCAPTUREDx_created1700000000000")
  .digest("hex");
beforeEach(() => {
  vi.stubEnv("TAP_SECRET_KEY", secret);
  mocks.select.mockClear(); mocks.update.mockClear(); mocks.insert.mockClear();
  mocks.order = { id: "order1", paymentChargeId: charge.id, totalHalalas: 11500, orderNumber: "MS-test", status: "payment_pending" };
  mocks.updateWon = true;
  mocks.retrieve.mockReset().mockResolvedValue(charge);
});
afterEach(() => vi.unstubAllEnvs());

describe("Tap Media Store signing contract", () => {
  it("accepts the official field signature despite JSON whitespace and Arabic metadata", () => {
    expect(verifyMediaStoreCharge(Buffer.from(JSON.stringify(charge, null, 2)), signature())?.id).toBe(charge.id);
  });
  it.each(["", "0".repeat(64), signature() + "garbage", [signature()], undefined])("rejects malformed or forged signatures", hash => {
    expect(verifyMediaStoreCharge(Buffer.from(JSON.stringify(charge)), hash)).toBeNull();
  });
  it("rejects changed signed payment fields and a raw-body HMAC", () => {
    expect(verifyMediaStoreCharge(Buffer.from(JSON.stringify({ ...charge, amount: 1 })), signature())).toBeNull();
    const raw = Buffer.from(JSON.stringify(charge));
    expect(verifyMediaStoreCharge(raw, createHmac("sha256", secret).update(raw).digest("hex"))).toBeNull();
  });
  it("rejects missing configuration and malformed JSON", () => {
    expect(verifyMediaStoreCharge(Buffer.from("not-json"), signature())).toBeNull();
    vi.stubEnv("TAP_SECRET_KEY", "");
    expect(verifyMediaStoreCharge(Buffer.from(JSON.stringify(charge)), signature())).toBeNull();
  });
});

describe("real Express order: JSON parser → /api CSRF → Media Store router", () => {
  let server: Server;
  let origin: string;
  beforeAll(async () => {
    const app = express();
    app.use(express.json({ verify: (req, _res, buf) => { (req as typeof req & { rawBody: Buffer }).rawBody = buf; } }));
    app.use("/api", validateCsrfToken);
    app.use("/api/media-store", router);
    server = await new Promise<Server>(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); });
  const post = (path: string, body = charge, hash?: string) => fetch(origin + path, {
    method: "POST", headers: { "Content-Type": "application/json", ...(hash ? { hashstring: hash } : {}) },
    body: JSON.stringify(body, null, 2),
  });
  it.each(["/api/media-store/webhook", "/api/media-store/webhook/?attempt=2", "/API/MEDIA-STORE/WEBHOOK"])("accepts a valid delivery without browser CSRF: %s", async path => {
    const response = await post(path, charge, signature());
    expect(response.status).toBe(200);
    expect(mocks.retrieve).toHaveBeenCalledWith(charge.id);
    expect(mocks.update).toHaveBeenCalledOnce();
  });
  it("rejects unsigned delivery before DB or payment API calls", async () => {
    expect((await post("/api/media-store/webhook")).status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled(); expect(mocks.retrieve).not.toHaveBeenCalled();
  });
  it.each(["paid", "processing", "completed", "refunded"])("acknowledges replay without undoing %s", async status => {
    mocks.order.status = status;
    expect((await post("/api/media-store/webhook", charge, signature())).status).toBe(200);
    expect(mocks.retrieve).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not append duplicate payment events when a concurrent delivery already updated the order", async () => {
    mocks.updateWon = false;
    expect((await post("/api/media-store/webhook", charge, signature())).status).toBe(200);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it.each(["/api/media-store/purchases", "/api/media-store/webhook/other", "/api/media-store/webhook-extra"])("does not exempt sibling writes: %s", async path => {
    expect((await post(path, charge, signature())).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("refuses a valid signature replayed with metadata pointing to a different order", async () => {
    mocks.order = { ...mocks.order, id: "other", paymentChargeId: "chg_other" };
    const altered = { ...charge, metadata: { ...charge.metadata, orderId: "other" } };
    expect((await post("/api/media-store/webhook", altered, signature())).status).toBe(400);
    expect(mocks.retrieve).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([{ amount: 1 }, { currency: "USD" }, { id: "chg_other" }])("refuses mismatching independently retrieved payment: %j", async difference => {
    mocks.retrieve.mockResolvedValue({ ...charge, ...difference });
    expect((await post("/api/media-store/webhook", charge, signature())).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
