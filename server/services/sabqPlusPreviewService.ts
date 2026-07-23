// ----------------------------------------------------------------------------
// سبق بلس — خدمة المعاينة الداخلية (محاكاة أكواد شحن ولاء بلس / WalaPlus)
//
// Powers /plus-preview (admin-only). Phase-1 model (approved 2026-07-23):
// the member redeems points for a 12-digit top-up code, pastes it in the
// WalaPlus app's شحن screen, and buys the store voucher there. Catalog rows
// live in loyalty_rewards marked rewardData.partnerApiData.previewOnly,
// points are debited for real via storage.redeemReward, and each redemption
// stores its code in user_rewards_history.deliveryData. Public rewards
// listings (web + mobile) exclude previewOnly rows.
//
// When the real WalaPlus top-up API lands, redeemPreviewReward() is the seam:
// the code-generation block gets replaced with the partner issue call.
// See docs/LOYALTY_WALAPLUS_B2B_SPEC_REVIEW.md.
// ----------------------------------------------------------------------------

import { randomBytes } from "crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  loyaltyRewards,
  userLoyaltyEvents,
  userPointsTotal,
  userRewardsHistory,
} from "@shared/schema";
import { tierProgress, LOYALTY_TIER_PREDICTION_MULTIPLIER } from "@shared/loyalty";
import { SUPERUSER_ROLE_NAMES } from "@shared/rbac-constants";
import { storage } from "../storage";

export const POINTS_PER_SAR = 500;
const VOUCHER_VALIDITY_MONTHS = 12;

const isPreviewReward = sql`${loyaltyRewards.rewardData}->'partnerApiData'->>'previewOnly' = 'true'`;

// ----------------------------------------------------------------------------
// Admin gate — same role semantics as loyaltyAdmin: legacy users.role text
// first, then RBAC user_roles.
// ----------------------------------------------------------------------------
export async function isPlusPreviewAdmin(user: { id: string; role?: string | null }): Promise<boolean> {
  if (user.role && (SUPERUSER_ROLE_NAMES as readonly string[]).includes(user.role)) {
    return true;
  }
  try {
    const result = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ${user.id}
        AND r.name IN ('admin','system_admin','superadmin','system.admin')
    `);
    return Number((result.rows as any[])[0]?.count ?? 0) > 0;
  } catch (err) {
    console.error("[SabqPlusPreview] role lookup failed:", err);
    return false;
  }
}

// ----------------------------------------------------------------------------
// Demo catalog — قسائم شحن متاجر (نموذج المرحلة الأولى المعتمد 2026-07-23):
// العضو يستبدل نقاطه بكود شحن يُدخل في شاشة «الشحن» بتطبيق ولاء بلس ثم يشتري
// قسيمة المتجر هناك. عينات المتاجر معتمدة من المالك، وأقل قسيمة 50 ر.س.
// ----------------------------------------------------------------------------
const CATALOG_VERSION = "topup-v2";
const TOPUP_DENOMINATIONS_SAR = [50, 100, 200];

type DemoStore = { key: string; nameAr: string; nameEn: string; brandColor: string };

const DEMO_STORES: DemoStore[] = [
  { key: "panda", nameAr: "بنده", nameEn: "Panda", brandColor: "#E30613" },
  { key: "othaim", nameAr: "أسواق العثيم", nameEn: "Othaim Markets", brandColor: "#00A651" },
  { key: "farm", nameAr: "أسواق المزرعة", nameEn: "Farm Superstores", brandColor: "#8DC63F" },
  { key: "tamimi", nameAr: "التميمي", nameEn: "Tamimi Markets", brandColor: "#DD4A48" },
  { key: "carrefour", nameAr: "كارفور", nameEn: "Carrefour", brandColor: "#1B3F8F" },
  { key: "lulu", nameAr: "لولو هايبر ماركت", nameEn: "LuLu Hypermarket", brandColor: "#009A44" },
];

const isCurrentCatalog = sql`${loyaltyRewards.rewardData}->'partnerApiData'->>'catalog' = ${CATALOG_VERSION}`;

async function ensureDemoCatalog(): Promise<void> {
  const [existing] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(loyaltyRewards)
    .where(and(isPreviewReward, isCurrentCatalog));
  if (Number(existing?.count ?? 0) > 0) return;

  // كتالوج معاينة قديم (القسائم الوهمية) — يُعطَّل لا يُحذف: صفوف السجل
  // user_rewards_history تشير إليه بمفتاح أجنبي.
  await db
    .update(loyaltyRewards)
    .set({ isActive: false })
    .where(and(isPreviewReward, sql`(${loyaltyRewards.rewardData}->'partnerApiData'->>'catalog') IS DISTINCT FROM ${CATALOG_VERSION}`));

  await db.insert(loyaltyRewards).values(
    DEMO_STORES.flatMap((store) =>
      TOPUP_DENOMINATIONS_SAR.map((sar) => ({
        nameAr: `قسيمة ${store.nameAr} ${sar} ر.س`,
        nameEn: `${store.nameEn} SAR ${sar} voucher`,
        description: `قسيمة شراء بقيمة ${sar} ر.س من ${store.nameAr}`,
        pointsCost: sar * POINTS_PER_SAR,
        rewardType: "PARTNER_REWARD",
        partnerName: store.nameAr,
        rewardData: {
          partnerApiData: {
            previewOnly: true,
            provider: "walaplus-sim",
            catalog: CATALOG_VERSION,
            brandKey: store.key,
            brandColor: store.brandColor,
            sarAmount: sar,
            valueLabel: `${sar} ر.س`,
            category: "أسواق",
          },
        },
        stock: 100,
        remainingStock: 100,
        maxRedemptionsPerUser: null,
        isActive: true,
      })),
    ),
  );
  console.log(`[SabqPlusPreview] seeded ${DEMO_STORES.length * TOPUP_DENOMINATIONS_SAR.length} top-up rewards (${CATALOG_VERSION})`);
}

// ----------------------------------------------------------------------------
// Member summary for the membership card
// ----------------------------------------------------------------------------
export async function getPlusSummary(userId: string) {
  const [points] = await db
    .select()
    .from(userPointsTotal)
    .where(eq(userPointsTotal.userId, userId))
    .limit(1);

  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [monthRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${userLoyaltyEvents.points}), 0)` })
    .from(userLoyaltyEvents)
    .where(and(eq(userLoyaltyEvents.userId, userId), gte(userLoyaltyEvents.createdAt, monthAgo)));

  const totalPoints = Number(points?.totalPoints ?? 0);
  const lifetimePoints = Number(points?.lifetimePoints ?? 0);
  const progress = tierProgress(lifetimePoints);

  return {
    totalPoints,
    lifetimePoints,
    sarValue: Number((totalPoints / POINTS_PER_SAR).toFixed(2)),
    pointsPerSar: POINTS_PER_SAR,
    monthPoints: Number(monthRow?.total ?? 0),
    tier: progress.current,
    nextTier: progress.next,
    pointsToNext: progress.pointsToNext,
    predictionMultiplier: LOYALTY_TIER_PREDICTION_MULTIPLIER[progress.current.level],
  };
}

// ----------------------------------------------------------------------------
// Catalog
// ----------------------------------------------------------------------------
export async function getPlusCatalog(userId: string) {
  await ensureDemoCatalog();

  const rewards = await db
    .select()
    .from(loyaltyRewards)
    .where(and(eq(loyaltyRewards.isActive, true), isPreviewReward, isCurrentCatalog))
    .orderBy(loyaltyRewards.pointsCost);

  const [points] = await db
    .select({ totalPoints: userPointsTotal.totalPoints })
    .from(userPointsTotal)
    .where(eq(userPointsTotal.userId, userId))
    .limit(1);

  const storeOrder = new Map(DEMO_STORES.map((s, i) => [s.key, i]));
  const mapped = rewards.map((r) => {
    const meta = (r.rewardData as any)?.partnerApiData ?? {};
    return {
      id: r.id,
      partnerName: r.partnerName,
      offer: r.description,
      pointsCost: Number(r.pointsCost),
      sarValue: Number((Number(r.pointsCost) / POINTS_PER_SAR).toFixed(2)),
      sarAmount: Number(meta.sarAmount ?? 0),
      brandKey: meta.brandKey ?? "",
      category: meta.category ?? "",
      brandColor: meta.brandColor ?? "#4A4A5A",
      valueLabel: meta.valueLabel ?? "",
      remainingStock: r.remainingStock,
    };
  });
  mapped.sort(
    (a, b) =>
      (storeOrder.get(a.brandKey) ?? 99) - (storeOrder.get(b.brandKey) ?? 99) || a.pointsCost - b.pointsCost,
  );

  return {
    balance: Number(points?.totalPoints ?? 0),
    pointsPerSar: POINTS_PER_SAR,
    rewards: mapped,
  };
}

// ----------------------------------------------------------------------------
// Redemption — real points debit + simulated voucher issuance
// ----------------------------------------------------------------------------
function generateVoucherCode(): string {
  // كود شحن من 12 رقمًا (القرار المعتمد 2026-07-23): يُنسخ ويُلصق في شاشة
  // «الشحن» بتطبيق ولاء بلس — أرقام فقط، يُخزَّن متصلًا والعرض يجمّعه 4-4-4.
  const bytes = randomBytes(12);
  let code = "";
  for (let i = 0; i < 12; i++) code += (bytes[i] % 10).toString();
  return code;
}

export async function redeemPreviewReward(userId: string, rewardId: string): Promise<
  | { success: true; voucher: { code: string; expiresAt: string; partnerName: string | null; offer: string | null; valueLabel: string; brandColor: string; brandKey: string; sarAmount: number; category: string; pointsSpent: number; redemptionId: string }; remainingBalance: number }
  | { success: false; code: string; message: string }
> {
  const [reward] = await db
    .select()
    .from(loyaltyRewards)
    .where(and(eq(loyaltyRewards.id, rewardId), isPreviewReward))
    .limit(1);

  if (!reward) {
    return { success: false, code: "NOT_FOUND", message: "القسيمة غير موجودة في كتالوج المعاينة" };
  }

  const result = await storage.redeemReward({ userId, rewardId, allowPreview: true });
  if (!result.success || !result.redemption) {
    return { success: false, code: result.code ?? "FAILED", message: result.message };
  }

  const code = generateVoucherCode();
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + VOUCHER_VALIDITY_MONTHS);

  // العقد القانوني: تسجيل قبول الشروط لحظة الإصدار مع القسيمة نفسها.
  // (جدول قبول شروط مستقل يأتي مع تكامل ولاء ون الفعلي.)
  await db
    .update(userRewardsHistory)
    .set({
      deliveryData: {
        couponCode: code,
        issuedVia: "sabq-plus-preview",
        voucherExpiresAt: expiresAt.toISOString(),
        termsAcceptedAt: new Date().toISOString(),
      } as any,
      status: "delivered",
      deliveredAt: new Date(),
    })
    .where(eq(userRewardsHistory.id, result.redemption.id));

  const meta = (reward.rewardData as any)?.partnerApiData ?? {};
  return {
    success: true,
    remainingBalance: result.remainingBalance ?? 0,
    voucher: {
      code,
      expiresAt: expiresAt.toISOString(),
      partnerName: reward.partnerName,
      offer: reward.description,
      valueLabel: meta.valueLabel ?? "",
      brandColor: meta.brandColor ?? "#4A4A5A",
      brandKey: meta.brandKey ?? "",
      sarAmount: Number(meta.sarAmount ?? 0),
      category: meta.category ?? "",
      pointsSpent: Number(reward.pointsCost),
      redemptionId: result.redemption.id,
    },
  };
}

// ----------------------------------------------------------------------------
// Voucher lookup for the Apple Wallet coupon pass
// ----------------------------------------------------------------------------
export async function getVoucherPassData(userId: string, redemptionId: string): Promise<
  | { partnerName: string; offer: string; valueLabel: string; couponCode: string; voucherExpiresAt: Date }
  | null
> {
  const [row] = await db
    .select({
      deliveryData: userRewardsHistory.deliveryData,
      partnerName: loyaltyRewards.partnerName,
      offer: loyaltyRewards.description,
      rewardData: loyaltyRewards.rewardData,
    })
    .from(userRewardsHistory)
    .innerJoin(loyaltyRewards, eq(userRewardsHistory.rewardId, loyaltyRewards.id))
    .where(and(eq(userRewardsHistory.id, redemptionId), eq(userRewardsHistory.userId, userId), isPreviewReward))
    .limit(1);

  if (!row) return null;
  const delivery = (row.deliveryData as any) ?? {};
  if (!delivery.couponCode) return null;
  const meta = (row.rewardData as any)?.partnerApiData ?? {};
  return {
    partnerName: row.partnerName ?? "سبق بلس",
    offer: row.offer ?? "",
    valueLabel: meta.valueLabel ?? "",
    couponCode: delivery.couponCode,
    voucherExpiresAt: delivery.voucherExpiresAt ? new Date(delivery.voucherExpiresAt) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  };
}

// ----------------------------------------------------------------------------
// My preview redemptions
// ----------------------------------------------------------------------------
export async function getPlusRedemptions(userId: string) {
  const rows = await db
    .select({
      id: userRewardsHistory.id,
      pointsSpent: userRewardsHistory.pointsSpent,
      status: userRewardsHistory.status,
      redeemedAt: userRewardsHistory.redeemedAt,
      deliveryData: userRewardsHistory.deliveryData,
      partnerName: loyaltyRewards.partnerName,
      offer: loyaltyRewards.description,
      rewardData: loyaltyRewards.rewardData,
    })
    .from(userRewardsHistory)
    .innerJoin(loyaltyRewards, eq(userRewardsHistory.rewardId, loyaltyRewards.id))
    .where(
      and(
        eq(userRewardsHistory.userId, userId),
        isPreviewReward,
        // المعاينة فقط: المُزالة لا تظهر في السجل (ما زال يمكن حذفها نهائياً عبر remove).
        sql`${userRewardsHistory.status} <> 'cancelled'`,
      ),
    )
    .orderBy(desc(userRewardsHistory.redeemedAt))
    .limit(30);

  return rows.map((r) => {
    const delivery = (r.deliveryData as any) ?? {};
    const meta = (r.rewardData as any)?.partnerApiData ?? {};
    return {
      id: r.id,
      partnerName: r.partnerName,
      offer: r.offer,
      pointsSpent: Number(r.pointsSpent),
      status: r.status,
      redeemedAt: r.redeemedAt,
      code: delivery.couponCode ?? null,
      voucherExpiresAt: delivery.voucherExpiresAt ?? null,
      brandColor: meta.brandColor ?? "#4A4A5A",
      brandKey: meta.brandKey ?? "",
      sarAmount: Number(meta.sarAmount ?? 0),
      valueLabel: meta.valueLabel ?? "",
      category: meta.category ?? "",
    };
  });
}

// ----------------------------------------------------------------------------
// Remove a preview voucher — refund points + restock + cancel row
// (admin testing surface only; does NOT remove an already-added Apple Wallet pass)
// ----------------------------------------------------------------------------
export async function removePreviewRedemption(
  userId: string,
  redemptionId: string,
): Promise<
  | { success: true; refundedPoints: number; remainingBalance: number }
  | { success: false; code: "NOT_FOUND" | "ALREADY_REMOVED"; message: string }
> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: userRewardsHistory.id,
        status: userRewardsHistory.status,
        pointsSpent: userRewardsHistory.pointsSpent,
        rewardId: userRewardsHistory.rewardId,
        remainingStock: loyaltyRewards.remainingStock,
      })
      .from(userRewardsHistory)
      .innerJoin(loyaltyRewards, eq(userRewardsHistory.rewardId, loyaltyRewards.id))
      .where(
        and(
          eq(userRewardsHistory.id, redemptionId),
          eq(userRewardsHistory.userId, userId),
          isPreviewReward,
        ),
      )
      .limit(1);

    if (!row) {
      return { success: false as const, code: "NOT_FOUND" as const, message: "القسيمة غير موجودة أو لا تخص حسابك" };
    }
    if (row.status === "cancelled") {
      return { success: false as const, code: "ALREADY_REMOVED" as const, message: "القسيمة مُزالة مسبقاً" };
    }

    const refundedPoints = Number(row.pointsSpent);

    const [balance] = await tx
      .update(userPointsTotal)
      .set({
        totalPoints: sql`${userPointsTotal.totalPoints} + ${refundedPoints}`,
        updatedAt: new Date(),
      })
      .where(eq(userPointsTotal.userId, userId))
      .returning({ totalPoints: userPointsTotal.totalPoints });

    if (row.remainingStock !== null) {
      await tx
        .update(loyaltyRewards)
        .set({ remainingStock: sql`${loyaltyRewards.remainingStock} + 1` })
        .where(eq(loyaltyRewards.id, row.rewardId));
    }

    // حذف الصف حتى لا يُحسب في maxRedemptionsPerUser عند إعادة الاختبار.
    await tx.delete(userRewardsHistory).where(eq(userRewardsHistory.id, redemptionId));

    return {
      success: true as const,
      refundedPoints,
      remainingBalance: Number(balance?.totalPoints ?? 0),
    };
  });
}
