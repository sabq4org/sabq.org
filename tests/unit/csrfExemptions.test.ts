import { describe, expect, it } from "vitest";
import { isCsrfExemptRequest } from "../../server/csrf";

describe("CSRF exemptions", () => {
  it("exempts only POST /api/security/csp-report", () => {
    expect(isCsrfExemptRequest("POST", "/security/csp-report", "/api/security/csp-report")).toBe(true);
    expect(isCsrfExemptRequest("POST", "/security/csp-report", "/api/security/csp-report?source=browser")).toBe(true);
    expect(isCsrfExemptRequest("GET", "/security/csp-report", "/api/security/csp-report")).toBe(false);
    expect(isCsrfExemptRequest("PUT", "/security/csp-report", "/api/security/csp-report")).toBe(false);
    expect(isCsrfExemptRequest("POST", "/security/csp-reports", "/api/security/csp-reports")).toBe(false);
    expect(isCsrfExemptRequest("POST", "/security/csp-report/details", "/api/security/csp-report/details")).toBe(false);
  });

  it("keeps native-ads editor CRUD protected while beacons and the advertiser flow stay exempt", () => {
    const ex = (m: string, p: string) => isCsrfExemptRequest(m, p.replace(/^\/api/, ""), p);
    expect(ex("POST", "/api/native-ads/")).toBe(false);
    expect(ex("POST", "/api/native-ads")).toBe(false);
    expect(ex("PATCH", "/api/native-ads/ad1")).toBe(false);
    expect(ex("DELETE", "/api/native-ads/ad1")).toBe(false);
    expect(ex("POST", "/api/native-ads/ad1/impression")).toBe(true);
    expect(ex("POST", "/api/native-ads/ad1/click")).toBe(true);
    expect(ex("POST", "/api/native-ads/submit")).toBe(true);
    expect(ex("POST", "/api/native-ads/upload")).toBe(true);
    expect(ex("PATCH", "/api/native-ads/my-ads/ad1/budget")).toBe(true);
  });

  it("exempts only the Muqtarab topic view counter, not topic comments", () => {
    const ex = (m: string, p: string) => isCsrfExemptRequest(m, p.replace(/^\/api/, ""), p);
    expect(ex("POST", "/api/muqtarab/topics/t1/view")).toBe(true);
    expect(ex("POST", "/api/muqtarab/topics/t1/comments")).toBe(false);
  });

  it("exempts only the Twilio WhatsApp webhooks, not the admin routes", () => {
    const ex = (m: string, p: string) => isCsrfExemptRequest(m, p.replace(/^\/api/, ""), p);
    expect(ex("POST", "/api/whatsapp/webhook")).toBe(true);
    expect(ex("POST", "/api/whatsapp/status-callback")).toBe(true);
    expect(ex("POST", "/api/whatsapp/test-send")).toBe(false);
    expect(ex("POST", "/api/whatsapp/tokens")).toBe(false);
    expect(ex("POST", "/api/whatsapp/logs/bulk-delete")).toBe(false);
  });
});
