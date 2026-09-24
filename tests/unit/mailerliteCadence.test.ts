import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

it("changes cadence while preserving unrelated MailerLite groups", async () => {
  vi.stubEnv("MAILERLITE_API_KEY", "unit-test-only");
  vi.stubEnv("MAILERLITE_DAILY_GROUP_ID", "daily");
  vi.stubEnv("MAILERLITE_WEEKLY_GROUP_ID", "weekly");
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: {
      id: "subscriber-1", status: "active", groups: [{ id: "daily" }, { id: "sponsors" }, { id: "weekly" }],
    } }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "subscriber-1" } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const { reconcileMailerLiteCadenceGroups } = await import("../../server/services/mailerlite");
  expect((await reconcileMailerLiteCadenceGroups("reader@example.invalid", "weekly")).success).toBe(true);
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ fields: {}, groups: ["sponsors", "weekly"] });
  expect(fetchMock.mock.calls[1][1].method).toBe("PUT");
});
