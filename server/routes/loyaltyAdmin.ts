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
//   - user_rewards_history        — redemption log (status='delivered' counts as spent)
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
  users,
} from "@shared/schema";
import { LOYALTY_TIERS, LOYALTY_ACTION_POINTS } from "@shared/loyalty";
import { SUPERUSER_ROLE_NAMES } from "@shared/rbac-constants";
import { isAuthenticated } from "../auth";
import { sql, and, gte, lte, eq, desc, inArray } from "drizzle-orm";
import ExcelJS from "exceljs";

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

// ----------------------------------------------------------------------------
// Period parsing — accepts `?period=7d|30d|90d|all`, or explicit
// `?from=YYYY-MM-DD&to=YYYY-MM-DD`. Returns a {from, to} pair where `from` is
// null for "all-time" queries.
// ----------------------------------------------------------------------------

type DateRange = { from: Date | null; to: Date; label: string };

function parsePeriod(req: Request): DateRange {
  const now = new Date();
  if (req.query.from) {
    const from = new Date(String(req.query.from));
    const to = req.query.to ? new Date(String(req.query.to)) : now;
    if (!isNaN(from.getTime())) {
      return { from, to, label: "مخصّصة" };
    }
  }
  const period = String(req.query.period ?? "30d");
  switch (period) {
    case "7d": {
      const from = new Date(now); from.setDate(from.getDate() - 7);
      return { from, to: now, label: "آخر 7 أيام" };
    }
    case "90d": {
      const from = new Date(now); from.setDate(from.getDate() - 90);
      return { from, to: now, label: "آخر 90 يوم" };
    }
    case "all":
      return { from: null, to: now, label: "كل الفترات" };
    case "30d":
    default: {
      const from = new Date(now); from.setDate(from.getDate() - 30);
      return { from, to: now, label: "آخر 30 يوم" };
    }
  }
}

function previousRange(current: DateRange): DateRange | null {
  if (!current.from) return null;
  const spanMs = current.to.getTime() - current.from.getTime();
  const to = new Date(current.from);
  const from = new Date(current.from.getTime() - spanMs);
  return { from, to, label: "الفترة السابقة" };
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
    const prev = previousRange(range);

    const [totals] = await db.execute<{
      total_members: number;
      avg_points: number;
      lifetime_total: number;
    }>(sql`
      SELECT
        COUNT(*)::int AS total_members,
        COALESCE(AVG(lifetime_points), 0)::int AS avg_points,
        COALESCE(SUM(lifetime_points), 0)::bigint AS lifetime_total
      FROM user_points_total
    `).then((r) => r.rows as any[]);

    const earnedNow = await sumEarned(range);
    const earnedPrev = prev ? await sumEarned(prev) : null;
    const spentNow = await sumSpent(range);
    const spentPrev = prev ? await sumSpent(prev) : null;

    // New members added in this window — joins `users.created_at` since
    // user_points_total.created_at only exists after the first awarded
    // action. We approximate by the points row creation; for an exact
    // signup count we'd need users.createdAt.
    const newMembers = range.from
      ? await db.execute<{ count: number }>(sql`
          SELECT COUNT(*)::int AS count
          FROM user_points_total
          WHERE created_at >= ${range.from} AND created_at <= ${range.to}
        `).then((r) => (r.rows as any[])[0]?.count ?? 0)
      : null;

    res.json({
      range: { from: range.from?.toISOString() ?? null, to: range.to.toISOString(), label: range.label },
      kpis: {
        totalMembers: Number(totals?.total_members ?? 0),
        newMembersInRange: newMembers,
        pointsEarned: earnedNow,
        pointsEarnedPrev: earnedPrev,
        pointsSpent: spentNow,
        pointsSpentPrev: spentPrev,
        avgLifetimePerMember: Number(totals?.avg_points ?? 0),
        totalLifetimePoints: Number(totals?.lifetime_total ?? 0),
      },
    });
  } catch (err) {
    console.error("[LoyaltyAdmin] /overview error:", err);
    res.status(500).json({ message: "تعذر جلب الإحصائيات" });
  }
});

async function sumEarned(range: DateRange): Promise<number> {
  const where = range.from
    ? sql`WHERE created_at >= ${range.from} AND created_at <= ${range.to}`
    : sql``;
  const [row] = await db.execute<{ total: number }>(sql`
    SELECT COALESCE(SUM(points), 0)::bigint AS total
    FROM user_loyalty_events
    ${where}
  `).then((r) => r.rows as any[]);
  return Number(row?.total ?? 0);
}

async function sumSpent(range: DateRange): Promise<number> {
  const where = range.from
    ? sql`AND created_at >= ${range.from} AND created_at <= ${range.to}`
    : sql``;
  const [row] = await db.execute<{ total: number }>(sql`
    SELECT COALESCE(SUM(points_spent), 0)::bigint AS total
    FROM user_rewards_history
    WHERE status = 'delivered'
    ${where}
  `).then((r) => r.rows as any[]);
  return Number(row?.total ?? 0);
}

// ----------------------------------------------------------------------------
// 2. Tier distribution — donut data
// ----------------------------------------------------------------------------

router.get("/tier-distribution", async (req, res) => {
  try {
    const result = await db.execute<{ rank_level: number; count: number }>(sql`
      SELECT rank_level, COUNT(*)::int AS count
      FROM user_points_total
      GROUP BY rank_level
      ORDER BY rank_level
    `).then((r) => r.rows as any[]);

    const total = result.reduce((sum, r) => sum + Number(r.count), 0);

    // Fold in tiers that exist in LOYALTY_TIERS but have 0 users so the
    // donut always shows the full 5-segment legend.
    const tiers = LOYALTY_TIERS.map((tier) => {
      const row = result.find((r) => Number(r.rank_level) === tier.level);
      const count = row ? Number(row.count) : 0;
      return {
        level: tier.level,
        nameAr: tier.nameAr,
        nameEn: tier.nameEn,
        color: tier.color,
        minLifetimePoints: tier.minLifetimePoints,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      };
    });

    res.json({ total, tiers });
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
    const from = range.from ?? new Date(range.to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const earned = await db.execute<{ day: string; total: number }>(sql`
      SELECT
        DATE(created_at AT TIME ZONE 'Asia/Riyadh')::text AS day,
        COALESCE(SUM(points), 0)::int AS total
      FROM user_loyalty_events
      WHERE created_at >= ${from} AND created_at <= ${range.to}
      GROUP BY day
      ORDER BY day
    `).then((r) => r.rows as any[]);

    const spent = await db.execute<{ day: string; total: number }>(sql`
      SELECT
        DATE(created_at AT TIME ZONE 'Asia/Riyadh')::text AS day,
        COALESCE(SUM(points_spent), 0)::int AS total
      FROM user_rewards_history
      WHERE status = 'delivered'
        AND created_at >= ${from} AND created_at <= ${range.to}
      GROUP BY day
      ORDER BY day
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

    res.json({ series, range: { from: from.toISOString(), to: range.to.toISOString(), label: range.label } });
  } catch (err) {
    console.error("[LoyaltyAdmin] /time-series error:", err);
    res.status(500).json({ message: "تعذر جلب سلسلة النقاط" });
  }
});

// ----------------------------------------------------------------------------
// 4. Action breakdown — horizontal bar chart of which actions are awarding
//    the most points in the window.
// ----------------------------------------------------------------------------

const ACTION_LABELS_AR: Record<string, string> = {
  READ: "قراءة",
  READ_DEEP: "قراءة عميقة",
  LIKE: "إعجاب",
  SHARE: "مشاركة",
  COMMENT: "تعليق",
  NOTIFICATION_OPEN: "فتح إشعار",
  DAILY_LOGIN: "دخول يومي",
};

const ACTION_ICONS: Record<string, string> = {
  READ: "📖",
  READ_DEEP: "📕",
  LIKE: "❤️",
  SHARE: "🔄",
  COMMENT: "💬",
  NOTIFICATION_OPEN: "🔔",
  DAILY_LOGIN: "🚪",
};

router.get("/action-breakdown", async (req, res) => {
  try {
    const range = parsePeriod(req);
    const where = range.from
      ? sql`WHERE created_at >= ${range.from} AND created_at <= ${range.to}`
      : sql``;

    const rows = await db.execute<{
      action: string;
      events: number;
      points: number;
      unique_users: number;
    }>(sql`
      SELECT
        action,
        COUNT(*)::int AS events,
        COALESCE(SUM(points), 0)::int AS points,
        COUNT(DISTINCT user_id)::int AS unique_users
      FROM user_loyalty_events
      ${where}
      GROUP BY action
      ORDER BY points DESC
    `).then((r) => r.rows as any[]);

    const actions = rows.map((r) => ({
      action: r.action,
      labelAr: ACTION_LABELS_AR[r.action] ?? r.action,
      icon: ACTION_ICONS[r.action] ?? "•",
      pointsPerEvent: LOYALTY_ACTION_POINTS[r.action as keyof typeof LOYALTY_ACTION_POINTS] ?? null,
      events: Number(r.events),
      points: Number(r.points),
      uniqueUsers: Number(r.unique_users),
    }));

    res.json({ actions, range: { from: range.from?.toISOString() ?? null, to: range.to.toISOString(), label: range.label } });
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
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 10)));
    const where = range.from
      ? sql`AND e.created_at >= ${range.from} AND e.created_at <= ${range.to}`
      : sql``;

    const rows = await db.execute<{
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      profile_image_url: string | null;
      points_in_range: number;
      actions_in_range: number;
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
        upt.lifetime_points,
        upt.rank_level,
        upt.current_rank
      FROM user_loyalty_events e
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN user_points_total upt ON upt.user_id = e.user_id
      WHERE u.status != 'deleted' OR u.status IS NULL
      ${where}
      GROUP BY e.user_id, u.first_name, u.last_name, u.email, u.profile_image_url,
               upt.lifetime_points, upt.rank_level, upt.current_rank
      ORDER BY points_in_range DESC
      LIMIT ${limit}
    `).then((r) => r.rows as any[]);

    const users = rows.map((r, i) => {
      const tier = LOYALTY_TIERS.find((t) => t.level === Number(r.rank_level)) ?? LOYALTY_TIERS[0];
      const displayName = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.email || "مستخدم";
      return {
        rank: i + 1,
        userId: r.user_id,
        name: displayName,
        email: r.email,
        avatar: r.profile_image_url,
        pointsInRange: Number(r.points_in_range),
        actionsInRange: Number(r.actions_in_range),
        lifetimePoints: Number(r.lifetime_points ?? 0),
        tier: {
          level: tier.level,
          nameAr: tier.nameAr,
          color: tier.color,
        },
      };
    });

    res.json({ users, range: { from: range.from?.toISOString() ?? null, to: range.to.toISOString(), label: range.label } });
  } catch (err) {
    console.error("[LoyaltyAdmin] /top-users error:", err);
    res.status(500).json({ message: "تعذر جلب أفضل المستخدمين" });
  }
});

// ----------------------------------------------------------------------------
// 6. Rewards performance — redemption count + remaining stock per reward
// ----------------------------------------------------------------------------

router.get("/rewards-performance", async (req, res) => {
  try {
    const range = parsePeriod(req);
    const where = range.from
      ? sql`AND h.created_at >= ${range.from} AND h.created_at <= ${range.to}`
      : sql``;

    const rows = await db.execute<{
      id: string;
      name_ar: string;
      points_cost: number;
      reward_type: string;
      remaining_stock: number | null;
      stock: number | null;
      is_active: boolean;
      redemptions: number;
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
        COALESCE(redemption.total_points, 0)::int AS total_points_spent
      FROM loyalty_rewards r
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS count, COALESCE(SUM(points_spent), 0)::int AS total_points
        FROM user_rewards_history h
        WHERE h.reward_id = r.id AND h.status = 'delivered'
        ${where}
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
        totalPointsSpent: Number(r.total_points_spent),
        lowStock: r.remaining_stock !== null && r.remaining_stock < 20,
      })),
    });
  } catch (err) {
    console.error("[LoyaltyAdmin] /rewards-performance error:", err);
    res.status(500).json({ message: "تعذر جلب أداء المكافآت" });
  }
});

// ----------------------------------------------------------------------------
// 7. Recent activity — last 20 loyalty events (writers can spot anomalies)
// ----------------------------------------------------------------------------

router.get("/recent-activity", async (_req, res) => {
  try {
    const rows = await db.execute<{
      id: string;
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      action: string;
      points: number;
      created_at: string;
    }>(sql`
      SELECT
        e.id, e.user_id, e.action, e.points, e.created_at,
        u.first_name, u.last_name
      FROM user_loyalty_events e
      LEFT JOIN users u ON u.id = e.user_id
      ORDER BY e.created_at DESC
      LIMIT 20
    `).then((r) => r.rows as any[]);

    res.json({
      events: rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        userName: [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || "مستخدم",
        action: r.action,
        actionLabel: ACTION_LABELS_AR[r.action] ?? r.action,
        actionIcon: ACTION_ICONS[r.action] ?? "•",
        points: Number(r.points),
        createdAt: r.created_at,
      })),
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
      FROM user_points_total
    `).then((r) => (r.rows as any[])[0]);
    const earned = await sumEarned(range);
    const spent = await sumSpent(range);
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
    const tierRows = await db.execute<{ rank_level: number; count: number }>(sql`
      SELECT rank_level, COUNT(*)::int AS count
      FROM user_points_total GROUP BY rank_level ORDER BY rank_level
    `).then((r) => r.rows as any[]);
    for (const tier of LOYALTY_TIERS) {
      const row = tierRows.find((r) => Number(r.rank_level) === tier.level);
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
      ${range.from ? sql`WHERE e.created_at >= ${range.from} AND e.created_at <= ${range.to}` : sql``}
      GROUP BY e.user_id, u.first_name, u.last_name, u.email, upt.lifetime_points, upt.rank_level
      ORDER BY points_in_range DESC LIMIT 50
    `).then((r) => r.rows as any[]);
    topRows.forEach((r, i) => {
      const tier = LOYALTY_TIERS.find((t) => t.level === Number(r.rank_level)) ?? LOYALTY_TIERS[0];
      topSheet.addRow({
        rank: i + 1,
        name: [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || "—",
        email: r.email ?? "—",
        tier: tier.nameAr,
        points: Number(r.points_in_range),
        lifetime: Number(r.lifetime_points ?? 0),
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
        WHERE h.reward_id = r.id AND h.status = 'delivered'
        ${range.from ? sql`AND h.created_at >= ${range.from} AND h.created_at <= ${range.to}` : sql``}
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
