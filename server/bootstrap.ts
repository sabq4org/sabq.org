import { createServer, type IncomingMessage, type ServerResponse } from "http";

const port = parseInt(process.env.PORT || "5000", 10);
let expressHandler: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (expressHandler) {
    expressHandler(req, res);
    return;
  }
  const url = req.url || "/";
  if (url.startsWith("/assets/") || url.endsWith(".js") || url.endsWith(".css") || url.endsWith(".png") || url.endsWith(".ico") || url.endsWith(".svg") || url.endsWith(".woff2") || url.endsWith(".webp") || url.endsWith(".jpg")) {
    res.writeHead(503, { "Retry-After": "3" });
    res.end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache, no-store",
  });
  res.end(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>سبق - جاري التحميل</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0a0a;color:#fff;font-family:system-ui,sans-serif;direction:rtl}.loader{text-align:center}.spinner{width:40px;height:40px;border:3px solid #333;border-top-color:#3b82f6;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px}@keyframes spin{to{transform:rotate(360deg)}}p{opacity:.7;font-size:14px}</style></head><body><div class="loader"><div class="spinner"></div><p>جاري تحميل سبق...</p></div><script>setTimeout(()=>location.reload(),3000)</script></body></html>`);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[Bootstrap] Listening on port ${port}`);
  (globalThis as any).__sabqServer = server;
  (globalThis as any).__sabqPort = port;

  (globalThis as any).__sabqAttachExpress = (app: any) => {
    expressHandler = app;
    console.log("[Bootstrap] ✅ Express attached — now handling all requests");
  };

  (globalThis as any).__sabqMarkReady = () => {
    console.log("[Bootstrap] ✅ Server fully ready (DB warmed up)");
  };

  import("./index.js").catch((err) => {
    console.error("[Bootstrap] FATAL:", err);
    process.exit(1);
  });
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
process.on("uncaughtException", (e) => console.error("[CRITICAL]", e));
process.on("unhandledRejection", (r) => console.error("[CRITICAL]", r));
