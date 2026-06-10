// Audit M1.3 (2026-06-10): several 500 handlers returned the raw
// `error.message` to the client — DB errors, provider responses, and stack
// hints leak implementation detail (OWASP error-handling guidance). This
// wrapper is the standard replacement: the full error goes to the server
// log under a short correlation id, the client gets only a generic Arabic
// message plus that id so support can match a user report to the log line.
//
// Usage in a catch block:
//   res.status(500).json(safeErrorPayload(error, "فشلت عملية الترجمة", "translate"));

import { randomUUID } from "node:crypto";

export function safeErrorPayload(
  error: unknown,
  publicMessage = "حدث خطأ في الخادم. يرجى المحاولة لاحقاً",
  logContext?: string,
): { message: string; errorId: string } {
  const errorId = randomUUID().slice(0, 8);
  console.error(
    `[safeError${logContext ? `:${logContext}` : ""}] id=${errorId}`,
    error instanceof Error ? error.stack || error.message : error,
  );
  return { message: publicMessage, errorId };
}
