import type { IncomingMessage, Server, ServerResponse } from "node:http";

/**
 * مسار حيوية سريع خارج Express — لفحص صحة Render (healthCheckPath).
 *
 * يُعالَج على مستوى خادم http قبل أي middleware أو موجّه Express، بلا I/O ولا
 * dynamic import ولا JSON تشخيصي: يقرأ أعلامًا في الذاكرة فقط ويرد ببضعة بايتات.
 * الهدف ألا يتنافس الفحص مع طابور الطلبات العادية تحت الضغط (حادثة 2026-10-25:
 * فشل فحص /health مرتين ⇒ Render أوقف التوجيه ثم أعاد تشغيل النسخة الوحيدة).
 *
 * الدلالة مطابقة لبوابة /health: 503 «starting» قبل جاهزية الإقلاع (لا يُوجَّه
 * ترافيك لحاوية باردة)، 503 «stopping» أثناء الإيقاف، و200 «ok» غير ذلك.
 * /health نفسه يبقى كما هو للتشخيص (leader/theSports/db).
 */
export const LIVENESS_PATHS = new Set(["/healthz", "/livez"]);

export interface LivenessOptions {
  /** جاهزية الإقلاع (مزلاج يثبت بعد أول نجاح) — قراءة ذاكرة فقط. */
  isReady: () => boolean;
  /** الخادم في مرحلة الإيقاف (SIGTERM). */
  isStopping?: () => boolean;
}

function pathOf(url: string | undefined): string {
  const raw = url || "/";
  const q = raw.indexOf("?");
  return q === -1 ? raw : raw.slice(0, q);
}

/**
 * يعيد true إن عالج الطلب (فلا يُمرَّر لـExpress)، وfalse لغير مسارات الحيوية.
 */
export function createLivenessHandler(opts: LivenessOptions) {
  return function handleLiveness(req: IncomingMessage, res: ServerResponse): boolean {
    if (req.method !== "GET" && req.method !== "HEAD") return false;
    if (!LIVENESS_PATHS.has(pathOf(req.url))) return false;

    let status = 200;
    let body = "ok";
    if (opts.isStopping?.()) {
      status = 503;
      body = "stopping";
    } else {
      let ready = false;
      try {
        ready = opts.isReady();
      } catch {
        ready = false;
      }
      if (!ready) {
        status = 503;
        body = "starting";
      }
    }
    res.writeHead(status, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : body);
    return true;
  };
}

/**
 * يلفّ معالج الطلبات (تطبيق Express) بحيث يُخدَم مسار الحيوية أولًا.
 */
export function withLivenessFastPath<
  H extends (req: IncomingMessage, res: ServerResponse) => void,
>(handler: H, opts: LivenessOptions) {
  const live = createLivenessHandler(opts);
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (live(req, res)) return;
    handler(req, res);
  };
}

function intFromEnv(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * مهلات الخادم: افتراضي Node لـkeepAliveTimeout هو 5 ثوانٍ فقط، فيغلق Node
 * الاتصالات الخاملة من بروكسي Render بسرعة ويُجبَر البروكسي على فتح اتصالات
 * TCP جديدة باستمرار تحت الطفرات (كل اتصال جديد = accept + تسجيل مقبس). نرفعها
 * فوق مهلة خمول البروكسيات المعتادة (60s)، وheadersTimeout أعلى منها كما توصي
 * وثائق Node. قابلة للضبط بـHTTP_KEEP_ALIVE_TIMEOUT_MS / HTTP_HEADERS_TIMEOUT_MS.
 */
export function applyServerTimeouts(server: Server, env: NodeJS.ProcessEnv = process.env) {
  const keepAlive = intFromEnv(env.HTTP_KEEP_ALIVE_TIMEOUT_MS, 65_000);
  const headers = Math.max(intFromEnv(env.HTTP_HEADERS_TIMEOUT_MS, keepAlive + 1_000), keepAlive + 1_000);
  server.keepAliveTimeout = keepAlive;
  server.headersTimeout = headers;
  return { keepAliveTimeout: keepAlive, headersTimeout: headers };
}
