import express, { type Router } from "express";
import rateLimit from "express-rate-limit";

const router: Router = express.Router();

export function sanitizeCspLogValue(value: unknown, fallback = "?"): string {
  if (typeof value !== "string" || !value) return fallback;
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`.slice(0, 300);
  } catch {
    return value.replace(/[\r\n\t]/g, " ").slice(0, 120);
  }
}

const cspReportLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many CSP reports" },
});

// Browsers POST Content-Security-Policy violation reports here while the
// strict policy runs in Report-Only mode (see server/index.ts). Keep this
// endpoint cheap and resilient: cap the body size, never throw, always 204.
router.post(
  "/api/security/csp-report",
  cspReportLimiter,
  express.json({
    type: ["application/csp-report", "application/reports+json", "application/json"],
    limit: "16kb",
  }),
  (req, res) => {
    try {
      const body: any = req.body;
      // Legacy report-uri payloads wrap the report under "csp-report";
      // report-to payloads send an array of { body } objects.
      const reports: any[] = Array.isArray(body) ? body : [body];
      for (const entry of reports) {
        const report = entry?.["csp-report"] || entry?.body || entry;
        const directive = report?.["violated-directive"] || report?.effectiveDirective;
        if (!directive) continue;
        const blocked = sanitizeCspLogValue(report?.["blocked-uri"] || report?.blockedURL);
        const docUri = sanitizeCspLogValue(report?.["document-uri"] || report?.documentURL);
        console.warn(`[CSP-Report] directive=${sanitizeCspLogValue(directive)} blocked=${blocked} doc=${docUri}`);
      }
    } catch {
      // Never let a malformed report surface as an error.
    }
    res.status(204).end();
  },
);

export default router;
