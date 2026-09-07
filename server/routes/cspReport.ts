import express, { type Router } from "express";
import rateLimit from "express-rate-limit";

const router: Router = express.Router();

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
        const blocked = report?.["blocked-uri"] || report?.blockedURL || "?";
        const docUri = report?.["document-uri"] || report?.documentURL || "?";
        console.warn(`[CSP-Report] directive=${directive} blocked=${blocked} doc=${docUri}`);
      }
    } catch {
      // Never let a malformed report surface as an error.
    }
    res.status(204).end();
  },
);

export default router;
