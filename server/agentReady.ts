import type { Express, Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { db } from "./db";
import { articles, categories, users } from "@shared/schema";
import { and, desc, eq, or } from "drizzle-orm";

type SkillFile = {
  name: string;
  type: string;
  description: string;
  url: string;
  sha256: string;
  size: number;
};

const AGENT_SKILLS_DIR = path.resolve(process.cwd(), "public/.well-known/agent-skills");

function readSkillFront(filePath: string): { name: string; type: string; description: string } | null {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const m = raw.match(/^---\s*([\s\S]*?)\s*---/);
    if (!m) return null;
    const out: Record<string, string> = {};
    for (const line of m[1].split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (k) out[k] = v;
    }
    if (!out.name || !out.description) return null;
    return {
      name: out.name,
      type: out.type || "api",
      description: out.description,
    };
  } catch {
    return null;
  }
}

function computeSkills(origin: string): SkillFile[] {
  if (!fs.existsSync(AGENT_SKILLS_DIR)) return [];
  const out: SkillFile[] = [];
  for (const dirent of fs.readdirSync(AGENT_SKILLS_DIR, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const skillFile = path.join(AGENT_SKILLS_DIR, dirent.name, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;
    const front = readSkillFront(skillFile);
    if (!front) continue;
    const buf = fs.readFileSync(skillFile);
    const sha = crypto.createHash("sha256").update(buf).digest("hex");
    out.push({
      name: front.name,
      type: front.type,
      description: front.description,
      url: `${origin}/.well-known/agent-skills/${dirent.name}/SKILL.md`,
      sha256: `sha256-${sha}`,
      size: buf.length,
    });
  }
  return out;
}

function getOrigin(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] || req.protocol || "https";
  const host = req.get("host") || "sabq.org";
  return `${proto}://${host}`;
}

function escapeMd(s: string): string {
  return (s || "").replace(/[\\`*_{}\[\]()#+\-.!]/g, (m) => `\\${m}`);
}

function htmlToMarkdown(html: string): string {
  if (!html) return "";
  let s = html;
  // Strip script/style blocks
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  // Headings
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, lvl: string, inner: string) => {
    return `\n\n${"#".repeat(parseInt(lvl, 10))} ${stripTags(inner).trim()}\n\n`;
  });
  // Images
  s = s.replace(/<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*>/gi, "![$1]($2)");
  s = s.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, "![]($1)");
  // Links
  s = s.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, inner: string) => {
    const text = stripTags(inner).trim();
    return text ? `[${text}](${href})` : href;
  });
  // Lists
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner: string) => `\n- ${stripTags(inner).trim()}`);
  s = s.replace(/<\/?(ul|ol)[^>]*>/gi, "\n");
  // Paragraphs and breaks
  s = s.replace(/<\/p>/gi, "\n\n");
  s = s.replace(/<br\s*\/?>(\s*)/gi, "\n");
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner: string) =>
    "\n\n" + stripTags(inner).trim().split(/\n+/).map(l => `> ${l}`).join("\n") + "\n\n"
  );
  // Bold/italic
  s = s.replace(/<\/?strong[^>]*>|<\/?b[^>]*>/gi, "**");
  s = s.replace(/<\/?em[^>]*>|<\/?i[^>]*>/gi, "*");
  // Strip everything else
  s = stripTags(s);
  // Decode common entities
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Collapse whitespace
  s = s.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
  return s;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

function wantsMarkdown(req: Request): boolean {
  const accept = (req.headers["accept"] as string) || "";
  if (!accept) return false;
  // Look for text/markdown explicitly preferred over HTML
  const mdMatch = accept.match(/text\/markdown(?:;[^,]*)?(?:\s*;\s*q=([0-9.]+))?/i);
  if (!mdMatch) return false;
  const mdQ = mdMatch[1] ? parseFloat(mdMatch[1]) : 1;
  const htmlMatch = accept.match(/text\/html(?:;[^,]*)?(?:\s*;\s*q=([0-9.]+))?/i);
  const htmlQ = htmlMatch ? (htmlMatch[1] ? parseFloat(htmlMatch[1]) : 1) : 0;
  return mdQ >= htmlQ;
}

async function renderHomeMarkdown(origin: string): Promise<string> {
  const latest = await db
    .select({
      title: articles.title,
      slug: articles.slug,
      excerpt: articles.excerpt,
      publishedAt: articles.publishedAt,
    })
    .from(articles)
    .where(eq(articles.status, "published"))
    .orderBy(desc(articles.publishedAt))
    .limit(20);

  const lines: string[] = [];
  lines.push("# سبق الذكية — Sabq Smart News");
  lines.push("");
  lines.push("منصة الأخبار السعودية الأولى المدعومة بالذكاء الاصطناعي.");
  lines.push("");
  lines.push("- الموقع: " + origin);
  lines.push("- API كاتالوج: " + origin + "/.well-known/api-catalog");
  lines.push("- مواصفة OpenAPI: " + origin + "/openapi.json");
  lines.push("- سياسة استخدام الذكاء الاصطناعي: " + origin + "/.well-known/ai-usage.json");
  lines.push("- مهارات الوكلاء: " + origin + "/.well-known/agent-skills/index.json");
  lines.push("");
  lines.push("## أحدث الأخبار");
  lines.push("");
  for (const a of latest) {
    const url = `${origin}/article/${a.slug}`;
    lines.push(`- [${(a.title || "").trim()}](${url})`);
    if (a.excerpt) lines.push(`  - ${a.excerpt.trim()}`);
  }
  lines.push("");
  return lines.join("\n");
}

async function renderArticleMarkdown(slug: string, origin: string): Promise<string | null> {
  const decoded = decodeURIComponent(slug);
  const [article] = await db
    .select({
      id: articles.id,
      title: articles.title,
      subtitle: articles.subtitle,
      slug: articles.slug,
      content: articles.content,
      excerpt: articles.excerpt,
      imageUrl: articles.imageUrl,
      publishedAt: articles.publishedAt,
      authorId: articles.authorId,
      categoryId: articles.categoryId,
      status: articles.status,
    })
    .from(articles)
    .where(or(eq(articles.slug, decoded), eq(articles.englishSlug, decoded))!)
    .limit(1);
  if (!article || article.status !== "published") return null;

  let categoryName: string | null = null;
  if (article.categoryId) {
    const [cat] = await db
      .select({ nameAr: categories.nameAr })
      .from(categories)
      .where(eq(categories.id, article.categoryId))
      .limit(1);
    categoryName = cat?.nameAr ?? null;
  }
  let authorName: string | null = null;
  if (article.authorId) {
    const [u] = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, article.authorId))
      .limit(1);
    authorName = u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || null : null;
  }

  const lines: string[] = [];
  lines.push(`# ${article.title}`);
  lines.push("");
  if (article.subtitle) {
    lines.push(`> ${article.subtitle}`);
    lines.push("");
  }
  const meta: string[] = [];
  if (categoryName) meta.push(`القسم: ${categoryName}`);
  if (authorName) meta.push(`الكاتب: ${authorName}`);
  if (article.publishedAt) meta.push(`النشر: ${new Date(article.publishedAt).toISOString()}`);
  meta.push(`الرابط: ${origin}/article/${article.slug}`);
  if (meta.length) {
    lines.push(meta.join(" · "));
    lines.push("");
  }
  if (article.imageUrl) {
    lines.push(`![](${article.imageUrl})`);
    lines.push("");
  }
  if (article.excerpt) {
    lines.push(`**${article.excerpt}**`);
    lines.push("");
  }
  lines.push(htmlToMarkdown(article.content || ""));
  lines.push("");
  lines.push("---");
  lines.push("المصدر: صحيفة سبق — " + origin);
  return lines.join("\n");
}

async function renderCategoryMarkdown(slug: string, origin: string): Promise<string | null> {
  const decoded = decodeURIComponent(slug);
  const [cat] = await db
    .select()
    .from(categories)
    .where(or(eq(categories.slug, decoded), eq(categories.englishSlug, decoded))!)
    .limit(1);
  if (!cat) return null;

  const list = await db
    .select({
      title: articles.title,
      slug: articles.slug,
      excerpt: articles.excerpt,
      publishedAt: articles.publishedAt,
    })
    .from(articles)
    .where(and(eq(articles.categoryId, cat.id), eq(articles.status, "published"))!)
    .orderBy(desc(articles.publishedAt))
    .limit(30);

  const lines: string[] = [];
  lines.push(`# ${cat.nameAr}`);
  if (cat.nameEn) lines.push(`*${cat.nameEn}*`);
  lines.push("");
  if (cat.description) {
    lines.push(cat.description);
    lines.push("");
  }
  lines.push(`الرابط: ${origin}/category/${cat.slug}`);
  lines.push("");
  lines.push("## آخر المقالات");
  lines.push("");
  for (const a of list) {
    lines.push(`- [${(a.title || "").trim()}](${origin}/article/${a.slug})`);
    if (a.excerpt) lines.push(`  - ${a.excerpt.trim()}`);
  }
  return lines.join("\n");
}

export function setupAgentReady(app: Express): void {
  // -------------------------------------------------------------
  // 1) Link headers (RFC 8288) on HTML pages
  // -------------------------------------------------------------
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api/") || req.path.startsWith("/.well-known/")) return next();
    if (req.path.includes(".") && !req.path.endsWith(".html")) return next();

    const origin = getOrigin(req);
    const links = [
      `<${origin}/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
      `<${origin}/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"`,
      `<${origin}/api-docs>; rel="service-doc"; type="text/html"`,
      `<${origin}/.well-known/ai-usage.json>; rel="license"; type="application/json"`,
      `<${origin}/.well-known/mcp/server-card.json>; rel="mcp-server-card"; type="application/json"`,
      `<${origin}/.well-known/agent-skills/index.json>; rel="agent-skills"; type="application/json"`,
    ];
    res.setHeader("Link", links.join(", "));
    next();
  });

  // -------------------------------------------------------------
  // 2) Markdown content negotiation for HTML pages
  // -------------------------------------------------------------
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET") return next();
    if (!wantsMarkdown(req)) return next();
    if (req.path.startsWith("/api/") || req.path.startsWith("/.well-known/")) return next();
    if (req.path.includes(".") && !req.path.endsWith(".html") && req.path !== "/") return next();

    try {
      const origin = getOrigin(req);
      let body: string | null = null;

      const articleMatch = req.path.match(/^\/(?:article|news)\/([^/]+)\/?$/);
      const categoryMatch = req.path.match(/^\/category\/([^/]+)\/?$/);

      if (req.path === "/" || req.path === "") {
        body = await renderHomeMarkdown(origin);
      } else if (articleMatch) {
        body = await renderArticleMarkdown(articleMatch[1], origin);
      } else if (categoryMatch) {
        body = await renderCategoryMarkdown(categoryMatch[1], origin);
      }

      if (body == null) return next();

      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Vary", "Accept");
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.status(200).send(body);
    } catch (err) {
      console.error("[AgentReady] Markdown negotiation error:", err);
      next();
    }
  });

  // -------------------------------------------------------------
  // 3) /.well-known/api-catalog (RFC 9727)
  // -------------------------------------------------------------
  app.get("/.well-known/api-catalog", (req, res) => {
    const origin = getOrigin(req);
    res.setHeader("Content-Type", "application/linkset+json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.json({
      linkset: [
        {
          anchor: `${origin}/api/v1`,
          "service-desc": [
            {
              href: `${origin}/openapi.json`,
              type: "application/vnd.oai.openapi+json",
              title: "Sabq Smart News OpenAPI 3.0 specification",
            },
          ],
          "service-doc": [
            {
              href: `${origin}/api-docs`,
              type: "text/html",
              title: "Sabq API documentation (Swagger UI)",
              hreflang: ["ar", "en"],
            },
          ],
          "service-meta": [
            {
              href: `${origin}/.well-known/ai-usage.json`,
              type: "application/json",
              title: "AI usage policy",
            },
          ],
          status: [
            {
              href: `${origin}/health`,
              type: "application/json",
              title: "Service health endpoint",
            },
          ],
          "oauth-protected-resource": [
            {
              href: `${origin}/.well-known/oauth-protected-resource`,
              type: "application/json",
            },
          ],
          author: [
            {
              href: `${origin}/about`,
              title: "Sabq Newspaper",
            },
          ],
          license: [
            {
              href: `${origin}/ai-policy`,
              title: "Sabq-AI-Use-1.0",
            },
          ],
        },
      ],
    });
  });

  // -------------------------------------------------------------
  // 4) OAuth 2.0 / OIDC discovery (RFC 8414, OIDC Discovery 1.0)
  // -------------------------------------------------------------
  // Sabq exposes a Google-backed authorization-code login flow at
  // /api/auth/google whose callback establishes a first-party session
  // cookie. We publish full RFC 8414 / OIDC Discovery 1.0 documents
  // covering that flow: authorize, token, jwks, end-session,
  // userinfo. /api/oauth/token is a real RFC 6749 §5.2 token endpoint
  // that returns `invalid_grant` for any code presented by a
  // third-party client (Sabq does not currently issue authorization
  // codes to external clients). /.well-known/jwks.json returns an
  // empty JWK Set (valid per RFC 7517 §5) and pairs with
  // `id_token_signing_alg_values_supported: ["none"]` since Sabq does
  // not currently sign ID tokens itself.
  app.post("/api/oauth/token", (req, res) => {
    const grantType = String((req.body && req.body.grant_type) || "");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    if (grantType !== "authorization_code") {
      return res.status(400).json({
        error: "unsupported_grant_type",
        error_description:
          "Only the 'authorization_code' grant is advertised; see /.well-known/oauth-authorization-server.",
      });
    }
    return res.status(400).json({
      error: "invalid_grant",
      error_description:
        "Sabq does not currently issue authorization codes to third-party clients.",
    });
  });

  app.get("/.well-known/oauth-authorization-server", (req, res) => {
    const origin = getOrigin(req);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.json({
      issuer: origin,
      authorization_endpoint: `${origin}/api/auth/google`,
      token_endpoint: `${origin}/api/oauth/token`,
      revocation_endpoint: `${origin}/api/auth/logout`,
      jwks_uri: `${origin}/.well-known/jwks.json`,
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["openid", "email", "profile"],
      service_documentation: `${origin}/api-docs`,
      ui_locales_supported: ["ar", "en"],
    });
  });

  app.get("/.well-known/openid-configuration", (req, res) => {
    const origin = getOrigin(req);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.json({
      issuer: origin,
      authorization_endpoint: `${origin}/api/auth/google`,
      token_endpoint: `${origin}/api/oauth/token`,
      userinfo_endpoint: `${origin}/api/auth/user`,
      end_session_endpoint: `${origin}/api/auth/logout`,
      jwks_uri: `${origin}/.well-known/jwks.json`,
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["none"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["openid", "email", "profile"],
      claims_supported: [
        "sub",
        "email",
        "email_verified",
        "name",
        "given_name",
        "family_name",
        "picture",
        "locale",
      ],
      code_challenge_methods_supported: ["S256"],
      service_documentation: `${origin}/api-docs`,
      ui_locales_supported: ["ar", "en"],
    });
  });

  app.get("/.well-known/jwks.json", (_req, res) => {
    // Empty JWK Set is a valid JWKS per RFC 7517 §5; consistent with
    // id_token_signing_alg_values_supported = ["none"] above.
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.json({ keys: [] });
  });

  // -------------------------------------------------------------
  // 5) OAuth Protected Resource Metadata (RFC 9728)
  // -------------------------------------------------------------
  // Per RFC 9728: `authorization_servers` lists issuers that can mint
  // tokens for this resource and `bearer_methods_supported` only
  // accepts the standard transports (`header`, `body`, `query`). We
  // list Sabq itself as the authorization server (matching the AS
  // metadata above) and use the `header` bearer method.
  app.get("/.well-known/oauth-protected-resource", (req, res) => {
    const origin = getOrigin(req);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.json({
      resource: `${origin}/api`,
      resource_name: "Sabq Smart News API",
      resource_documentation: `${origin}/api-docs`,
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
      scopes_supported: [
        "articles.read",
        "categories.read",
        "comments.read",
      ],
      resource_policy_uri: `${origin}/.well-known/ai-usage.json`,
      resource_tos_uri: `${origin}/terms`,
    });
  });

  // -------------------------------------------------------------
  // 6) MCP Server Card (SEP-1649)
  // -------------------------------------------------------------
  app.get("/.well-known/mcp/server-card.json", (req, res) => {
    const origin = getOrigin(req);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.json({
      $schema: "https://modelcontextprotocol.io/schemas/2025-06/server-card.json",
      schemaVersion: "2025-06",
      serverInfo: {
        name: "sabq-news-mcp",
        title: "Sabq Smart News MCP Server",
        version: "1.0.0",
        description:
          "MCP server exposing Sabq Smart News read tools (search, latest, breaking, categories, article fetch).",
        vendor: "Sabq Newspaper",
        homepage: origin,
        contact: "info@sabq.org",
      },
      transports: [
        {
          type: "streamable-http",
          endpoint: `${origin}/mcp`,
          documentation: `${origin}/api-docs`,
        },
      ],
      authentication: {
        type: "none",
        anonymous_allowed: true,
        protected_resource_metadata: `${origin}/.well-known/oauth-protected-resource`,
      },
      capabilities: {
        tools: {
          listChanged: false,
        },
        resources: {
          subscribe: false,
          listChanged: false,
        },
        prompts: {
          listChanged: false,
        },
        logging: {},
      },
      tools: [
        {
          name: "search_news",
          description: "Search Sabq published articles by keyword.",
          api: `${origin}/api/v1/search`,
        },
        {
          name: "get_article",
          description: "Fetch a Sabq article by ID.",
          api: `${origin}/api/v1/articles/{id}`,
        },
        {
          name: "list_latest",
          description: "List the latest Sabq articles.",
          api: `${origin}/api/v1/articles`,
        },
        {
          name: "list_breaking",
          description: "List Sabq breaking news.",
          api: `${origin}/api/v1/breaking`,
        },
        {
          name: "list_categories",
          description: "List Sabq content categories.",
          api: `${origin}/api/v1/categories`,
        },
      ],
      skills: `${origin}/.well-known/agent-skills/index.json`,
      policy: `${origin}/.well-known/ai-usage.json`,
    });
  });

  // -------------------------------------------------------------
  // 7) Agent Skills discovery index + static SKILL.md files
  // -------------------------------------------------------------
  app.get("/.well-known/agent-skills/index.json", (req, res) => {
    const origin = getOrigin(req);
    const skills = computeSkills(origin);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=600, s-maxage=600");
    res.json({
      $schema: "https://agentskills.dev/schemas/v1/index.json",
      version: "1.0",
      provider: {
        name: "Sabq Newspaper",
        url: origin,
        contact: "info@sabq.org",
      },
      generated_at: new Date().toISOString(),
      skills,
    });
  });

  app.get(
    /^\/\.well-known\/agent-skills\/([a-z0-9_-]+)\/SKILL\.md$/i,
    (req: Request, res: Response) => {
      const name = req.params[0] as string;
      const file = path.join(AGENT_SKILLS_DIR, name, "SKILL.md");
      if (!file.startsWith(AGENT_SKILLS_DIR) || !fs.existsSync(file)) {
        return res.status(404).type("text/plain").send("Not found");
      }
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=600, s-maxage=600");
      res.sendFile(file);
    }
  );

  console.log("[Server] ✅ Agent-Ready endpoints registered (Link, Markdown, well-known)");
}
