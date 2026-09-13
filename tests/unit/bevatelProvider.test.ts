import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bevatelProvider } from "../../server/services/sms/bevatelProvider";
import { buildOtpMessage } from "../../server/services/otpService";

vi.mock("../../server/redis", () => ({ getRedisSessionAdapter: () => null }));

const fetchMock = vi.fn<typeof fetch>();

describe("Bevatel OTP transport", () => {
  beforeEach(() => {
    vi.stubEnv("BEVATEL_API_KEY", "test-key");
    vi.stubEnv("BEVATEL_SENDER_ID", "");
    vi.stubEnv("BEVATEL_API_BASE", "");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ jobId: "test-job" }), { status: 200 }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each(["login", "2fa", "phone_verify"] as const)("sends %s using the approved sender and one SMS part", async (purpose) => {
    const body = buildOtpMessage("123456", purpose);
    const result = await bevatelProvider.send("+966500000000", body);
    expect(result).toEqual({ ok: true, provider: "bevatel", messageId: "test-job" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://sms-api.bevatel.com/msgs/sms");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-key", "Content-Type": "application/json" });
    const payload = JSON.parse(String(init?.body));
    expect(payload).toEqual({
      src: "SABQ News", dests: ["966500000000"], body,
      secure: true, dlr: true, validity: 5, maxParts: 1,
    });
    expect(payload).not.toHaveProperty("msgClass");
    expect(payload.body.length).toBeLessThanOrEqual(70);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("honors an explicitly configured sender", async () => {
    vi.stubEnv("BEVATEL_SENDER_ID", " Approved Sender ");
    await bevatelProvider.send("+966500000000", "test");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).src).toBe("Approved Sender");
  });

  it("does not send without an API key", async () => {
    vi.stubEnv("BEVATEL_API_KEY", "");
    expect(bevatelProvider.isConfigured()).toBe(false);
    expect((await bevatelProvider.send("+966500000000", "test")).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports provider rejection as failure", async () => {
    fetchMock.mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    expect((await bevatelProvider.send("+966500000000", "test")).ok).toBe(false);
  });
});
