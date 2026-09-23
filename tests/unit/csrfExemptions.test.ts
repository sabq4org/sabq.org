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
});
