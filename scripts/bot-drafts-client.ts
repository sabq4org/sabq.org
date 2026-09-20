/**
 * عميل «مسودات البوتات» — Bot Drafts API client + CLI
 *
 * يستخدمه بوت «نشر سبق» ومهندّس (Grok Bot) أو أي وكيل يحمل توكن مسودات.
 * لا يستورد قاعدة البيانات — HTTP فقط عبر fetch (Node 18+).
 * العقد الكامل: docs/systems/editorial/BOT_DRAFTS_API.md
 *
 * البيئة (لا تضع التوكن في السطر أو في الشات):
 *   SABQ_BOT_DRAFTS_TOKEN   توكن البوت (Bearer)
 *   SABQ_API_BASE           افتراضي https://api.sabq.org
 *
 * USAGE:
 *   tsx scripts/bot-drafts-client.ts create --title="عنوان" --content-file=./body.txt [--category-slug=local] [--excerpt="…"] [--image-url=https://…] [--ref=grok-123]
 *   tsx scripts/bot-drafts-client.ts create --json=./draft.json
 *   tsx scripts/bot-drafts-client.ts update <id> --title="عنوان جديد" [--content-file=…] [--json=…]
 *   tsx scripts/bot-drafts-client.ts get <id>
 */

import { readFileSync } from "node:fs";

export interface BotDraftClientOptions {
  /** مثال: https://api.sabq.org */
  baseUrl: string;
  /** توكن البوت — من متغير بيئة أو مدير أسرار، لا يُطبع أبداً */
  token: string;
  fetchImpl?: typeof fetch;
}

export interface BotDraftPayload {
  title?: string;
  content?: string;
  contentFormat?: "html" | "text";
  subtitle?: string | null;
  excerpt?: string | null;
  categoryId?: string;
  categorySlug?: string;
  imageUrl?: string | null;
  keywords?: string[];
  sourceUrl?: string | null;
  clientReference?: string;
  notes?: string | null;
}

export interface BotDraft {
  id: string;
  status: string;
  updatable: boolean;
  title: string;
  slug: string;
  excerpt: string | null;
  categoryId: string | null;
  categorySlug: string | null;
  imageUrl: string | null;
  bot: string | null;
  clientReference: string | null;
  editUrl: string;
  previewUrl: string;
  createdAt: string;
  updatedAt: string;
}

export class BotDraftApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "BotDraftApiError";
  }
}

export class BotDraftsClient {
  private readonly base: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: BotDraftClientOptions) {
    if (!options.token) throw new Error("SABQ_BOT_DRAFTS_TOKEN is required");
    this.base = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** إنشاء مسودة عربية — تظهر فوراً في /dashboard/articles (المسودات). الحالة draft دائماً. */
  create(payload: BotDraftPayload & { title: string; content: string }): Promise<BotDraft> {
    return this.request("POST", "/api/internal/bot-drafts", payload);
  }

  /** تحديث مسودة أنشأها بوت وما زالت draft. 409 إن نُشرت/جُدولت أو يحررها محرر الآن. */
  update(id: string, payload: BotDraftPayload): Promise<BotDraft> {
    return this.request("PATCH", `/api/internal/bot-drafts/${encodeURIComponent(id)}`, payload);
  }

  /** حالة المسودة ومعرفها ورابط التحرير الداخلي. */
  get(id: string): Promise<BotDraft> {
    return this.request("GET", `/api/internal/bot-drafts/${encodeURIComponent(id)}`);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      throw new BotDraftApiError(
        response.status,
        json?.code ?? "http_error",
        json?.message ?? `HTTP ${response.status}`,
        json?.details,
      );
    }
    return json as T;
  }
}

// ────────────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (const arg of argv) {
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq === -1) flags[arg.slice(2)] = "true";
      else flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function payloadFromFlags(flags: Record<string, string>): BotDraftPayload {
  const payload: BotDraftPayload = flags.json ? JSON.parse(readFileSync(flags.json, "utf8")) : {};
  if (flags.title) payload.title = flags.title;
  if (flags.content) payload.content = flags.content;
  if (flags["content-file"]) payload.content = readFileSync(flags["content-file"], "utf8");
  if (flags["content-format"]) payload.contentFormat = flags["content-format"] as "html" | "text";
  if (flags.subtitle) payload.subtitle = flags.subtitle;
  if (flags.excerpt) payload.excerpt = flags.excerpt;
  if (flags["category-id"]) payload.categoryId = flags["category-id"];
  if (flags["category-slug"]) payload.categorySlug = flags["category-slug"];
  if (flags["image-url"]) payload.imageUrl = flags["image-url"];
  if (flags.keywords) payload.keywords = flags.keywords.split(",").map((k) => k.trim()).filter(Boolean);
  if (flags["source-url"]) payload.sourceUrl = flags["source-url"];
  if (flags.ref) payload.clientReference = flags.ref;
  if (flags.notes) payload.notes = flags.notes;
  return payload;
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [command, id] = positional;
  const client = new BotDraftsClient({
    baseUrl: process.env.SABQ_API_BASE || "https://api.sabq.org",
    token: process.env.SABQ_BOT_DRAFTS_TOKEN || "",
  });

  let result: BotDraft;
  switch (command) {
    case "create": {
      const payload = payloadFromFlags(flags);
      if (!payload.title || !payload.content) throw new Error("create needs --title and --content/--content-file (or --json)");
      result = await client.create(payload as BotDraftPayload & { title: string; content: string });
      break;
    }
    case "update": {
      if (!id) throw new Error("update needs <id>");
      result = await client.update(id, payloadFromFlags(flags));
      break;
    }
    case "get": {
      if (!id) throw new Error("get needs <id>");
      result = await client.get(id);
      break;
    }
    default:
      console.error("usage: bot-drafts-client.ts <create|update|get> [id] [--flags]  (see file header)");
      process.exit(2);
  }
  console.log(JSON.stringify(result, null, 2));
}

const isDirectRun = process.argv[1]?.endsWith("bot-drafts-client.ts");
if (isDirectRun) {
  main().catch((error) => {
    if (error instanceof BotDraftApiError) {
      console.error(JSON.stringify({ status: error.status, code: error.code, message: error.message, details: error.details }, null, 2));
    } else {
      console.error(error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  });
}
