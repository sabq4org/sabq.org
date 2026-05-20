// ============================================================================
// Hajj Block — public + admin endpoints
// ============================================================================
//
// Powers the "صدى الحج" homepage block. The PUBLIC GET hides the block
// entirely (returns isVisible=false) when:
//   - config row hasn't been seeded yet, or
//   - isActive is false, or
//   - the season window is set and we're outside it.
//
// Otherwise it returns:
//   - articles matching any keyword (or pinned), within lookbackHours
//   - each article carries an auto-derived `hajjTag` (من عرفات / في منى /
//     من مزدلفة / ضيوف الرحمن / في موسم الحج) computed by inspecting
//     title + excerpt for the relevant Arabic stems
//   - `hajjDay` — current day of Dhul-Hijjah if we're in the ritual
//     period (8-13 = Tarwiyah through Tashreeq), else null
//   - `daysToArafat` — how many full days until 9 Dhul-Hijjah this year,
//     or null after the day has passed
//   - `lastUpdatedAt` — server time for the "آخر تحديث" pill in the UI
//
// The ADMIN PUT updates the singleton config — only admin/system_admin
// roles. Editors who curate Hajj content can be granted access by
// adding the `hajj_block.manage` permission to their RBAC role later;
// today we keep it admin-gated for simplicity.

import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { hajjBlockConfig, articles } from "@shared/schema";
import { SUPERUSER_ROLE_NAMES } from "@shared/rbac-constants";
import { isAuthenticated } from "../auth";
import { sql, and, or, eq, gte, inArray, ilike, desc, ne } from "drizzle-orm";

const router = Router();

// ----------------------------------------------------------------------------
// Tag derivation — pure-text inspection on the article's title + excerpt.
// Order matters: first match wins so a piece that mentions both "عرفات"
// and "منى" surfaces as "من عرفات" (the higher-context location).
// ----------------------------------------------------------------------------

const HAJJ_TAGS: Array<{ tag: string; emoji: string; keywords: RegExp }> = [
  { tag: "من عرفات",   emoji: "🏔️", keywords: /(عرفات|عرفة|وقفة)/i },
  { tag: "من مزدلفة",  emoji: "🌙", keywords: /(مزدلفة|المشعر الحرام)/i },
  { tag: "في منى",     emoji: "🪨", keywords: /(منى|الجمرات|الجمرة|رمي الجمار)/i },
  { tag: "في الطواف",  emoji: "🕋", keywords: /(الطواف|طواف الإفاضة|طواف الوداع|طواف القدوم|الكعبة)/i },
  { tag: "ضيوف الرحمن",emoji: "🕊️", keywords: /(ضيوف الرحمن|الحجاج|حاج )/i },
];

function deriveHajjTag(text: string): { tag: string; emoji: string } | null {
  for (const t of HAJJ_TAGS) {
    if (t.keywords.test(text)) return { tag: t.tag, emoji: t.emoji };
  }
  return null;
}

// ----------------------------------------------------------------------------
// Hijri-aware "ritual day" calculator. We use Intl.DateTimeFormat with the
// `islamic-umalqura` calendar (Saudi-official) because the Hajj season is
// defined by THAT calendar specifically; the generic `islamic` calendar
// can be off by a day. Returns:
//   - hajjDay: 1..13 if we're within ذو الحجة 1-13, else null
//   - daysToArafat: full days until 9 ذو الحجة (Arafat), else null after it
//   - hajjPhase: "before" | "tarwiyah" | "arafat" | "nahr" | "tashreeq" | "after" | null
// ----------------------------------------------------------------------------

function hijriDay(date: Date) {
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
    timeZone: "Asia/Riyadh",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { day: get("day"), month: get("month"), year: get("year") };
}

function hajjContext(now: Date = new Date()) {
  const hijri = hijriDay(now);
  // ذو الحجة = month 12 in islamic-umalqura
  if (hijri.month !== 12) {
    // Could compute days-to-Arafat across the year boundary, but the
    // block is only meant to surface inside the season — return null
    // outside it so the UI hides cleanly.
    return { hajjDay: null, daysToArafat: null, hajjPhase: null };
  }
  const day = hijri.day;
  let phase: string | null = null;
  if (day < 8) phase = "before";
  else if (day === 8) phase = "tarwiyah";
  else if (day === 9) phase = "arafat";
  else if (day === 10) phase = "nahr";
  else if (day >= 11 && day <= 13) phase = "tashreeq";
  else phase = "after";

  const daysToArafat = day <= 9 ? 9 - day : null;
  return { hajjDay: day, daysToArafat, hajjPhase: phase };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

async function loadConfig() {
  const [row] = await db.select().from(hajjBlockConfig).limit(1);
  return row ?? null;
}

async function ensureAdmin(req: Request): Promise<boolean> {
  if (!req.isAuthenticated?.() || !req.user) return false;
  const user = req.user as any;
  if ((SUPERUSER_ROLE_NAMES as readonly string[]).includes(user.role)) return true;
  const [row] = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = ${user.id}
      AND r.name IN ('admin','system_admin','superadmin','system.admin')
  `).then((r) => r.rows as any[]);
  return Number(row?.n ?? 0) > 0;
}

// ----------------------------------------------------------------------------
// PUBLIC: GET /api/hajj-block
// ----------------------------------------------------------------------------

router.get("/", async (_req: Request, res: Response) => {
  try {
    const config = await loadConfig();
    if (!config || !config.isActive) {
      return res.json({ isVisible: false });
    }
    const now = new Date();
    if (config.seasonStartDate && now < config.seasonStartDate) {
      return res.json({ isVisible: false, reason: "before_season" });
    }
    if (config.seasonEndDate && now > config.seasonEndDate) {
      return res.json({ isVisible: false, reason: "after_season" });
    }

    const cutoff = new Date(now.getTime() - (config.lookbackHours ?? 48) * 60 * 60 * 1000);
    const keywords = (config.keywords ?? []).filter((k) => k && k.trim().length > 0);
    const pinned = (config.pinnedArticleIds ?? []).filter((id) => !!id);

    // Build the query: pinned UNION keyword-matched, limited to the
    // configured count. Pinned rows always come first regardless of
    // their publishedAt, so a curated "lead" stays at the top.
    const keywordConds = keywords.map((kw) =>
      or(
        ilike(articles.title, `%${kw}%`),
        ilike(articles.excerpt, `%${kw}%`),
      ),
    );

    // Compose the WHERE conditions explicitly. The previous
    // implementation used a `sql\`true\`` placeholder inside `and(...)`
    // when there were no pinned ids — Drizzle chokes on that and the
    // endpoint 500'd with "تعذر جلب بلوك الحج". Build the array and
    // only push the NOT IN clause when there's actually something to
    // exclude.
    const whereConds: any[] = [
      eq(articles.status, "published"),
      gte(articles.publishedAt, cutoff),
      or(...keywordConds),
    ];
    if (pinned.length > 0) {
      whereConds.push(sql`${articles.id} NOT IN (${sql.join(pinned.map((id) => sql`${id}`), sql`, `)})`);
    }
    const keywordMatched = keywords.length > 0
      ? await db
          .select({
            id: articles.id,
            title: articles.title,
            slug: articles.slug,
            excerpt: articles.excerpt,
            imageUrl: articles.imageUrl,
            publishedAt: articles.publishedAt,
            isBreaking: articles.isBreaking,
          })
          .from(articles)
          .where(and(...whereConds))
          .orderBy(desc(articles.publishedAt))
          .limit(config.articleLimit ?? 5)
      : [];

    const pinnedRows = pinned.length > 0
      ? await db
          .select({
            id: articles.id,
            title: articles.title,
            slug: articles.slug,
            excerpt: articles.excerpt,
            imageUrl: articles.imageUrl,
            publishedAt: articles.publishedAt,
            isBreaking: articles.isBreaking,
          })
          .from(articles)
          .where(
            and(
              eq(articles.status, "published"),
              inArray(articles.id, pinned),
            ),
          )
      : [];

    // Re-sort pinned rows to match the configured order.
    const pinnedSorted = pinned
      .map((id) => pinnedRows.find((r) => r.id === id))
      .filter((r): r is NonNullable<typeof r> => !!r);

    const combined = [...pinnedSorted, ...keywordMatched]
      .slice(0, config.articleLimit ?? 5);

    const articlesOut = combined.map((a) => {
      const tagInfo = deriveHajjTag(`${a.title} ${a.excerpt ?? ""}`);
      return {
        id: a.id,
        title: a.title,
        slug: a.slug,
        excerpt: a.excerpt,
        imageUrl: a.imageUrl,
        publishedAt: a.publishedAt,
        isBreaking: a.isBreaking,
        isPinned: pinned.includes(a.id),
        hajjTag: tagInfo?.tag ?? "في موسم الحج",
        hajjEmoji: tagInfo?.emoji ?? "🕋",
      };
    });

    const ctx = hajjContext(now);

    res.json({
      isVisible: true,
      title: config.title,
      subtitle: config.subtitle,
      articles: articlesOut,
      hajjDay: ctx.hajjDay,
      daysToArafat: ctx.daysToArafat,
      hajjPhase: ctx.hajjPhase,
      lastUpdatedAt: now.toISOString(),
    });
  } catch (err) {
    console.error("[HajjBlock] GET error:", err);
    res.status(500).json({ isVisible: false, message: "تعذر جلب بلوك الحج" });
  }
});

// ----------------------------------------------------------------------------
// ADMIN: GET /api/admin/hajj-block — current settings
// ----------------------------------------------------------------------------

router.get("/admin", isAuthenticated, async (req: Request, res: Response) => {
  if (!(await ensureAdmin(req))) {
    return res.status(403).json({ message: "للمسؤولين فقط" });
  }
  const config = await loadConfig();
  res.json({ config });
});

// ----------------------------------------------------------------------------
// ADMIN: PUT /api/admin/hajj-block — upsert settings
// ----------------------------------------------------------------------------

router.put("/admin", isAuthenticated, async (req: Request, res: Response) => {
  if (!(await ensureAdmin(req))) {
    return res.status(403).json({ message: "للمسؤولين فقط" });
  }
  try {
    const userId = (req.user as any)?.id ?? null;
    const body = req.body ?? {};

    const updates: any = {
      updatedBy: userId,
      updatedAt: new Date(),
    };
    if (body.isActive !== undefined) updates.isActive = !!body.isActive;
    if (typeof body.title === "string") updates.title = body.title.trim().slice(0, 80);
    if (typeof body.subtitle === "string" || body.subtitle === null) {
      updates.subtitle = body.subtitle ? String(body.subtitle).trim().slice(0, 160) : null;
    }
    if (Array.isArray(body.keywords)) {
      updates.keywords = body.keywords
        .map((k: unknown) => String(k).trim())
        .filter((k: string) => k.length > 0 && k.length <= 50);
    }
    if (typeof body.articleLimit === "number") {
      updates.articleLimit = Math.max(1, Math.min(20, body.articleLimit));
    }
    if (typeof body.lookbackHours === "number") {
      updates.lookbackHours = Math.max(1, Math.min(720, body.lookbackHours));
    }
    if (body.seasonStartDate !== undefined) {
      updates.seasonStartDate = body.seasonStartDate ? new Date(body.seasonStartDate) : null;
    }
    if (body.seasonEndDate !== undefined) {
      updates.seasonEndDate = body.seasonEndDate ? new Date(body.seasonEndDate) : null;
    }
    if (Array.isArray(body.pinnedArticleIds)) {
      updates.pinnedArticleIds = body.pinnedArticleIds
        .map((id: unknown) => String(id))
        .filter((id: string) => id.length > 0);
    }

    // Upsert the singleton row.
    const existing = await loadConfig();
    if (existing) {
      await db.update(hajjBlockConfig).set(updates).where(eq(hajjBlockConfig.id, "default"));
    } else {
      await db.insert(hajjBlockConfig).values({ id: "default", ...updates });
    }
    const config = await loadConfig();
    res.json({ success: true, config });
  } catch (err) {
    console.error("[HajjBlock] PUT error:", err);
    res.status(500).json({ message: "تعذر تحديث الإعدادات" });
  }
});

export default router;
