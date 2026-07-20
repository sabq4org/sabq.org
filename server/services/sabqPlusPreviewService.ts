// ----------------------------------------------------------------------------
// سبق بلس — خدمة المعاينة الداخلية (محاكاة استبدال ولاء ون)
//
// Powers /plus-preview (admin-only). Simulates the WalaOne redemption flow on
// top of the REAL loyalty wallet: catalog rows live in loyalty_rewards marked
// with rewardData.partnerApiData.previewOnly, points are debited for real via
// storage.redeemReward, and each redemption issues a voucher code stored in
// user_rewards_history.deliveryData. Public rewards listings (web + mobile)
// exclude previewOnly rows, so members never see the simulation catalog.
//
// When the real WalaOne API integration lands, redeemPreviewReward() is the
// seam: the code-generation block gets replaced with a partner order call.
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
// Demo catalog — fictional partner brands (النموذج المعتمد). Real brand names
// arrive from the WalaOne catalog API in the integration phase.
// ----------------------------------------------------------------------------
type DemoReward = {
  nameAr: string;
  nameEn: string;
  description: string;
  pointsCost: number;
  partnerName: string;
  category: string;
  brandColor: string;
  valueLabel: string;
};

const DEMO_CATALOG: DemoReward[] = [
  { nameAr: "مشروب مجاني", nameEn: "Free drink", description: "مشروب مجاني من القائمة الكلاسيكية", pointsCost: 750, partnerName: "قهوة أثر", category: "مقاهٍ", brandColor: "#8C5A3B", valueLabel: "1.50 ر.س" },
  { nameAr: "خصم 10% على العناية", nameEn: "10% off care products", description: "خصم 10% على منتجات العناية", pointsCost: 500, partnerName: "صيدلية عافية", category: "صحة", brandColor: "#2E9E7E", valueLabel: "خصم 10%" },
  { nameAr: "خصم 15% على الفاتورة", nameEn: "15% off your bill", description: "خصم 15% على الفاتورة", pointsCost: 1000, partnerName: "مطاعم ضيافة", category: "مطاعم", brandColor: "#C24A4A", valueLabel: "خصم 15%" },
  { nameAr: "خصم 3 ر.س على مشوارك", nameEn: "SAR 3 off your ride", description: "خصم 3 ر.س على مشوارك القادم", pointsCost: 1500, partnerName: "تطبيق مشوار", category: "توصيل", brandColor: "#3E6FD9", valueLabel: "3.00 ر.س" },
  { nameAr: "خصم 4 ر.س على تذكرة", nameEn: "SAR 4 off a ticket", description: "خصم 4 ر.س على تذكرة سينما", pointsCost: 2000, partnerName: "سينما شاشة", category: "ترفيه", brandColor: "#6C4AB0", valueLabel: "4.00 ر.س" },
  { nameAr: "قسيمة شراء 5 ر.س", nameEn: "SAR 5 voucher", description: "قسيمة شراء بقيمة 5 ر.س", pointsCost: 2500, partnerName: "مكتبة معرفة", category: "تسوق", brandColor: "#B87E1F", valueLabel: "5.00 ر.س" },
  { nameAr: "باقة بيانات 2GB", nameEn: "2GB data pack", description: "باقة بيانات إضافية 2GB", pointsCost: 3000, partnerName: "اتصالات موجة", category: "اتصالات", brandColor: "#1793E8", valueLabel: "6.00 ر.س" },
  { nameAr: "قسيمة شراء 10 ر.س", nameEn: "SAR 10 voucher", description: "قسيمة شراء بقيمة 10 ر.س", pointsCost: 5000, partnerName: "متجر وسم", category: "أزياء", brandColor: "#4A4A5A", valueLabel: "10.00 ر.س" },
];

async function ensureDemoCatalog(): Promise<void> {
  const [existing] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(loyaltyRewards)
    .where(isPreviewReward);
  if (Number(existing?.count ?? 0) > 0) return;

  await db.insert(loyaltyRewards).values(
    DEMO_CATALOG.map((r) => ({
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      description: r.description,
      pointsCost: r.pointsCost,
      rewardType: "PARTNER_REWARD",
      partnerName: r.partnerName,
      rewardData: {
        partnerApiData: {
          previewOnly: true,
          provider: "walaone-sim",
          category: r.category,
          brandColor: r.brandColor,
          valueLabel: r.valueLabel,
        },
      },
      stock: 100,
      remainingStock: 100,
      maxRedemptionsPerUser: null,
      isActive: true,
    })),
  );
  console.log(`[SabqPlusPreview] seeded ${DEMO_CATALOG.length} demo rewards`);
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
    .where(and(eq(loyaltyRewards.isActive, true), isPreviewReward))
    .orderBy(loyaltyRewards.pointsCost);

  const [points] = await db
    .select({ totalPoints: userPointsTotal.totalPoints })
    .from(userPointsTotal)
    .where(eq(userPointsTotal.userId, userId))
    .limit(1);

  return {
    balance: Number(points?.totalPoints ?? 0),
    pointsPerSar: POINTS_PER_SAR,
    rewards: rewards.map((r) => {
      const meta = (r.rewardData as any)?.partnerApiData ?? {};
      return {
        id: r.id,
        partnerName: r.partnerName,
        offer: r.description,
        pointsCost: Number(r.pointsCost),
        sarValue: Number((Number(r.pointsCost) / POINTS_PER_SAR).toFixed(2)),
        category: meta.category ?? "",
        brandColor: meta.brandColor ?? "#4A4A5A",
        valueLabel: meta.valueLabel ?? "",
        remainingStock: r.remainingStock,
      };
    }),
  };
}

// ----------------------------------------------------------------------------
// Redemption — real points debit + simulated voucher issuance
// ----------------------------------------------------------------------------
function generateVoucherCode(): string {
  // No 0/1/I/L/O — voucher codes get read aloud and typed at partner tills.
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = randomBytes(8);
  let raw = "";
  for (let i = 0; i < 8; i++) raw += alphabet[bytes[i] % alphabet.length];
  return `SBQ-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export async function redeemPreviewReward(userId: string, rewardId: string): Promise<
  | { success: true; voucher: { code: string; expiresAt: string; partnerName: string | null; offer: string | null; valueLabel: string; brandColor: string; pointsSpent: number; redemptionId: string }; remainingBalance: number }
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
      valueLabel: meta.valueLabel ?? "",
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
