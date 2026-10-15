/** Runtime safety gates for the isolated staging environment. */
export function isStagingRuntime(): boolean {
  return process.env.STAGING_NO_INDEX === "true";
}

export function stagingSessionCookieName(): string {
  return isStagingRuntime() ? "sabq-staging.sid" : "connect.sid";
}

export function stagingCsrfCookieName(): string {
  return isStagingRuntime() ? "sabq-staging.csrf" : "csrf-token";
}

/** External provider side effects are opt-in for staging integration tests. */
export function stagingOutboundDisabled(): boolean {
  return isStagingRuntime() && process.env.STAGING_ALLOW_OUTBOUND !== "true";
}

export function stagingOutboundError(channel: string): Error | null {
  return stagingOutboundDisabled()
    ? new Error(`STAGING_OUTBOUND_DISABLED:${channel}`)
    : null;
}

export function stagingApiAuthStatus(authorization: string | undefined): "allow" | "missing-config" | "unauthorized" {
  if (!isStagingRuntime()) return "allow";
  const token = (process.env.STAGING_ACCESS_TOKEN || "").trim();
  if (!token) return "missing-config";
  const expected = `Basic ${Buffer.from(`sabq:${token}`).toString("base64")}`;
  return authorization === expected ? "allow" : "unauthorized";
}
