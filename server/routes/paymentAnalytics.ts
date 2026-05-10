import { Router, Request, Response } from "express";
import { db } from "../db";
import { 
  articlePurchases, 
  tapPayments,
  advertiserTransactions,
  advertiserWallets,
  paymentDailySummary,
  paymentAlerts,
  paymentExportLogs,
  users,
} from "@shared/schema";
import { eq, and, gte, lte, sql, desc, asc, count, sum, between } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// Middleware: Admin only
const requireAdmin = (req: Request, res: Response, next: Function) => {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.status(401).json({ success: false, error: "غير مصرح" });
  }
  const user = req.user as any;
  if (!["admin", "super_admin", "owner"].includes(user.role)) {
    return res.status(403).json({ success: false, error: "صلاحيات غير كافية" });
  }
  next();
};

router.use(requireAdmin);

// =====================================================
// GET /summary - ملخص شامل للمدفوعات
// =====================================================
router.get("/summary", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, period = "today" } = req.query;
    
    let start: Date, end: Date;
    const now = new Date();
    
    if (startDate && endDate) {
      start = new Date(startDate as string);
      end = new Date(endDate as string);
    } else {
      switch (period) {
        case "today":
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          end = now;
          break;
        case "week":
          start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          end = now;
          break;
        case "month":
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = now;
          break;
        case "year":
          start = new Date(now.getFullYear(), 0, 1);
          end = now;
          break;
        default:
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          end = now;
      }
    }
    
    // Article payments stats
    const articleStats = await db
      .select({
        total: count(),
        successful: sql<number>`COUNT(*) FILTER (WHERE ${articlePurchases.status} = 'completed')`,
        failed: sql<number>`COUNT(*) FILTER (WHERE ${articlePurchases.status} = 'failed')`,
        pending: sql<number>`COUNT(*) FILTER (WHERE ${articlePurchases.status} = 'pending')`,
        revenue: sql<number>`COALESCE(SUM(CASE WHEN ${articlePurchases.status} = 'completed' THEN ${articlePurchases.priceHalalas} ELSE 0 END), 0)`,
      })
      .from(articlePurchases)
      .where(and(
        gte(articlePurchases.createdAt, start),
        lte(articlePurchases.createdAt, end)
      ));
    
    // Advertiser payments stats
    const advertiserStats = await db
      .select({
        total: count(),
        successful: sql<number>`COUNT(*) FILTER (WHERE ${advertiserTransactions.type} = 'deposit' AND ${advertiserTransactions.status} = 'completed')`,
        failed: sql<number>`COUNT(*) FILTER (WHERE ${advertiserTransactions.type} = 'deposit' AND ${advertiserTransactions.status} = 'failed')`,
        pending: sql<number>`COUNT(*) FILTER (WHERE ${advertiserTransactions.type} = 'deposit' AND ${advertiserTransactions.status} = 'pending')`,
        revenue: sql<number>`COALESCE(SUM(CASE WHEN ${advertiserTransactions.type} = 'deposit' AND ${advertiserTransactions.status} = 'completed' THEN ${advertiserTransactions.amountHalalas} ELSE 0 END), 0)`,
      })
      .from(advertiserTransactions)
      .where(and(
        gte(advertiserTransactions.createdAt, start),
        lte(advertiserTransactions.createdAt, end)
      ));
    
    const article = articleStats[0] || { total: 0, successful: 0, failed: 0, pending: 0, revenue: 0 };
    const advertiser = advertiserStats[0] || { total: 0, successful: 0, failed: 0, pending: 0, revenue: 0 };
    
    const totalPayments = Number(article.total) + Number(advertiser.total);
    const totalSuccessful = Number(article.successful) + Number(advertiser.successful);
    const totalRevenue = Number(article.revenue) + Number(advertiser.revenue);
    const successRate = totalPayments > 0 ? (totalSuccessful / totalPayments) * 100 : 0;
    
    // Calculate daily average
    const daysDiff = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const dailyAverageRevenue = totalRevenue / daysDiff;
    
    res.json({
      success: true,
      data: {
        period: { start, end, days: daysDiff },
        article: {
          total: Number(article.total),
          successful: Number(article.successful),
          failed: Number(article.failed),
          pending: Number(article.pending),
          revenueHalalas: Number(article.revenue),
          revenueSAR: (Number(article.revenue) / 100).toFixed(2),
        },
        advertiser: {
          total: Number(advertiser.total),
          successful: Number(advertiser.successful),
          failed: Number(advertiser.failed),
          pending: Number(advertiser.pending),
          revenueHalalas: Number(advertiser.revenue),
          revenueSAR: (Number(advertiser.revenue) / 100).toFixed(2),
        },
        combined: {
          totalPayments,
          totalSuccessful,
          totalFailed: Number(article.failed) + Number(advertiser.failed),
          totalPending: Number(article.pending) + Number(advertiser.pending),
          totalRevenueHalalas: totalRevenue,
          totalRevenueSAR: (totalRevenue / 100).toFixed(2),
          successRate: successRate.toFixed(1),
          dailyAverageHalalas: Math.round(dailyAverageRevenue),
          dailyAverageSAR: (dailyAverageRevenue / 100).toFixed(2),
        },
      },
    });
  } catch (error: any) {
    console.error("[Payment Analytics] Error fetching summary:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// GET /trends - اتجاهات المدفوعات اليومية
// =====================================================
router.get("/trends", async (req: Request, res: Response) => {
  try {
    const { days = "30", type = "all" } = req.query;
    const daysCount = parseInt(days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysCount);
    
    // Article trends by day
    const articleTrends = type !== "advertiser" ? await db
      .select({
        date: sql<string>`DATE(${articlePurchases.createdAt})`.as("date"),
        count: count(),
        revenue: sql<number>`COALESCE(SUM(CASE WHEN ${articlePurchases.status} = 'completed' THEN ${articlePurchases.priceHalalas} ELSE 0 END), 0)`,
        successful: sql<number>`COUNT(*) FILTER (WHERE ${articlePurchases.status} = 'completed')`,
      })
      .from(articlePurchases)
      .where(gte(articlePurchases.createdAt, startDate))
      .groupBy(sql`DATE(${articlePurchases.createdAt})`)
      .orderBy(sql`DATE(${articlePurchases.createdAt})`) : [];
    
    // Advertiser trends by day  
    const advertiserTrends = type !== "article" ? await db
      .select({
        date: sql<string>`DATE(${advertiserTransactions.createdAt})`.as("date"),
        count: count(),
        revenue: sql<number>`COALESCE(SUM(CASE WHEN ${advertiserTransactions.type} = 'deposit' AND ${advertiserTransactions.status} = 'completed' THEN ${advertiserTransactions.amountHalalas} ELSE 0 END), 0)`,
        successful: sql<number>`COUNT(*) FILTER (WHERE ${advertiserTransactions.type} = 'deposit' AND ${advertiserTransactions.status} = 'completed')`,
      })
      .from(advertiserTransactions)
      .where(gte(advertiserTransactions.createdAt, startDate))
      .groupBy(sql`DATE(${advertiserTransactions.createdAt})`)
      .orderBy(sql`DATE(${advertiserTransactions.createdAt})`) : [];
    
    // Merge trends by date
    const trendsMap = new Map<string, { date: string; articleCount: number; articleRevenue: number; advertiserCount: number; advertiserRevenue: number; totalRevenue: number }>();
    
    articleTrends.forEach((t: any) => {
      const key = t.date;
      trendsMap.set(key, {
        date: key,
        articleCount: Number(t.count),
        articleRevenue: Number(t.revenue),
        advertiserCount: 0,
        advertiserRevenue: 0,
        totalRevenue: Number(t.revenue),
      });
    });
    
    advertiserTrends.forEach((t: any) => {
      const key = t.date;
      const existing = trendsMap.get(key);
      if (existing) {
        existing.advertiserCount = Number(t.count);
        existing.advertiserRevenue = Number(t.revenue);
        existing.totalRevenue += Number(t.revenue);
      } else {
        trendsMap.set(key, {
          date: key,
          articleCount: 0,
          articleRevenue: 0,
          advertiserCount: Number(t.count),
          advertiserRevenue: Number(t.revenue),
          totalRevenue: Number(t.revenue),
        });
      }
    });
    
    const trends = Array.from(trendsMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    
    res.json({
      success: true,
      data: {
        days: daysCount,
        trends: trends.map(t => ({
          ...t,
          articleRevenueSAR: (t.articleRevenue / 100).toFixed(2),
          advertiserRevenueSAR: (t.advertiserRevenue / 100).toFixed(2),
          totalRevenueSAR: (t.totalRevenue / 100).toFixed(2),
        })),
      },
    });
  } catch (error: any) {
    console.error("[Payment Analytics] Error fetching trends:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// GET /transactions - قائمة المعاملات مع فلترة
// =====================================================
router.get("/transactions", async (req: Request, res: Response) => {
  try {
    const { 
      type = "all", 
      status, 
      startDate, 
      endDate, 
      page = "1", 
      limit = "50" 
    } = req.query;
    
    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 50, 100);
    const offset = (pageNum - 1) * limitNum;
    
    const results: any[] = [];
    
    // Fetch article transactions
    if (type === "all" || type === "article") {
      let articleQuery = db
        .select({
          id: articlePurchases.id,
          type: sql<string>`'article'`.as("type"),
          chargeId: articlePurchases.chargeId,
          amountHalalas: articlePurchases.priceHalalas,
          status: articlePurchases.status,
          createdAt: articlePurchases.createdAt,
          articleId: articlePurchases.articleId,
          userId: articlePurchases.userId,
        })
        .from(articlePurchases);
      
      const conditions = [];
      if (status) conditions.push(eq(articlePurchases.status, status as string));
      if (startDate) conditions.push(gte(articlePurchases.createdAt, new Date(startDate as string)));
      if (endDate) conditions.push(lte(articlePurchases.createdAt, new Date(endDate as string)));
      
      if (conditions.length > 0) {
        articleQuery = articleQuery.where(and(...conditions)) as any;
      }
      
      const articleResults = await articleQuery
        .orderBy(desc(articlePurchases.createdAt))
        .limit(limitNum)
        .offset(offset);
      
      results.push(...articleResults.map(r => ({
        ...r,
        amountSAR: (Number(r.amountHalalas) / 100).toFixed(2),
        paymentType: "article",
      })));
    }
    
    // Fetch advertiser transactions
    if (type === "all" || type === "advertiser") {
      let advQuery = db
        .select({
          id: advertiserTransactions.id,
          type: advertiserTransactions.type,
          chargeId: advertiserTransactions.chargeId,
          amountHalalas: advertiserTransactions.amountHalalas,
          status: advertiserTransactions.status,
          createdAt: advertiserTransactions.createdAt,
          advertiserId: advertiserTransactions.advertiserId,
          packageId: advertiserTransactions.packageId,
        })
        .from(advertiserTransactions)
        .where(eq(advertiserTransactions.type, "deposit"));
      
      const conditions = [eq(advertiserTransactions.type, "deposit")];
      if (status) conditions.push(eq(advertiserTransactions.status, status as string));
      if (startDate) conditions.push(gte(advertiserTransactions.createdAt, new Date(startDate as string)));
      if (endDate) conditions.push(lte(advertiserTransactions.createdAt, new Date(endDate as string)));
      
      const advResults = await db
        .select({
          id: advertiserTransactions.id,
          type: advertiserTransactions.type,
          chargeId: advertiserTransactions.chargeId,
          amountHalalas: advertiserTransactions.amountHalalas,
          status: advertiserTransactions.status,
          createdAt: advertiserTransactions.createdAt,
          advertiserId: advertiserTransactions.advertiserId,
          packageId: advertiserTransactions.packageId,
        })
        .from(advertiserTransactions)
        .where(and(...conditions))
        .orderBy(desc(advertiserTransactions.createdAt))
        .limit(limitNum)
        .offset(offset);
      
      results.push(...advResults.map(r => ({
        ...r,
        amountSAR: (Number(r.amountHalalas) / 100).toFixed(2),
        paymentType: "advertiser",
      })));
    }
    
    // Sort combined results by date
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    res.json({
      success: true,
      data: {
        transactions: results.slice(0, limitNum),
        pagination: {
          page: pageNum,
          limit: limitNum,
          hasMore: results.length >= limitNum,
        },
      },
    });
  } catch (error: any) {
    console.error("[Payment Analytics] Error fetching transactions:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// GET /failed - المدفوعات الفاشلة والمعلقة
// =====================================================
router.get("/failed", async (req: Request, res: Response) => {
  try {
    const { days = "7" } = req.query;
    const daysCount = parseInt(days as string) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysCount);
    
    // Failed article payments
    const failedArticle = await db
      .select({
        id: articlePurchases.id,
        chargeId: articlePurchases.chargeId,
        amountHalalas: articlePurchases.priceHalalas,
        status: articlePurchases.status,
        createdAt: articlePurchases.createdAt,
        articleId: articlePurchases.articleId,
        userId: articlePurchases.userId,
      })
      .from(articlePurchases)
      .where(and(
        gte(articlePurchases.createdAt, startDate),
        sql`${articlePurchases.status} IN ('failed', 'pending')`
      ))
      .orderBy(desc(articlePurchases.createdAt))
      .limit(50);
    
    // Failed advertiser payments
    const failedAdvertiser = await db
      .select({
        id: advertiserTransactions.id,
        chargeId: advertiserTransactions.chargeId,
        amountHalalas: advertiserTransactions.amountHalalas,
        status: advertiserTransactions.status,
        createdAt: advertiserTransactions.createdAt,
        advertiserId: advertiserTransactions.advertiserId,
      })
      .from(advertiserTransactions)
      .where(and(
        eq(advertiserTransactions.type, "deposit"),
        gte(advertiserTransactions.createdAt, startDate),
        sql`${advertiserTransactions.status} IN ('failed', 'pending')`
      ))
      .orderBy(desc(advertiserTransactions.createdAt))
      .limit(50);
    
    const allFailed = [
      ...failedArticle.map(f => ({ ...f, paymentType: "article", amountSAR: (Number(f.amountHalalas) / 100).toFixed(2) })),
      ...failedAdvertiser.map(f => ({ ...f, paymentType: "advertiser", amountSAR: (Number(f.amountHalalas) / 100).toFixed(2) })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    res.json({
      success: true,
      data: {
        count: allFailed.length,
        transactions: allFailed,
      },
    });
  } catch (error: any) {
    console.error("[Payment Analytics] Error fetching failed payments:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// GET /alerts - تنبيهات المدفوعات
// =====================================================
router.get("/alerts", async (req: Request, res: Response) => {
  try {
    const { unreadOnly = "true", limit = "20" } = req.query;
    const limitNum = Math.min(parseInt(limit as string) || 20, 50);
    
    const conditions = [];
    if (unreadOnly === "true") {
      conditions.push(eq(paymentAlerts.isRead, false));
    }
    
    const alerts = await db
      .select()
      .from(paymentAlerts)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(paymentAlerts.createdAt))
      .limit(limitNum);
    
    const unreadCount = await db
      .select({ count: count() })
      .from(paymentAlerts)
      .where(eq(paymentAlerts.isRead, false));
    
    res.json({
      success: true,
      data: {
        alerts,
        unreadCount: Number(unreadCount[0]?.count || 0),
      },
    });
  } catch (error: any) {
    console.error("[Payment Analytics] Error fetching alerts:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// POST /alerts/:id/read - تحديد تنبيه كمقروء
// =====================================================
router.post("/alerts/:id/read", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    await db
      .update(paymentAlerts)
      .set({ isRead: true })
      .where(eq(paymentAlerts.id, id));
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("[Payment Analytics] Error marking alert as read:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// POST /alerts/:id/resolve - حل تنبيه
// =====================================================
router.post("/alerts/:id/resolve", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user as any;
    
    await db
      .update(paymentAlerts)
      .set({ 
        isResolved: true, 
        resolvedAt: new Date(),
        resolvedBy: user.id,
      })
      .where(eq(paymentAlerts.id, id));
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("[Payment Analytics] Error resolving alert:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// GET /export - تصدير البيانات
// =====================================================
router.get("/export", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, format = "csv", type = "all" } = req.query;
    const user = req.user as any;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: "يجب تحديد تاريخ البداية والنهاية" });
    }
    
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    
    // Fetch data
    const articleData = type !== "advertiser" ? await db
      .select({
        id: articlePurchases.id,
        type: sql<string>`'مقال'`.as("type"),
        chargeId: articlePurchases.chargeId,
        amountHalalas: articlePurchases.priceHalalas,
        status: articlePurchases.status,
        createdAt: articlePurchases.createdAt,
      })
      .from(articlePurchases)
      .where(and(
        gte(articlePurchases.createdAt, start),
        lte(articlePurchases.createdAt, end)
      ))
      .orderBy(desc(articlePurchases.createdAt)) : [];
    
    const advertiserData = type !== "article" ? await db
      .select({
        id: advertiserTransactions.id,
        type: sql<string>`'معلن'`.as("type"),
        chargeId: advertiserTransactions.chargeId,
        amountHalalas: advertiserTransactions.amountHalalas,
        status: advertiserTransactions.status,
        createdAt: advertiserTransactions.createdAt,
      })
      .from(advertiserTransactions)
      .where(and(
        eq(advertiserTransactions.type, "deposit"),
        gte(advertiserTransactions.createdAt, start),
        lte(advertiserTransactions.createdAt, end)
      ))
      .orderBy(desc(advertiserTransactions.createdAt)) : [];
    
    const allData = [...articleData, ...advertiserData].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    // Log export
    await db.insert(paymentExportLogs).values({
      exportedBy: user.id,
      exportType: "custom_range",
      format: format as string,
      startDate: startDate as string,
      endDate: endDate as string,
      recordsCount: allData.length,
    });
    
    if (format === "json") {
      return res.json({
        success: true,
        data: {
          period: { start, end },
          recordsCount: allData.length,
          records: allData.map(d => ({
            ...d,
            amountSAR: (Number(d.amountHalalas) / 100).toFixed(2),
          })),
        },
      });
    }
    
    // CSV format
    const statusArabic: Record<string, string> = {
      completed: "مكتمل",
      pending: "معلق",
      failed: "فاشل",
    };
    
    const csvHeader = "المعرف,النوع,رقم العملية,المبلغ (ريال),الحالة,التاريخ\n";
    const csvRows = allData.map(d => 
      `${d.id},${d.type},${d.chargeId || ""},${(Number(d.amountHalalas) / 100).toFixed(2)},${statusArabic[d.status] || d.status},${new Date(d.createdAt).toISOString()}`
    ).join("\n");
    
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=payments_${startDate}_${endDate}.csv`);
    res.send("\uFEFF" + csvHeader + csvRows); // BOM for Arabic support
    
  } catch (error: any) {
    console.error("[Payment Analytics] Error exporting data:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// GET /kpis - مؤشرات الأداء الرئيسية
// =====================================================
router.get("/kpis", async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    
    // Today's revenue
    const todayArticle = await db
      .select({ revenue: sql<number>`COALESCE(SUM(CASE WHEN ${articlePurchases.status} = 'completed' THEN ${articlePurchases.priceHalalas} ELSE 0 END), 0)` })
      .from(articlePurchases)
      .where(gte(articlePurchases.createdAt, todayStart));
    
    const todayAdvertiser = await db
      .select({ revenue: sql<number>`COALESCE(SUM(CASE WHEN ${advertiserTransactions.status} = 'completed' THEN ${advertiserTransactions.amountHalalas} ELSE 0 END), 0)` })
      .from(advertiserTransactions)
      .where(and(
        eq(advertiserTransactions.type, "deposit"),
        gte(advertiserTransactions.createdAt, todayStart)
      ));
    
    // This month's revenue
    const monthArticle = await db
      .select({ revenue: sql<number>`COALESCE(SUM(CASE WHEN ${articlePurchases.status} = 'completed' THEN ${articlePurchases.priceHalalas} ELSE 0 END), 0)` })
      .from(articlePurchases)
      .where(gte(articlePurchases.createdAt, monthStart));
    
    const monthAdvertiser = await db
      .select({ revenue: sql<number>`COALESCE(SUM(CASE WHEN ${advertiserTransactions.status} = 'completed' THEN ${advertiserTransactions.amountHalalas} ELSE 0 END), 0)` })
      .from(advertiserTransactions)
      .where(and(
        eq(advertiserTransactions.type, "deposit"),
        gte(advertiserTransactions.createdAt, monthStart)
      ));
    
    // Last month's revenue (for comparison)
    const lastMonthArticle = await db
      .select({ revenue: sql<number>`COALESCE(SUM(CASE WHEN ${articlePurchases.status} = 'completed' THEN ${articlePurchases.priceHalalas} ELSE 0 END), 0)` })
      .from(articlePurchases)
      .where(and(
        gte(articlePurchases.createdAt, lastMonthStart),
        lte(articlePurchases.createdAt, lastMonthEnd)
      ));
    
    const lastMonthAdvertiser = await db
      .select({ revenue: sql<number>`COALESCE(SUM(CASE WHEN ${advertiserTransactions.status} = 'completed' THEN ${advertiserTransactions.amountHalalas} ELSE 0 END), 0)` })
      .from(advertiserTransactions)
      .where(and(
        eq(advertiserTransactions.type, "deposit"),
        gte(advertiserTransactions.createdAt, lastMonthStart),
        lte(advertiserTransactions.createdAt, lastMonthEnd)
      ));
    
    // Total lifetime revenue
    const lifetimeArticle = await db
      .select({ revenue: sql<number>`COALESCE(SUM(CASE WHEN ${articlePurchases.status} = 'completed' THEN ${articlePurchases.priceHalalas} ELSE 0 END), 0)` })
      .from(articlePurchases);
    
    const lifetimeAdvertiser = await db
      .select({ revenue: sql<number>`COALESCE(SUM(CASE WHEN ${advertiserTransactions.status} = 'completed' THEN ${advertiserTransactions.amountHalalas} ELSE 0 END), 0)` })
      .from(advertiserTransactions)
      .where(eq(advertiserTransactions.type, "deposit"));
    
    // Success rate (last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const successRateArticle = await db
      .select({
        total: count(),
        successful: sql<number>`COUNT(*) FILTER (WHERE ${articlePurchases.status} = 'completed')`,
      })
      .from(articlePurchases)
      .where(gte(articlePurchases.createdAt, thirtyDaysAgo));
    
    const successRateAdv = await db
      .select({
        total: count(),
        successful: sql<number>`COUNT(*) FILTER (WHERE ${advertiserTransactions.status} = 'completed')`,
      })
      .from(advertiserTransactions)
      .where(and(
        eq(advertiserTransactions.type, "deposit"),
        gte(advertiserTransactions.createdAt, thirtyDaysAgo)
      ));
    
    const todayRevenue = Number(todayArticle[0]?.revenue || 0) + Number(todayAdvertiser[0]?.revenue || 0);
    const monthRevenue = Number(monthArticle[0]?.revenue || 0) + Number(monthAdvertiser[0]?.revenue || 0);
    const lastMonthRevenue = Number(lastMonthArticle[0]?.revenue || 0) + Number(lastMonthAdvertiser[0]?.revenue || 0);
    const lifetimeRevenue = Number(lifetimeArticle[0]?.revenue || 0) + Number(lifetimeAdvertiser[0]?.revenue || 0);
    
    const totalPayments = Number(successRateArticle[0]?.total || 0) + Number(successRateAdv[0]?.total || 0);
    const successfulPayments = Number(successRateArticle[0]?.successful || 0) + Number(successRateAdv[0]?.successful || 0);
    const successRate = totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0;
    
    const monthGrowth = lastMonthRevenue > 0 
      ? ((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 
      : 0;
    
    res.json({
      success: true,
      data: {
        today: {
          revenueHalalas: todayRevenue,
          revenueSAR: (todayRevenue / 100).toFixed(2),
        },
        thisMonth: {
          revenueHalalas: monthRevenue,
          revenueSAR: (monthRevenue / 100).toFixed(2),
          growth: monthGrowth.toFixed(1),
        },
        lastMonth: {
          revenueHalalas: lastMonthRevenue,
          revenueSAR: (lastMonthRevenue / 100).toFixed(2),
        },
        lifetime: {
          revenueHalalas: lifetimeRevenue,
          revenueSAR: (lifetimeRevenue / 100).toFixed(2),
        },
        metrics: {
          successRate: successRate.toFixed(1),
          totalPayments,
          successfulPayments,
        },
      },
    });
  } catch (error: any) {
    console.error("[Payment Analytics] Error fetching KPIs:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
