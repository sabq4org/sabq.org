// ============================================================================
// Loyalty Admin Dashboard endpoints
// ============================================================================
//
// Powers the /dashboard/loyalty-admin page. Every endpoint here is gated to
// admin / system_admin so we can show full user-level point + reward data
// without worrying about exposure to readers.
//
// Data sources:
//   - user_points_total           — current tier + lifetime points per user
//   - user_loyalty_events         — every action that awarded points
//   - loyalty_rewards             — catalog of available rewards
//   - user_rewards_history        — redemption log (pending + delivered reserve points)
//
// All endpoints accept an optional ?period query param (`7d`, `30d`, `90d`,
// or an ISO range `from=...&to=...`). The default is `30d`.
//
// Tier metadata (level, Arabic/English name, color, threshold) comes from
// shared/loyalty.ts — single source of truth so the dashboard, profile, and
// iOS app all agree on what each tier means.

import { Router, type Request, type Response } from "express";
import { db } from "../db";
import {
  userPointsTotal,
  userLoyaltyEvents,
  userRewardsHistory,
  loyaltyRewards,
  loyaltyCampaigns,
  users,
} from "@shared/schema";
import {
  LOYALTY_TIERS,
  LOYALTY_ACTION_META,
  LOYALTY_ACTION_POINTS,
  getLoyaltyActionMeta,
} from "@shared/loyalty";
import { SUPERUSER_ROLE_NAMES } from "@shared/rbac-constants";
import { isAuthenticated } from "../auth";
import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { z } from "zod";

const router = Router();

// ----------------------------------------------------------------------------
// Auth gate — only admins/system_admins can see other people's loyalty data.
// Sits in front of every route in this router.
// ----------------------------------------------------------------------------

async function requireLoyaltyAdmin(req: Request, res: Response, next: () => void) {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.status(401).json({ message: "غير مصرح" });
  }
  const user = req.user as any;
  const legacyRoleIsAdmin = (SUPERUSER_ROLE_NAMES as readonly string[]).includes(user.role);
  if (legacyRoleIsAdmin) {
    return next();
  }
  // RBAC roles fallback — same check used elsewhere in the codebase.
  try {
    const [{ count }] = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ${user.id}
        AND r.name IN ('admin','system_admin','superadmin','system.admin')
    `).then((r) => r.rows as any[]);
    if (count > 0) return next();
  } catch (err) {
    console.error("[LoyaltyAdmin] role lookup failed:", err);
  }
  return res.status(403).json({ message: "هذه الصفحة للمسؤولين فقط" });
}

router.use(isAuthenticated, requireLoyaltyAdmin);

const rewardInputSchema = z.object({
  nameAr: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  pointsCost: z.coerce.number().int().positive().max(10_000_000),
  rewardType: z.enum(["COUPON", "BADGE", "CONTENT_ACCESS", "PARTNER_REWARD"]),
  stock: z.coerce.number().int().nonnegative().nullable().optional(),
  remainingStock: z.coerce.number().int().nonnegative().nullable().optional(),
  maxRedemptionsPerUser: z.coerce.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const campaignInputSchema = z.object({
  nameAr: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  campaignType: z.enum(["BONUS_POINTS", "MULTIPLIER", "SPECIAL_EVENT"]),
  targetAction: z.string().trim().nullable().optional(),
  multiplier: z.coerce.number().min(1).max(10).optional(),
  bonusPoints: z.coerce.number().int().min(0).max(100_000).optional(),
  isActive: z.boolean().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
}).refine((value) => new Date(value.endAt) > new Date(value.startAt), {
  message: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية",
  path: ["endAt"],
}).refine((value) => !value.targetAction || (
  value.targetAction !== "ADMIN_ADJUSTMENT" && Boolean(LOYALTY_ACTION_META[value.targetAction])
), {
  message: "الفعل المستهدف غير معروف",
  path: ["targetAction"],
});

router.get("/metadata", (_req, res) => {
  res.json({
    actions: Object.entries(LOYALTY_ACTION_META).map(([action, meta]) => ({ action, ...meta })),
    tiers: LOYALTY_TIERS,
    audiences: [
      { value: "readers", labelAr: "القراء", descriptionAr: "حسابات القراء خارج فريق سبق" },
      { value: "team", labelAr: "فريق سبق", descriptionAr: "الحسابات الوظيفية ونطاقات سبق" },
      { value: "all", labelAr: "الكل", descriptionAr: "القراء والفريق معاً" },
    ],
  });
});

// ----------------------------------------------------------------------------
// Period parsing — accepts `?period=7d|30d|90d|all`, or explicit
// `?from=YYYY-MM-DD&to=YYYY-MM-DD`. Returns a {from, to} pair where `from` is
// null for "all-time" queries.
// ----------------------------------------------------------------------------

type DateRange = { from: Date | null; to: Date; label: string; period: "7d" | "30d" | "90d" | "all" | "custom" };
type Audience = "readers" | "team" | "all";

const TEAM_USER_SQL = sql`(
  LOWER(COALESCE(u.email, '')) LIKE '%@sabq.org'
  OR LOWER(COALESCE(u.email, '')) LIKE '%@sabq.sa'
  OR LOWER(COALESCE(u.role, 'reader')) NOT IN ('reader', 'user', 'member', 'subscriber')
)`;

function parseAudience(req: Request): Audience {
  const value = String(req.query.audience ?? "readers");
  return value === "all" || value === "team" ? value : "readers";
}

function audienceSql(audience: Audience) {
  const segment = audience === "all"
    ? sql`TRUE`
    : audience === "team"
      ? TEAM_USER_SQL
      : sql`NOT ${TEAM_USER_SQL}`;
  return sql`(${segment}) AND (u.status != 'deleted' OR u.status IS NULL)`;
}

function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function riyadhDate(value: string, endOfDay = false): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const suffix = endOfDay ? "T23:59:59.999+03:00" : "T00:00:00.000+03:00";
  const parsed = new Date(`${value}${suffix}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parsePeriod(req: Request): DateRange {
  const now = new Date();
  if (req.query.from) {
    const from = riyadhDate(String(req.query.from));
    const to = req.query.to ? riyadhDate(String(req.query.to), true) : now;
    if (from && to && from <= to) {
      return { from, to, label: "فترة مخصّصة", period: "custom" };
    }
  }
  const period = String(req.query.period ?? "30d");
  switch (period) {
    case "7d": {
      const from = new Date(now); from.setDate(from.getDate() - 7);
      return { from, to: now, label: "آخر 7 أيام", period: "7d" };
    }
    case "90d": {
      const from = new Date(now); from.setDate(from.getDate() - 90);
      return { from, to: now, label: "آخر 90 يوم", period: "90d" };
    }
    case "all":
      return { from: null, to: now, label: "كل الفترات", period: "all" };
    case "30d":
    default: {
      const from = new Date(now); from.setDate(from.getDate() - 30);
      return { from, to: now, label: "آخر 30 يوم", period: "30d" };
    }
  }
}

function previousRange(current: DateRange): DateRange | null {
  if (!current.from) return null;
  const spanMs = current.to.getTime() - current.from.getTime();
  const to = new Date(current.from);
  const from = new Date(current.from.getTime() - spanMs);
  return { from, to, label: "الفترة السابقة", period: current.period };
}

// ----------------------------------------------------------------------------
// 1. KPI cards
//    Total members, points earned in window, points redeemed in window,
//    avg lifetime points per member. Each value pairs with the previous
//    window's value so the UI can compute a trend arrow.
// ----------------------------------------------------------------------------

router.get("/overview", async (req, res) => {
  try {
    const range = parsePeriod(req);
    const audience = parseAudience(req);
    const audienceFilter = audienceSql(audience);
    const prev = previousRange(range);

    const [totals] = await db.execute<{
      total_members: number;
      avg_points: number;
      lifetime_total: number;
      current_balance: number;
    }>(sql`
      SELECT
        COUNT(*)::int AS total_members,
        COALESCE(AVG(upt.lifetime_points), 0)::int AS avg_points,
        COALESCE(SUM(upt.lifetime_points), 0)::bigint AS lifetime_total,
        COALESCE(SUM(upt.total_points), 0)::bigint AS current_balance
      FROM user_points_total upt
      LEFT JOIN users u ON u.id = upt.user_id
      WHERE ${audienceFilter}
    `).then((r) => r.rows as any[]);

    const earnedNow = await sumEarned(range, audience);
    const earnedPrev = prev ? await sumEarned(prev, audience) : null;
    const spentNow = await sumSpent(range, audience);
    const spentPrev = prev ? await sumSpent(prev, audience) : null;

    const activeMembers = await db.execute<{ count: number }>(sql`
      SELECT COUNT(DISTINCT e.user_id)::int AS count
      FROM user_loyalty_events e
      LEFT JOIN users u ON u.id = e.user_id
      WHERE ${audienceFilter}
        AND e.points > 0
        ${range.from ? sql`AND e.created_at >= ${range.from}` : sql``}
        AND e.created_at <= ${range.to}
    `).then((r) => Number((r.rows as any[])[0]?.count ?? 0));

    // This deliberately measures first participation in loyalty, not account
    // registration. The UI labels it "منضمون للولاء" to keep the definition
    // honest and avoid mixing all registered users with loyalty participants.
    const newLoyaltyMembers = range.from
      ? await db.execute<{ count: number }>(sql`
          SELECT COUNT(*)::int AS count
          FROM user_points_total upt
          LEFT JOIN users u ON u.id = upt.user_id
          WHERE ${audienceFilter}
            AND upt.created_at >= ${range.from}
            AND upt.created_at <= ${range.to}
        `).then((r) => (r.rows as any[])[0]?.count ?? 0)
      : null;

    const [qualityRow] = await db.execute<{
      members_needing_review: number;
      future_events: number;
    }>(sql`
      WITH period_points AS (
        SELECT
          e.user_id,
          COALESCE(SUM(GREATEST(e.points, 0)), 0)::bigint AS positive_points
        FROM user_loyalty_events e
        LEFT JOIN users u ON u.id = e.user_id
        WHERE ${audienceFilter}
          ${range.from ? sql`AND e.created_at >= ${range.from}` : sql``}
          AND e.created_at <= ${range.to}
        GROUP BY e.user_id
      )
      SELECT
        COUNT(*) FILTER (WHERE period_points.positive_points > upt.lifetime_points)::int AS members_needing_review,
        (
          SELECT COUNT(*)::int
          FROM user_loyalty_events future_event
          LEFT JOIN users u ON u.id = future_event.user_id
          WHERE ${audienceFilter}
            AND future_event.created_at > NOW() + INTERVAL '5 minutes'
        ) AS future_events
      FROM period_points
      JOIN user_points_total upt ON upt.user_id = period_points.user_id
    `).then((r) => r.rows as any[]);

    const redemptionRate = earnedNow > 0 ? (spentNow / earnedNow) * 100 : 0;

    res.json({
      range: { from: range.from?.toISOString() ?? null, to: range.to.toISOString(), label: range.label, period: range.period },
      audience,
      quality: {
        membersNeedingReview: Number(qualityRow?.members_needing_review ?? 0),
        futureEvents: Number(qualityRow?.future_events ?? 0),
      },
      kpis: {
        totalMembers: Number(totals?.total_members ?? 0),
        activeMembers,
        newLoyaltyMembersInRange: newLoyaltyMembers,
        pointsEarned: earnedNow,
        pointsEarnedPrev: earnedPrev,
        pointsSpent: spentNow,
        pointsSpentPrev: spentPrev,
        redemptionRate,
        currentBalance: Number(totals?.current_balance ?? 0),
        avgLifetimePerMember: Number(totals?.avg_points ?? 0),
        totalLifetimePoints: Number(totals?.lifetime_total ?? 0),
      },
    });
  } catch (err) {
    console.error("[LoyaltyAdmin] /overview error:", err);
    res.status(500).json({ message: "تعذر جلب الإحصائيات" });
  }
});

async function sumEarned(range: DateRange, audience: Audience = "all"): Promise<number> {
  const audienceFilter = audienceSql(audience);
  const [row] = await db.execute<{ total: number }>(sql`
    SELECT COALESCE(SUM(GREATEST(e.points, 0)), 0)::bigint AS total
    FROM user_loyalty_events e
    LEFT JOIN users u ON u.id = e.user_id
    WHERE ${audienceFilter}
      ${range.from ? sql`AND e.created_at >= ${range.from}` : sql``}
      AND e.created_at <= ${range.to}
  `).then((r) => r.rows as any[]);
  return Number(row?.total ?? 0);
}

async function sumSpent(range: DateRange, audience: Audience = "all"): Promise<number> {
  // user_rewards_history uses `redeemed_at`, NOT `created_at` — discovered
  // 2026-05-20 when the admin overview cards came back empty because this
  // query threw a `column "created_at" does not exist` 500.
  const audienceFilter = audienceSql(audience);
  const [row] = await db.execute<{ total: number }>(sql`
    SELECT COALESCE(SUM(h.points_spent), 0)::bigint AS total
    FROM user_rewards_history h
    LEFT JOIN users u ON u.id = h.user_id
    WHERE h.status IN ('pending', 'delivered')
      AND ${audienceFilter}
      ${range.from ? sql`AND h.redeemed_at >= ${range.from}` : sql``}
      AND h.redeemed_at <= ${range.to}
  `).then((r) => r.rows as any[]);
  return Number(row?.total ?? 0);
}

// ----------------------------------------------------------------------------
// 2. Tier distribution — donut data
// ----------------------------------------------------------------------------

router.get("/tier-distribution", async (req, res) => {
  try {
    const audience = parseAudience(req);
    const audienceFilter = audienceSql(audience);
    // Compute the tier from lifetime_points using the live thresholds in
    // LOYALTY_TIERS, NOT the stored rank_level column. The two diverge
    // for the legacy users that the Phase 1 migration grandfathered to
    // tier 5 ("سفير سبق") regardless of points — see the note in
    // shared/loyalty.ts:67-70. The admin dashboard has to show the
    // truth (the actual threshold-derived tier) so the numbers match
    // the legend's "≥ X نقطة" labels.
    //
    // `grandfathered` reports how many seats each tier currently holds
    // (by stored rank_level) that don't match the threshold-derived
    // tier. We surface it on tier 5 so editors can see the legacy
    // grant transparently.
    const result = await db.execute<{
      live_level: number;
      count: number;
    }>(sql`
      SELECT
        CASE
          WHEN lifetime_points >= 10000 THEN 5
          WHEN lifetime_points >= 2000  THEN 4
          WHEN lifetime_points >= 500   THEN 3
          WHEN lifetime_points >= 100   THEN 2
          ELSE 1
        END AS live_level,
        COUNT(*)::int AS count
      FROM user_points_total upt
      LEFT JOIN users u ON u.id = upt.user_id
      WHERE ${audienceFilter}
      GROUP BY live_level
      ORDER BY live_level
    `).then((r) => r.rows as any[]);

    // Side query: count users whose stored rank_level disagrees with the
    // threshold-derived level (grandfathered grants). Bucketed by their
    // stored level so we can annotate the right segment in the UI.
    const grandfathered = await db.execute<{ stored_level: number; count: number }>(sql`
      SELECT rank_level AS stored_level, COUNT(*)::int AS count
      FROM user_points_total upt
      LEFT JOIN users u ON u.id = upt.user_id
      WHERE ${audienceFilter}
        AND (
        (rank_level = 5 AND lifetime_points < 10000)
        OR (rank_level = 4 AND lifetime_points < 2000)
        OR (rank_level = 3 AND lifetime_points < 500)
        OR (rank_level = 2 AND lifetime_points < 100)
        )
      GROUP BY rank_level
    `).then((r) => r.rows as any[]);

    const total = result.reduce((sum, r) => sum + Number(r.count), 0);

    const tiers = LOYALTY_TIERS.map((tier) => {
      const row = result.find((r) => Number(r.live_level) === tier.level);
      const count = row ? Number(row.count) : 0;
      const grandfathered_count = grandfathered.find(
        (g) => Number(g.stored_level) === tier.level,
      );
      return {
        level: tier.level,
        nameAr: tier.nameAr,
        nameEn: tier.nameEn,
        color: tier.color,
        minLifetimePoints: tier.minLifetimePoints,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
        grandfathered: grandfathered_count ? Number(grandfathered_count.count) : 0,
      };
    });

    res.json({ total, tiers, audience });
  } catch (err) {
    console.error("[LoyaltyAdmin] /tier-distribution error:", err);
    res.status(500).json({ message: "تعذر جلب توزيع المستويات" });
  }
});

// ----------------------------------------------------------------------------
// 3. Time series — daily earned + spent for the line chart
// ----------------------------------------------------------------------------

router.get("/time-series", async (req, res) => {
  try {
    const range = parsePeriod(req);
    const audience = parseAudience(req);
    const audienceFilter = audienceSql(audience);
    let from = range.from;

    if (!from) {
      const [earliest] = await db.execute<{ first_at: string | null }>(sql`
        SELECT MIN(first_at)::text AS first_at
        FROM (
          SELECT MIN(e.created_at) AS first_at
          FROM user_loyalty_events e
          LEFT JOIN users u ON u.id = e.user_id
          WHERE ${audienceFilter}
          UNION ALL
          SELECT MIN(h.redeemed_at) AS first_at
          FROM user_rewards_history h
          LEFT JOIN users u ON u.id = h.user_id
          WHERE ${audienceFilter}
        ) dates
      `).then((r) => r.rows as any[]);
      from = earliest?.first_at ? new Date(earliest.first_at) : new Date(range.to.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const monthly = range.period === "all";
    const earnedBucket = monthly
      ? sql`TO_CHAR(DATE_TRUNC('month', e.created_at AT TIME ZONE 'Asia/Riyadh'), 'YYYY-MM')`
      : sql`DATE(e.created_at AT TIME ZONE 'Asia/Riyadh')::text`;
    const spentBucket = monthly
      ? sql`TO_CHAR(DATE_TRUNC('month', h.redeemed_at AT TIME ZONE 'Asia/Riyadh'), 'YYYY-MM')`
      : sql`DATE(h.redeemed_at AT TIME ZONE 'Asia/Riyadh')::text`;

    const earned = await db.execute<{ day: string; total: number }>(sql`
      SELECT
        ${earnedBucket} AS day,
        COALESCE(SUM(GREATEST(e.points, 0)), 0)::int AS total
      FROM user_loyalty_events e
      LEFT JOIN users u ON u.id = e.user_id
      WHERE ${audienceFilter}
        AND e.points > 0
        AND e.created_at >= ${from}
        AND e.created_at <= ${range.to}
      GROUP BY 1
      ORDER BY 1
    `).then((r) => r.rows as any[]);

    const spent = await db.execute<{ day: string; total: number }>(sql`
      SELECT
        ${spentBucket} AS day,
        COALESCE(SUM(h.points_spent), 0)::int AS total
      FROM user_rewards_history h
      LEFT JOIN users u ON u.id = h.user_id
      WHERE h.status IN ('pending', 'delivered')
        AND ${audienceFilter}
        AND h.redeemed_at >= ${from}
        AND h.redeemed_at <= ${range.to}
      GROUP BY 1
      ORDER BY 1
    `).then((r) => r.rows as any[]);

    // Merge by day so the line chart has a single point per date.
    const map = new Map<string, { day: string; earned: number; spent: number }>();
    for (const row of earned) {
      map.set(row.day, { day: row.day, earned: Number(row.total), spent: 0 });
    }
    for (const row of spent) {
      const existing = map.get(row.day);
      if (existing) existing.spent = Number(row.total);
      else map.set(row.day, { day: row.day, earned: 0, spent: Number(row.total) });
    }
    const series = Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));

    res.json({
      series,
      granularity: monthly ? "month" : "day",
      audience,
      range: { from: from.toISOString(), to: range.to.toISOString(), label: range.label, period: range.period },
    });
  } catch (err) {
    console.error("[LoyaltyAdmin] /time-series error:", err);
    res.status(500).json({ message: "تعذر جلب سلسلة النقاط" });
  }
});

// ----------------------------------------------------------------------------
// 4. Action breakdown — horizontal bar chart of which actions are awarding
//    the most points in the window.
// ----------------------------------------------------------------------------

router.get("/action-breakdown", async (req, res) => {
  try {
    const range = parsePeriod(req);
    const audience = parseAudience(req);
    const audienceFilter = audienceSql(audience);

    const rows = await db.execute<{
      action: string;
      events: number;
      points: number;
      unique_users: number;
    }>(sql`
      SELECT
        e.action,
        COUNT(*)::int AS events,
        COALESCE(SUM(GREATEST(e.points, 0)), 0)::int AS points,
        COUNT(DISTINCT e.user_id)::int AS unique_users
      FROM user_loyalty_events e
      LEFT JOIN users u ON u.id = e.user_id
      WHERE ${audienceFilter}
        AND e.points > 0
        ${range.from ? sql`AND e.created_at >= ${range.from}` : sql``}
        AND e.created_at <= ${range.to}
      GROUP BY e.action
      ORDER BY points DESC
    `).then((r) => r.rows as any[]);

    const totalPoints = rows.reduce((sum, row) => sum + Number(row.points), 0);
    const actions = rows.map((r) => {
      const meta = getLoyaltyActionMeta(r.action);
      const events = Number(r.events);
      const points = Number(r.points);
      return {
        action: r.action,
        labelAr: meta.labelAr,
        icon: meta.icon,
        category: meta.category,
        configuredPointsPerEvent: LOYALTY_ACTION_POINTS[r.action as keyof typeof LOYALTY_ACTION_POINTS] ?? null,
        averagePointsPerEvent: events > 0 ? points / events : 0,
        shareOfPoints: totalPoints > 0 ? (points / totalPoints) * 100 : 0,
        events,
        points,
        uniqueUsers: Number(r.unique_users),
      };
    });

    res.json({
      actions,
      totalPoints,
      audience,
      range: { from: range.from?.toISOString() ?? null, to: range.to.toISOString(), label: range.label, period: range.period },
    });
  } catch (err) {
    console.error("[LoyaltyAdmin] /action-breakdown error:", err);
    res.status(500).json({ message: "تعذر جلب تفصيل الأفعال" });
  }
});

// ----------------------------------------------------------------------------
// 5. Top users — most points earned in the window
// ----------------------------------------------------------------------------

router.get("/top-users", async (req, res) => {
  try {
    const range = parsePeriod(req);
    const audience = parseAudience(req);
    const audienceFilter = audienceSql(audience);
    const limit = boundedInt(req.query.limit, 10, 1, 50);
    const where = range.from
      ? sql`AND e.created_at >= ${range.from}`
      : sql``;

    const rows = await db.execute<{
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      profile_image_url: string | null;
      points_in_range: number;
      actions_in_range: number;
      total_points: number;
      lifetime_points: number;
      rank_level: number;
      current_rank: string;
    }>(sql`
      SELECT
        e.user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.profile_image_url,
        COALESCE(SUM(e.points), 0)::int AS points_in_range,
        COUNT(*)::int AS actions_in_range,
        upt.total_points,
        upt.lifetime_points,
        upt.rank_level,
        upt.current_rank
      FROM user_loyalty_events e
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN user_points_total upt ON upt.user_id = e.user_id
      WHERE (u.status != 'deleted' OR u.status IS NULL)
        AND ${audienceFilter}
        AND e.points > 0
      ${where}
        AND e.created_at <= ${range.to}
      GROUP BY e.user_id, u.first_name, u.last_name, u.email, u.profile_image_url,
               upt.total_points, upt.lifetime_points, upt.rank_level, upt.current_rank
      ORDER BY points_in_range DESC
      LIMIT ${limit}
    `).then((r) => r.rows as any[]);

    // Compute each user's tier from `lifetime_points` against the live
    // LOYALTY_TIERS thresholds — NOT the stored `rank_level` column.
    // The two diverge for ~10 legacy "سفير سبق" users who were
    // grandfathered to level 5 by the Phase 1 migration regardless of
    // their actual points. Showing them as "سفير سبق" on the leader-
    // board next to a current member with the same points contradicts
    // the public tier rules, so the admin view sticks to the truth.
    // The `isGrandfathered` flag preserves the historical fact so the
    // UI can paint a small ✦ next to the badge.
    const tierFromPoints = (points: number) => {
      let current = LOYALTY_TIERS[0];
      for (const t of LOYALTY_TIERS) {
        if (points >= t.minLifetimePoints) current = t;
      }
      return current;
    };

    const users = rows.map((r, i) => {
      const livePoints = Number(r.lifetime_points ?? 0);
      const liveTier = tierFromPoints(livePoints);
      const storedLevel = Number(r.rank_level);
      const isGrandfathered = storedLevel > liveTier.level;
      const pointsInRange = Number(r.points_in_range);
      const displayName = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.email || "مستخدم";
      return {
        rank: i + 1,
        userId: r.user_id,
        name: displayName,
        email: r.email,
        avatar: r.profile_image_url,
        pointsInRange,
        actionsInRange: Number(r.actions_in_range),
        lifetimePoints: livePoints,
        currentBalance: Number(r.total_points ?? 0),
        needsReview: pointsInRange > livePoints,
        isGrandfathered,
        tier: {
          level: liveTier.level,
          nameAr: liveTier.nameAr,
          color: liveTier.color,
        },
      };
    });

    res.json({
      users,
      audience,
      range: { from: range.from?.toISOString() ?? null, to: range.to.toISOString(), label: range.label, period: range.period },
    });
  } catch (err) {
    console.error("[LoyaltyAdmin] /top-users error:", err);
    res.status(500).json({ message: "تعذر جلب أفضل المستخدمين" });
  }
});

// ----------------------------------------------------------------------------
// 5b. Searchable loyalty members directory
// ----------------------------------------------------------------------------

router.get("/members", async (req, res) => {
  try {
    const range = parsePeriod(req);
    const audience = parseAudience(req);
    const audienceFilter = audienceSql(audience);
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 120) : "";
    const action = typeof req.query.action === "string" && req.query.action !== "all"
      ? req.query.action
      : null;
    const tierCandidate = Number(req.query.tier);
    const tier = Number.isInteger(tierCandidate) && tierCandidate >= 1 && tierCandidate <= 5
      ? tierCandidate
      : null;
    const page = boundedInt(req.query.page, 1, 1, 100_000);
    const limit = boundedInt(req.query.limit, 25, 10, 100);
    const offset = (page - 1) * limit;
    const searchPattern = `%${search}%`;

    const searchFilter = search
      ? sql`AND (
          u.email ILIKE ${searchPattern}
          OR COALESCE(u.first_name, '') ILIKE ${searchPattern}
          OR COALESCE(u.last_name, '') ILIKE ${searchPattern}
          OR CONCAT_WS(' ', u.first_name, u.last_name) ILIKE ${searchPattern}
        )`
      : sql``;
    const tierFilter = tier
      ? sql`AND (
          CASE
            WHEN upt.lifetime_points >= 10000 THEN 5
            WHEN upt.lifetime_points >= 2000 THEN 4
            WHEN upt.lifetime_points >= 500 THEN 3
            WHEN upt.lifetime_points >= 100 THEN 2
            ELSE 1
          END
        ) = ${tier}`
      : sql``;
    const actionExistsFilter = action
      ? sql`AND EXISTS (
          SELECT 1
          FROM user_loyalty_events filtered_event
          WHERE filtered_event.user_id = upt.user_id
            AND filtered_event.action = ${action}
            AND filtered_event.points > 0
            ${range.from ? sql`AND filtered_event.created_at >= ${range.from}` : sql``}
            AND filtered_event.created_at <= ${range.to}
        )`
      : sql``;

    const [countRow] = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM user_points_total upt
      LEFT JOIN users u ON u.id = upt.user_id
      WHERE (u.status != 'deleted' OR u.status IS NULL)
        AND ${audienceFilter}
        ${searchFilter}
        ${tierFilter}
        ${actionExistsFilter}
    `).then((r) => r.rows as any[]);

    const rows = await db.execute<{
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      profile_image_url: string | null;
      role: string | null;
      total_points: number;
      lifetime_points: number;
      rank_level: number;
      last_activity_at: string | null;
      points_in_range: number;
      actions_in_range: number;
    }>(sql`
      SELECT
        upt.user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.profile_image_url,
        u.role,
        upt.total_points,
        upt.lifetime_points,
        upt.rank_level,
        upt.last_activity_at,
        COALESCE(stats.points, 0)::int AS points_in_range,
        COALESCE(stats.actions, 0)::int AS actions_in_range
      FROM user_points_total upt
      LEFT JOIN users u ON u.id = upt.user_id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(e.points), 0)::int AS points,
          COUNT(*)::int AS actions
        FROM user_loyalty_events e
        WHERE e.user_id = upt.user_id
          AND e.points > 0
          ${range.from ? sql`AND e.created_at >= ${range.from}` : sql``}
          AND e.created_at <= ${range.to}
          ${action ? sql`AND e.action = ${action}` : sql``}
      ) stats ON TRUE
      WHERE (u.status != 'deleted' OR u.status IS NULL)
        AND ${audienceFilter}
        ${searchFilter}
        ${tierFilter}
        ${actionExistsFilter}
      ORDER BY points_in_range DESC, upt.lifetime_points DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `).then((r) => r.rows as any[]);

    const members = rows.map((row) => {
      const lifetimePoints = Number(row.lifetime_points ?? 0);
      const liveTier = [...LOYALTY_TIERS].reverse().find(
        (candidate) => lifetimePoints >= candidate.minLifetimePoints,
      ) ?? LOYALTY_TIERS[0];
      const pointsInRange = Number(row.points_in_range ?? 0);
      return {
        userId: row.user_id,
        name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.email || "مستخدم",
        email: row.email,
        avatar: row.profile_image_url,
        role: row.role,
        currentBalance: Number(row.total_points ?? 0),
        lifetimePoints,
        pointsInRange,
        actionsInRange: Number(row.actions_in_range ?? 0),
        lastActivityAt: row.last_activity_at,
        needsReview: pointsInRange > lifetimePoints,
        isGrandfathered: Number(row.rank_level) > liveTier.level,
        tier: {
          level: liveTier.level,
          nameAr: liveTier.nameAr,
          color: liveTier.color,
        },
      };
    });

    const total = Number(countRow?.count ?? 0);
    res.json({
      members,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      audience,
      range: { from: range.from?.toISOString() ?? null, to: range.to.toISOString(), label: range.label, period: range.period },
    });
  } catch (err) {
    console.error("[LoyaltyAdmin] /members error:", err);
    res.status(500).json({ message: "تعذر جلب أعضاء الولاء" });
  }
});

// ----------------------------------------------------------------------------
// 6. Rewards performance — redemption count + remaining stock per reward
// ----------------------------------------------------------------------------

router.get("/rewards-performance", async (req, res) => {
  try {
    const range = parsePeriod(req);
    const audience = parseAudience(req);
    const audienceFilter = audienceSql(audience);

    const rows = await db.execute<{
      id: string;
      name_ar: string;
      points_cost: number;
      reward_type: string;
      remaining_stock: number | null;
      stock: number | null;
      is_active: boolean;
      redemptions: number;
      pending_redemptions: number;
      total_points_spent: number;
    }>(sql`
      SELECT
        r.id,
        r.name_ar,
        r.points_cost,
        r.reward_type,
        r.remaining_stock,
        r.stock,
        r.is_active,
        COALESCE(redemption.count, 0)::int AS redemptions,
        COALESCE(redemption.pending_count, 0)::int AS pending_redemptions,
        COALESCE(redemption.total_points, 0)::int AS total_points_spent
      FROM loyalty_rewards r
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE h.status IN ('pending', 'delivered'))::int AS count,
          COUNT(*) FILTER (WHERE h.status = 'pending')::int AS pending_count,
          COALESCE(SUM(h.points_spent) FILTER (WHERE h.status IN ('pending', 'delivered')), 0)::int AS total_points
        FROM user_rewards_history h
        LEFT JOIN users u ON u.id = h.user_id
        WHERE h.reward_id = r.id
        AND ${audienceFilter}
        ${range.from ? sql`AND h.redeemed_at >= ${range.from}` : sql``}
        AND h.redeemed_at <= ${range.to}
      ) redemption ON TRUE
      ORDER BY redemptions DESC, r.points_cost DESC
    `).then((r) => r.rows as any[]);

    res.json({
      rewards: rows.map((r) => ({
        id: r.id,
        nameAr: r.name_ar,
        rewardType: r.reward_type,
        pointsCost: Number(r.points_cost),
        remainingStock: r.remaining_stock,
        totalStock: r.stock,
        isActive: r.is_active,
        redemptions: Number(r.redemptions),
        pendingRedemptions: Number(r.pending_redemptions),
        totalPointsSpent: Number(r.total_points_spent),
        lowStock: r.remaining_stock !== null && r.remaining_stock < 20,
      })),
      audience,
    });
  } catch (err) {
    console.error("[LoyaltyAdmin] /rewards-performance error:", err);
    res.status(500).json({ message: "تعذر جلب أداء المكافآت" });
  }
});

router.post("/rewards", async (req, res) => {
  const parsed = rewardInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "بيانات المكافأة غير مكتملة", issues: parsed.error.flatten() });
  }

  try {
    const input = parsed.data;
    const stock = input.stock ?? null;
    const [reward] = await db.insert(loyaltyRewards).values({
      nameAr: input.nameAr,
      nameEn: input.nameEn,
      description: input.description ?? null,
      pointsCost: input.pointsCost,
      rewardType: input.rewardType,
      stock,
      remainingStock: input.remainingStock ?? stock,
      maxRedemptionsPerUser: input.maxRedemptionsPerUser ?? null,
      isActive: input.isActive ?? true,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    }).returning();
    res.status(201).json({ reward });
  } catch (err) {
    console.error("[LoyaltyAdmin] POST /rewards error:", err);
    res.status(500).json({ message: "تعذر إنشاء المكافأة" });
  }
});

router.patch("/rewards/:id", async (req, res) => {
  const parsed = rewardInputSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "بيانات المكافأة غير صالحة", issues: parsed.error.flatten() });
  }

  try {
    const input = parsed.data;
    const updates: Record<string, unknown> = { ...input };
    if (input.expiresAt !== undefined) {
      updates.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    }
    const [reward] = await db.update(loyaltyRewards)
      .set(updates)
      .where(sql`${loyaltyRewards.id} = ${req.params.id}`)
      .returning();
    if (!reward) return res.status(404).json({ message: "المكافأة غير موجودة" });
    res.json({ reward });
  } catch (err) {
    console.error("[LoyaltyAdmin] PATCH /rewards/:id error:", err);
    res.status(500).json({ message: "تعذر تحديث المكافأة" });
  }
});

// ----------------------------------------------------------------------------
// 7. Loyalty campaigns — operational management + issuance performance
// ----------------------------------------------------------------------------

router.get("/campaigns", async (_req, res) => {
  try {
    const rows = await db.execute<any>(sql`
      SELECT
        c.id,
        c.name_ar,
        c.name_en,
        c.description,
        c.campaign_type,
        c.target_action,
        c.multiplier,
        c.bonus_points,
        c.is_active,
        c.start_at,
        c.end_at,
        COUNT(e.id)::int AS events,
        COUNT(DISTINCT e.user_id)::int AS unique_users,
        COALESCE(SUM(e.points), 0)::bigint AS awarded_points
      FROM loyalty_campaigns c
      LEFT JOIN user_loyalty_events e ON e.campaign_id = c.id
      GROUP BY c.id
      ORDER BY c.start_at DESC
    `).then((r) => r.rows as any[]);
    const now = Date.now();
    res.json({
      campaigns: rows.map((row) => {
        const startAt = new Date(row.start_at);
        const endAt = new Date(row.end_at);
        const status = !row.is_active
          ? "paused"
          : startAt.getTime() > now
            ? "upcoming"
            : endAt.getTime() < now
              ? "ended"
              : "active";
        return {
          id: row.id,
          nameAr: row.name_ar,
          nameEn: row.name_en,
          description: row.description,
          campaignType: row.campaign_type,
          targetAction: row.target_action,
          targetActionLabel: row.target_action ? getLoyaltyActionMeta(row.target_action).labelAr : "كل الأفعال",
          multiplier: Number(row.multiplier ?? 1),
          bonusPoints: Number(row.bonus_points ?? 0),
          isActive: row.is_active,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          status,
          events: Number(row.events ?? 0),
          uniqueUsers: Number(row.unique_users ?? 0),
          awardedPoints: Number(row.awarded_points ?? 0),
        };
      }),
    });
  } catch (err) {
    console.error("[LoyaltyAdmin] GET /campaigns error:", err);
    res.status(500).json({ message: "تعذر جلب حملات الولاء" });
  }
});

router.post("/campaigns", async (req, res) => {
  const parsed = campaignInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "بيانات الحملة غير مكتملة", issues: parsed.error.flatten() });
  }

  try {
    const input = parsed.data;
    const [campaign] = await db.insert(loyaltyCampaigns).values({
      nameAr: input.nameAr,
      nameEn: input.nameEn,
      description: input.description ?? null,
      campaignType: input.campaignType,
      targetAction: input.targetAction || null,
      multiplier: input.multiplier ?? 1,
      bonusPoints: input.bonusPoints ?? 0,
      isActive: input.isActive ?? true,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
    }).returning();
    res.status(201).json({ campaign });
  } catch (err) {
    console.error("[LoyaltyAdmin] POST /campaigns error:", err);
    res.status(500).json({ message: "تعذر إنشاء الحملة" });
  }
});

router.patch("/campaigns/:id", async (req, res) => {
  const toggleOnly = z.object({ isActive: z.boolean() }).safeParse(req.body);
  if (!toggleOnly.success) {
    return res.status(400).json({ message: "يمكن تحديث حالة الحملة فقط من هذه الشاشة" });
  }

  try {
    const [campaign] = await db.update(loyaltyCampaigns)
      .set({ isActive: toggleOnly.data.isActive })
      .where(sql`${loyaltyCampaigns.id} = ${req.params.id}`)
      .returning();
    if (!campaign) return res.status(404).json({ message: "الحملة غير موجودة" });
    res.json({ campaign });
  } catch (err) {
    console.error("[LoyaltyAdmin] PATCH /campaigns/:id error:", err);
    res.status(500).json({ message: "تعذر تحديث الحملة" });
  }
});

// ----------------------------------------------------------------------------
// 8. Recent activity — latest loyalty events (admins can spot anomalies)
// ----------------------------------------------------------------------------

router.get("/recent-activity", async (req, res) => {
  try {
    const audience = parseAudience(req);
    const audienceFilter = audienceSql(audience);
    const action = typeof req.query.action === "string" && req.query.action !== "all"
      ? req.query.action
      : null;
    const limit = boundedInt(req.query.limit, 40, 1, 100);
    const rows = await db.execute<{
      id: string;
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      action: string;
      points: number;
      source: string | null;
      created_at: string;
    }>(sql`
      SELECT
        e.id, e.user_id, e.action, e.points, e.source, e.created_at,
        u.first_name, u.last_name
      FROM user_loyalty_events e
      LEFT JOIN users u ON u.id = e.user_id
      WHERE ${audienceFilter}
        ${action ? sql`AND e.action = ${action}` : sql``}
      ORDER BY e.created_at DESC
      LIMIT ${limit}
    `).then((r) => r.rows as any[]);

    res.json({
      events: rows.map((r) => {
        const meta = getLoyaltyActionMeta(r.action);
        return {
          id: r.id,
          userId: r.user_id,
          userName: [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || "مستخدم",
          action: r.action,
          actionLabel: meta.labelAr,
          actionIcon: meta.icon,
          source: r.source,
          points: Number(r.points),
          createdAt: r.created_at,
        };
      }),
      audience,
    });
  } catch (err) {
    console.error("[LoyaltyAdmin] /recent-activity error:", err);
    res.status(500).json({ message: "تعذر جلب النشاط الأخير" });
  }
});

// ----------------------------------------------------------------------------
// 8. Excel export — full snapshot in one .xlsx (multiple sheets)
// ----------------------------------------------------------------------------

router.get("/export", async (req, res) => {
  try {
    const range = parsePeriod(req);
    const audience = parseAudience(req);
    const audienceFilter = audienceSql(audience);
    const wb = new ExcelJS.Workbook();
    wb.creator = "Sabq Loyalty Admin";
    wb.created = new Date();

    // --- Sheet 1: KPI snapshot
    const kpiSheet = wb.addWorksheet("نظرة عامة");
    kpiSheet.views = [{ rightToLeft: true }];
    kpiSheet.columns = [
      { header: "المؤشر", key: "label", width: 30 },
      { header: "القيمة", key: "value", width: 20 },
    ];
    const overview = await db.execute<{
      total_members: number;
      avg_points: number;
      lifetime_total: number;
    }>(sql`
      SELECT
        COUNT(*)::int AS total_members,
        COALESCE(AVG(lifetime_points), 0)::int AS avg_points,
        COALESCE(SUM(lifetime_points), 0)::bigint AS lifetime_total
      FROM user_points_total upt
      LEFT JOIN users u ON u.id = upt.user_id
      WHERE ${audienceFilter}
    `).then((r) => (r.rows as any[])[0]);
    const earned = await sumEarned(range, audience);
    const spent = await sumSpent(range, audience);
    kpiSheet.addRow({ label: "إجمالي الأعضاء", value: Number(overview?.total_members ?? 0) });
    kpiSheet.addRow({ label: `نقاط مكتسبة (${range.label})`, value: earned });
    kpiSheet.addRow({ label: `نقاط مستبدلة (${range.label})`, value: spent });
    kpiSheet.addRow({ label: "متوسط النقاط/عضو", value: Number(overview?.avg_points ?? 0) });
    kpiSheet.addRow({ label: "إجمالي النقاط مدى الحياة", value: Number(overview?.lifetime_total ?? 0) });
    kpiSheet.getRow(1).font = { bold: true };

    // --- Sheet 2: Tier distribution
    const tierSheet = wb.addWorksheet("توزيع المستويات");
    tierSheet.views = [{ rightToLeft: true }];
    tierSheet.columns = [
      { header: "المستوى", key: "name", width: 25 },
      { header: "الحد الأدنى للنقاط", key: "min", width: 20 },
      { header: "عدد الأعضاء", key: "count", width: 15 },
    ];
    const tierRows = await db.execute<{ live_level: number; count: number }>(sql`
      SELECT
        CASE
          WHEN upt.lifetime_points >= 10000 THEN 5
          WHEN upt.lifetime_points >= 2000 THEN 4
          WHEN upt.lifetime_points >= 500 THEN 3
          WHEN upt.lifetime_points >= 100 THEN 2
          ELSE 1
        END AS live_level,
        COUNT(*)::int AS count
      FROM user_points_total upt
      LEFT JOIN users u ON u.id = upt.user_id
      WHERE ${audienceFilter}
      GROUP BY 1
      ORDER BY 1
    `).then((r) => r.rows as any[]);
    for (const tier of LOYALTY_TIERS) {
      const row = tierRows.find((r) => Number(r.live_level) === tier.level);
      tierSheet.addRow({
        name: `${tier.nameAr} (المستوى ${tier.level})`,
        min: tier.minLifetimePoints,
        count: row ? Number(row.count) : 0,
      });
    }
    tierSheet.getRow(1).font = { bold: true };

    // --- Sheet 3: Top 50 users
    const topSheet = wb.addWorksheet("الأكثر نشاطاً");
    topSheet.views = [{ rightToLeft: true }];
    topSheet.columns = [
      { header: "الترتيب", key: "rank", width: 10 },
      { header: "الاسم", key: "name", width: 30 },
      { header: "البريد", key: "email", width: 30 },
      { header: "المستوى", key: "tier", width: 20 },
      { header: "نقاط الفترة", key: "points", width: 15 },
      { header: "إجمالي مدى الحياة", key: "lifetime", width: 20 },
      { header: "عدد الأفعال", key: "actions", width: 15 },
    ];
    const topRows = await db.execute<any>(sql`
      SELECT
        e.user_id, u.first_name, u.last_name, u.email,
        COALESCE(SUM(e.points), 0)::int AS points_in_range,
        COUNT(*)::int AS actions_in_range,
        upt.lifetime_points, upt.rank_level
      FROM user_loyalty_events e
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN user_points_total upt ON upt.user_id = e.user_id
      WHERE ${audienceFilter}
        AND (u.status != 'deleted' OR u.status IS NULL)
        AND e.points > 0
        ${range.from ? sql`AND e.created_at >= ${range.from}` : sql``}
        AND e.created_at <= ${range.to}
      GROUP BY e.user_id, u.first_name, u.last_name, u.email, upt.lifetime_points, upt.rank_level
      ORDER BY points_in_range DESC LIMIT 50
    `).then((r) => r.rows as any[]);
    topRows.forEach((r, i) => {
      const lifetime = Number(r.lifetime_points ?? 0);
      const tier = [...LOYALTY_TIERS].reverse().find((t) => lifetime >= t.minLifetimePoints) ?? LOYALTY_TIERS[0];
      topSheet.addRow({
        rank: i + 1,
        name: [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || "—",
        email: r.email ?? "—",
        tier: tier.nameAr,
        points: Number(r.points_in_range),
        lifetime,
        actions: Number(r.actions_in_range),
      });
    });
    topSheet.getRow(1).font = { bold: true };

    // --- Sheet 4: Rewards
    const rewardsSheet = wb.addWorksheet("المكافآت");
    rewardsSheet.views = [{ rightToLeft: true }];
    rewardsSheet.columns = [
      { header: "المكافأة", key: "name", width: 30 },
      { header: "النوع", key: "type", width: 20 },
      { header: "التكلفة (نقاط)", key: "cost", width: 15 },
      { header: "عدد الاستبدالات", key: "redemptions", width: 18 },
      { header: "النقاط المصروفة", key: "points", width: 18 },
      { header: "المخزون المتبقي", key: "stock", width: 18 },
      { header: "الحالة", key: "status", width: 12 },
    ];
    const rewardRows = await db.execute<any>(sql`
      SELECT
        r.id, r.name_ar, r.reward_type, r.points_cost, r.remaining_stock, r.is_active,
        COALESCE(redemption.count, 0)::int AS redemptions,
        COALESCE(redemption.total_points, 0)::int AS total_points_spent
      FROM loyalty_rewards r
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS count, COALESCE(SUM(points_spent), 0)::int AS total_points
        FROM user_rewards_history h
        LEFT JOIN users u ON u.id = h.user_id
        WHERE h.reward_id = r.id
          AND h.status IN ('pending', 'delivered')
          AND ${audienceFilter}
        ${range.from ? sql`AND h.redeemed_at >= ${range.from}` : sql``}
        AND h.redeemed_at <= ${range.to}
      ) redemption ON TRUE
      ORDER BY redemptions DESC
    `).then((r) => r.rows as any[]);
    rewardRows.forEach((r) => {
      rewardsSheet.addRow({
        name: r.name_ar,
        type: r.reward_type,
        cost: Number(r.points_cost),
        redemptions: Number(r.redemptions),
        points: Number(r.total_points_spent),
        stock: r.remaining_stock ?? "∞",
        status: r.is_active ? "نشطة" : "موقوفة",
      });
    });
    rewardsSheet.getRow(1).font = { bold: true };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="loyalty-admin-${range.label}-${Date.now()}.xlsx"`,
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("[LoyaltyAdmin] /export error:", err);
    res.status(500).json({ message: "تعذر إنشاء التقرير" });
  }
});

export default router;
