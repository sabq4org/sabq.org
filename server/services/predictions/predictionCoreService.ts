// خدمة النواة — كل وصول قاعدة البيانات لمسارات التوقعات المركزية (ADR-001:
// المسارات HTTP فقط، الاستعلامات هنا). الخادم هو الحَكَم: الإغلاق بوقت الخادم
// حصرًا، والنتائج من مصدر الخادم، والعميل لا يرسل نقاطًا أبدًا.

import { and, asc, desc, eq, inArray, lt, sql, type SQL } from "drizzle-orm";
import { db } from "../../db";
import {
  predictionAwardOutbox,
  predictionCompetitions,
  predictionContests,
  predictionEntries,
  predictionPointsLedger,
  predictionScoringProfiles,
  predictionSettlements,
  users,
  type PredictionCompetition,
  type PredictionContest,
  type PredictionEntry,
} from "@shared/schema";
import {
  CONTEST_TYPE_VALUES,
  ENTRY_PAYLOAD_SCHEMAS,
  PREDICTION_ERROR_CODES,
  REASON_LABELS_AR,
  RESULT_PAYLOAD_SCHEMAS,
  type ContestType,
  type PredictionErrorCode,
  type ReasonCode,
  type SourcePlatform,
} from "@shared/predictions";
import { getStrategy } from "./registry";

export function isPredictionCoreEnabled(): boolean {
  return process.env.PREDICTION_CORE_ENABLED === "true";
}

/** خطأ مجالي يحمل رمزًا موحدًا من عقود API — المسارات تحوّله إلى HTTP. */
export class PredictionError extends Error {
  constructor(
    public readonly code: PredictionErrorCode,
    public readonly httpStatus: number = 400,
  ) {
    super(code);
    this.name = "PredictionError";
  }
}

// ---------------------------------------------------------------------------
// قراءة: البطولات والمسابقات
// ---------------------------------------------------------------------------

export async function listActiveCompetitions(userId?: string) {
  const competitions = await db
    .select()
    .from(predictionCompetitions)
    .where(inArray(predictionCompetitions.status, ["active", "paused"]))
    .orderBy(asc(predictionCompetitions.createdAt));

  const openCounts = await db
    .select({
      competitionId: predictionContests.competitionId,
      openContests: sql<number>`count(*)::int`,
    })
    .from(predictionContests)
    .where(eq(predictionContests.status, "open"))
    .groupBy(predictionContests.competitionId);
  const openByCompetition = new Map(openCounts.map((r) => [r.competitionId, r.openContests]));

  const userTotals = userId
    ? await db
        .select({
          competitionId: predictionPointsLedger.competitionId,
          points: sql<number>`coalesce(sum(${predictionPointsLedger.points}), 0)::int`,
        })
        .from(predictionPointsLedger)
        .where(and(
          eq(predictionPointsLedger.userId, userId),
          eq(predictionPointsLedger.pointScope, "competition"),
        ))
        .groupBy(predictionPointsLedger.competitionId)
    : [];
  const pointsByCompetition = new Map(userTotals.map((r) => [r.competitionId, r.points]));

  return competitions.map((c) => ({
    id: c.id,
    slug: c.slug,
    nameAr: c.nameAr,
    nameEn: c.nameEn,
    seasonKey: c.seasonKey,
    status: c.status,
    leaderboardMode: c.leaderboardMode,
    metadata: c.metadata,
    openContests: openByCompetition.get(c.id) ?? 0,
    myPoints: userId ? (pointsByCompetition.get(c.id) ?? 0) : undefined,
  }));
}

export async function getCompetitionBySlug(slug: string, userId?: string) {
  const [competition] = await db
    .select()
    .from(predictionCompetitions)
    .where(eq(predictionCompetitions.slug, slug))
    .limit(1);
  if (!competition || competition.status === "draft") {
    throw new PredictionError(PREDICTION_ERROR_CODES.CONTEST_NOT_FOUND, 404);
  }

  const contests = await listContests({ competitionId: competition.id, userId });
  return { competition, contests };
}

export async function listContests(filters: {
  competitionId?: string;
  competitionSlug?: string;
  status?: string;
  contestType?: string;
  userId?: string;
  limit?: number;
}) {
  let competitionId = filters.competitionId;
  if (!competitionId && filters.competitionSlug) {
    const [comp] = await db
      .select({ id: predictionCompetitions.id })
      .from(predictionCompetitions)
      .where(eq(predictionCompetitions.slug, filters.competitionSlug))
      .limit(1);
    if (!comp) return [];
    competitionId = comp.id;
  }

  const conditions: SQL[] = [sql`${predictionContests.status} <> 'draft'`];
  if (competitionId) conditions.push(eq(predictionContests.competitionId, competitionId));
  if (filters.status) conditions.push(eq(predictionContests.status, filters.status));
  if (filters.contestType) conditions.push(eq(predictionContests.contestType, filters.contestType));

  const contests = await db
    .select()
    .from(predictionContests)
    .where(and(...conditions))
    .orderBy(asc(predictionContests.locksAt))
    .limit(Math.min(filters.limit ?? 100, 200));

  const entriesByContest = new Map<string, PredictionEntry>();
  if (filters.userId && contests.length > 0) {
    const myEntries = await db
      .select()
      .from(predictionEntries)
      .where(and(
        eq(predictionEntries.userId, filters.userId),
        inArray(predictionEntries.contestId, contests.map((c) => c.id)),
      ));
    for (const entry of myEntries) entriesByContest.set(entry.contestId, entry);
  }

  return contests.map((c) => serializeContest(c, entriesByContest.get(c.id)));
}

export async function getContest(contestId: string, userId?: string) {
  const [contest] = await db
    .select()
    .from(predictionContests)
    .where(eq(predictionContests.id, contestId))
    .limit(1);
  if (!contest || contest.status === "draft") {
    throw new PredictionError(PREDICTION_ERROR_CODES.CONTEST_NOT_FOUND, 404);
  }

  let myEntry: PredictionEntry | undefined;
  if (userId) {
    const [entry] = await db
      .select()
      .from(predictionEntries)
      .where(and(eq(predictionEntries.contestId, contestId), eq(predictionEntries.userId, userId)))
      .limit(1);
    myEntry = entry;
  }

  const [profile] = await db
    .select({
      strategyKey: predictionScoringProfiles.strategyKey,
      version: predictionScoringProfiles.version,
      params: predictionScoringProfiles.params,
    })
    .from(predictionScoringProfiles)
    .where(eq(predictionScoringProfiles.id, contest.scoringProfileId))
    .limit(1);

  return { ...serializeContest(contest, myEntry), rule: profile ?? null };
}

function serializeContest(contest: PredictionContest, myEntry?: PredictionEntry) {
  return {
    id: contest.id,
    competitionId: contest.competitionId,
    externalRef: contest.externalRef,
    contestType: contest.contestType,
    status: contest.status,
    opensAt: contest.opensAt,
    locksAt: contest.locksAt,
    settledAt: contest.settledAt,
    metadata: contest.metadata,
    // النتيجة تُعرض بعد التسوية فقط — لا تسريب قبل الإغلاق
    result: contest.status === "settled" ? contest.resultPayload : null,
    myEntry: myEntry && myEntry.status === "active"
      ? {
          id: myEntry.id,
          payload: myEntry.predictionPayload,
          submittedAt: myEntry.submittedAt,
          updatedAt: myEntry.updatedAt,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// كتابة: التوقعات (Upsert قبل الإغلاق، والخادم يرفض بعده)
// ---------------------------------------------------------------------------

export async function upsertEntry(params: {
  contestId: string;
  userId: string;
  payload: unknown;
  platform: SourcePlatform;
}) {
  if (!isPredictionCoreEnabled()) {
    throw new PredictionError(PREDICTION_ERROR_CODES.COMPETITION_DISABLED, 503);
  }

  const [contest] = await db
    .select()
    .from(predictionContests)
    .where(eq(predictionContests.id, params.contestId))
    .limit(1);
  if (!contest) throw new PredictionError(PREDICTION_ERROR_CODES.CONTEST_NOT_FOUND, 404);

  const now = new Date();
  if (contest.status !== "open" || now < contest.opensAt) {
    throw new PredictionError(PREDICTION_ERROR_CODES.CONTEST_NOT_OPEN, 409);
  }
  if (now >= contest.locksAt) {
    throw new PredictionError(PREDICTION_ERROR_CODES.PREDICTION_LOCKED, 409);
  }

  const schema = ENTRY_PAYLOAD_SCHEMAS[contest.contestType as ContestType];
  const parsed = schema?.safeParse(params.payload);
  if (!parsed?.success) {
    throw new PredictionError(PREDICTION_ERROR_CODES.INVALID_PREDICTION_PAYLOAD, 422);
  }

  const [entry] = await db
    .insert(predictionEntries)
    .values({
      contestId: params.contestId,
      userId: params.userId,
      predictionPayload: parsed.data,
      scoringProfileId: contest.scoringProfileId,
      sourcePlatform: params.platform,
    })
    .onConflictDoUpdate({
      target: [predictionEntries.contestId, predictionEntries.userId],
      set: {
        predictionPayload: parsed.data,
        status: "active",
        sourcePlatform: params.platform,
        updatedAt: now,
      },
    })
    .returning();

  return {
    id: entry.id,
    payload: entry.predictionPayload,
    submittedAt: entry.submittedAt,
    locksAt: contest.locksAt,
  };
}

export async function withdrawEntry(contestId: string, userId: string) {
  const [contest] = await db
    .select()
    .from(predictionContests)
    .where(eq(predictionContests.id, contestId))
    .limit(1);
  if (!contest) throw new PredictionError(PREDICTION_ERROR_CODES.CONTEST_NOT_FOUND, 404);
  if (contest.status !== "open" || new Date() >= contest.locksAt) {
    throw new PredictionError(PREDICTION_ERROR_CODES.WITHDRAWAL_NOT_ALLOWED, 409);
  }

  await db
    .update(predictionEntries)
    .set({ status: "withdrawn", updatedAt: new Date() })
    .where(and(eq(predictionEntries.contestId, contestId), eq(predictionEntries.userId, userId)));
}

// ---------------------------------------------------------------------------
// قراءة: نقاط المستخدم وسجله
// ---------------------------------------------------------------------------

export async function getUserPoints(userId: string, competitionSlug?: string) {
  const conditions: SQL[] = [
    eq(predictionPointsLedger.userId, userId),
    eq(predictionPointsLedger.pointScope, "competition"),
  ];
  if (competitionSlug) {
    const [comp] = await db
      .select({ id: predictionCompetitions.id })
      .from(predictionCompetitions)
      .where(eq(predictionCompetitions.slug, competitionSlug))
      .limit(1);
    if (!comp) return { competitions: [] };
    conditions.push(eq(predictionPointsLedger.competitionId, comp.id));
  }

  const totals = await db
    .select({
      competitionId: predictionPointsLedger.competitionId,
      slug: predictionCompetitions.slug,
      nameAr: predictionCompetitions.nameAr,
      points: sql<number>`coalesce(sum(${predictionPointsLedger.points}), 0)::int`,
      awards: sql<number>`count(*) filter (where ${predictionPointsLedger.points} > 0)::int`,
    })
    .from(predictionPointsLedger)
    .innerJoin(
      predictionCompetitions,
      eq(predictionCompetitions.id, predictionPointsLedger.competitionId),
    )
    .where(and(...conditions))
    .groupBy(predictionPointsLedger.competitionId, predictionCompetitions.slug, predictionCompetitions.nameAr);

  return { competitions: totals };
}

export async function getUserLedger(
  userId: string,
  options: { competitionSlug?: string; cursor?: string; limit?: number },
) {
  const limit = Math.min(options.limit ?? 20, 50);
  const conditions: SQL[] = [eq(predictionPointsLedger.userId, userId)];

  if (options.competitionSlug) {
    const [comp] = await db
      .select({ id: predictionCompetitions.id })
      .from(predictionCompetitions)
      .where(eq(predictionCompetitions.slug, options.competitionSlug))
      .limit(1);
    if (!comp) return { items: [], nextCursor: null };
    conditions.push(eq(predictionPointsLedger.competitionId, comp.id));
  }

  // Cursor ثابت keyset على (createdAt, id) — لا تتزحزح الصفحات مع الإضافة
  if (options.cursor) {
    const decoded = decodeCursor(options.cursor);
    if (decoded) {
      conditions.push(sql`(${predictionPointsLedger.createdAt}, ${predictionPointsLedger.id}) < (${decoded.createdAt}, ${decoded.id})`);
    }
  }

  const rows = await db
    .select()
    .from(predictionPointsLedger)
    .where(and(...conditions))
    .orderBy(desc(predictionPointsLedger.createdAt), desc(predictionPointsLedger.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit
    ? encodeCursor({ createdAt: page[page.length - 1].createdAt, id: page[page.length - 1].id })
    : null;

  return {
    items: page.map((row) => ({
      id: row.id,
      contestId: row.contestId,
      competitionId: row.competitionId,
      points: row.points,
      reasonCode: row.reasonCode,
      reasonLabelAr: REASON_LABELS_AR[row.reasonCode as ReasonCode] ?? row.reasonCode,
      breakdown: row.breakdown,
      createdAt: row.createdAt,
    })),
    nextCursor,
  };
}

function encodeCursor(cursor: { createdAt: Date; id: string }): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`).toString("base64url");
}

function decodeCursor(raw: string): { createdAt: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
    const createdAt = new Date(iso);
    if (!id || Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// لوحة المتصدرين — نطاق معلن دائمًا (بطولة محددة)، والولاء خارجها كليًا
// ---------------------------------------------------------------------------

export async function getLeaderboard(params: {
  competitionSlug: string;
  userId?: string;
  offset?: number;
  limit?: number;
}) {
  const limit = Math.min(params.limit ?? 20, 100);
  const offset = Math.max(params.offset ?? 0, 0);

  const [competition] = await db
    .select()
    .from(predictionCompetitions)
    .where(eq(predictionCompetitions.slug, params.competitionSlug))
    .limit(1);
  if (!competition) throw new PredictionError(PREDICTION_ERROR_CODES.CONTEST_NOT_FOUND, 404);

  const totals = db.$with("totals").as(
    db
      .select({
        userId: predictionPointsLedger.userId,
        points: sql<number>`sum(${predictionPointsLedger.points})::int`.as("points"),
        exactCount: sql<number>`count(*) filter (where ${predictionPointsLedger.reasonCode} = 'exact')::int`.as("exact_count"),
      })
      .from(predictionPointsLedger)
      .where(and(
        eq(predictionPointsLedger.competitionId, competition.id),
        eq(predictionPointsLedger.pointScope, "competition"),
      ))
      .groupBy(predictionPointsLedger.userId),
  );

  const rows = await db
    .with(totals)
    .select({
      userId: totals.userId,
      points: totals.points,
      exactCount: totals.exactCount,
      rank: sql<number>`rank() over (order by ${totals.points} desc, ${totals.exactCount} desc, ${totals.userId} asc)::int`,
      firstName: users.firstName,
      lastName: users.lastName,
      profileImageUrl: users.profileImageUrl,
    })
    .from(totals)
    .innerJoin(users, eq(users.id, totals.userId))
    .orderBy(desc(totals.points), desc(totals.exactCount), asc(totals.userId))
    .limit(limit)
    .offset(offset);

  // ترتيب المستخدم الحالي حتى لو لم يظهر في الصفحة
  let myRank: { rank: number; points: number } | null = null;
  if (params.userId) {
    const [mine] = await db
      .with(totals)
      .select({
        userId: totals.userId,
        points: totals.points,
        rank: sql<number>`rank() over (order by ${totals.points} desc, ${totals.exactCount} desc, ${totals.userId} asc)::int`,
      })
      .from(totals)
      .where(sql`${totals.userId} = ${params.userId}`);
    if (mine) myRank = { rank: mine.rank, points: mine.points };
  }

  return {
    scope: "competition",
    competitionId: competition.id,
    competitionSlug: competition.slug,
    nameAr: `ترتيب توقعات ${competition.nameAr}`,
    seasonKey: competition.seasonKey,
    entries: rows.map((row) => ({
      rank: row.rank,
      userId: row.userId,
      name: [row.firstName, row.lastName].filter(Boolean).join(" ") || "مستخدم سبق",
      profileImageUrl: row.profileImageUrl,
      points: row.points,
      exactCount: row.exactCount,
    })),
    myRank,
    offset,
    limit,
  };
}

// ---------------------------------------------------------------------------
// تفاصيل التسوية وشرح النقاط للمستخدم (Breakdown v2 §11)
// ---------------------------------------------------------------------------

export async function getContestSettlement(contestId: string, userId?: string) {
  const [contest] = await db
    .select()
    .from(predictionContests)
    .where(eq(predictionContests.id, contestId))
    .limit(1);
  if (!contest) throw new PredictionError(PREDICTION_ERROR_CODES.CONTEST_NOT_FOUND, 404);
  if (contest.status !== "settled") {
    throw new PredictionError(PREDICTION_ERROR_CODES.SETTLEMENT_PENDING, 409);
  }

  const [settlement] = await db
    .select()
    .from(predictionSettlements)
    .where(and(
      eq(predictionSettlements.contestId, contestId),
      eq(predictionSettlements.status, "settled"),
    ))
    .orderBy(desc(predictionSettlements.startedAt))
    .limit(1);

  let myAwards: Array<{
    points: number;
    reasonCode: string;
    reasonLabelAr: string;
    breakdown: Record<string, unknown> | null;
    referenceId: string;
    wallet: { multiplier: number; walletPoints: number; delivered: boolean } | null;
  }> = [];
  if (userId && settlement) {
    const rows = await db
      .select()
      .from(predictionPointsLedger)
      .where(and(
        eq(predictionPointsLedger.settlementId, settlement.id),
        eq(predictionPointsLedger.userId, userId),
      ));
    // مكافأة المحفظة تعيش في Outbox (فصل النقاط) — تُضم هنا للعرض فقط
    const outboxRows = rows.length > 0
      ? await db
          .select()
          .from(predictionAwardOutbox)
          .where(inArray(predictionAwardOutbox.ledgerId, rows.map((r) => r.id)))
      : [];
    const outboxByLedger = new Map(outboxRows.map((o) => [o.ledgerId, o]));
    myAwards = rows.map((row) => {
      const outbox = outboxByLedger.get(row.id);
      return {
        points: row.points,
        reasonCode: row.reasonCode,
        reasonLabelAr: REASON_LABELS_AR[row.reasonCode as ReasonCode] ?? row.reasonCode,
        breakdown: row.breakdown,
        referenceId: row.id, // الرقم المرجعي للدعم
        wallet: outbox
          ? {
              multiplier: outbox.multiplierSnapshot / 100,
              walletPoints: outbox.walletPoints,
              delivered: outbox.status === "delivered",
            }
          : null,
      };
    });
  }

  return {
    contestId,
    result: contest.resultPayload,
    settledAt: contest.settledAt,
    summary: settlement?.summary ?? null,
    myAwards,
  };
}

// ---------------------------------------------------------------------------
// إدارة (تُستدعى من مسارات الإدارة/السكربتات — ليست عامة)
// ---------------------------------------------------------------------------

export async function createCompetition(input: {
  slug: string;
  nameAr: string;
  nameEn?: string;
  seasonKey: string;
  leaderboardMode?: string;
  sourceProvider?: string;
  timezone?: string;
  metadata?: Record<string, unknown>;
}): Promise<PredictionCompetition> {
  const [row] = await db
    .insert(predictionCompetitions)
    .values({ ...input, status: "draft" })
    .returning();
  return row;
}

export async function setCompetitionStatus(slug: string, status: string) {
  await db
    .update(predictionCompetitions)
    .set({ status, updatedAt: new Date() })
    .where(eq(predictionCompetitions.slug, slug));
}

/**
 * إنشاء إصدار ملف احتساب جديد — لا تعديل لملف قائم أبدًا؛ الإصدار يتصاعد
 * تلقائيًا لكل (بطولة، نوع). المعاملات تُتحقق باستراتيجيتها قبل الحفظ.
 */
export async function createScoringProfile(input: {
  competitionId: string | null;
  contestType: ContestType;
  strategyKey: string;
  params: Record<string, unknown>;
  createdBy?: string;
  activate?: boolean;
}) {
  if (!CONTEST_TYPE_VALUES.includes(input.contestType)) {
    throw new PredictionError(PREDICTION_ERROR_CODES.INVALID_PREDICTION_PAYLOAD, 422);
  }
  // يرمي zod error عند معاملات فاسدة — المسار يحولها 422
  getStrategy(input.strategyKey).validateParams(input.params);

  return db.transaction(async (tx) => {
    const [latest] = await tx
      .select({ version: predictionScoringProfiles.version })
      .from(predictionScoringProfiles)
      .where(and(
        input.competitionId === null
          ? sql`${predictionScoringProfiles.competitionId} is null`
          : eq(predictionScoringProfiles.competitionId, input.competitionId),
        eq(predictionScoringProfiles.contestType, input.contestType),
      ))
      .orderBy(desc(predictionScoringProfiles.version))
      .limit(1);

    const [row] = await tx
      .insert(predictionScoringProfiles)
      .values({
        competitionId: input.competitionId,
        contestType: input.contestType,
        strategyKey: input.strategyKey,
        version: (latest?.version ?? 0) + 1,
        params: input.params,
        status: input.activate ? "active" : "draft",
        effectiveFrom: input.activate ? new Date() : null,
        createdBy: input.createdBy,
      })
      .returning();

    // إصدار نشط واحد لكل (بطولة، نوع): تفعيل الجديد يقاعد السابق
    if (input.activate) {
      await tx
        .update(predictionScoringProfiles)
        .set({ status: "retired" })
        .where(and(
          input.competitionId === null
            ? sql`${predictionScoringProfiles.competitionId} is null`
            : eq(predictionScoringProfiles.competitionId, input.competitionId),
          eq(predictionScoringProfiles.contestType, input.contestType),
          eq(predictionScoringProfiles.status, "active"),
          lt(predictionScoringProfiles.version, row.version),
        ));
    }
    return row;
  });
}

/** الملف النشط لبطولة ونوع — ملف البطولة يغلب الملف العام. */
export async function getActiveProfile(competitionId: string, contestType: ContestType) {
  const [specific] = await db
    .select()
    .from(predictionScoringProfiles)
    .where(and(
      eq(predictionScoringProfiles.competitionId, competitionId),
      eq(predictionScoringProfiles.contestType, contestType),
      eq(predictionScoringProfiles.status, "active"),
    ))
    .orderBy(desc(predictionScoringProfiles.version))
    .limit(1);
  if (specific) return specific;

  const [generic] = await db
    .select()
    .from(predictionScoringProfiles)
    .where(and(
      sql`${predictionScoringProfiles.competitionId} is null`,
      eq(predictionScoringProfiles.contestType, contestType),
      eq(predictionScoringProfiles.status, "active"),
    ))
    .orderBy(desc(predictionScoringProfiles.version))
    .limit(1);
  return generic ?? null;
}

export async function createContest(input: {
  competitionId: string;
  externalRef: string;
  contestType: ContestType;
  opensAt: Date;
  locksAt: Date;
  metadata?: Record<string, unknown>;
  open?: boolean;
}) {
  const profile = await getActiveProfile(input.competitionId, input.contestType);
  if (!profile) throw new PredictionError(PREDICTION_ERROR_CODES.COMPETITION_DISABLED, 409);

  const [row] = await db
    .insert(predictionContests)
    .values({
      competitionId: input.competitionId,
      externalRef: input.externalRef,
      contestType: input.contestType,
      scoringProfileId: profile.id,
      opensAt: input.opensAt,
      locksAt: input.locksAt,
      metadata: input.metadata,
      status: input.open ? "open" : "draft",
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null; // null = المسابقة موجودة (المفتاح الخارجي الموحد §22)
}

/**
 * تثبيت النتيجة الرسمية — من مصدر الخادم فقط. يرفع نسخة النتيجة ويجعل
 * المسابقة ready ليلتقطها عامل التسوية. المسوّاة تصحَّح عبر reverseAndReopen.
 */
export async function setContestResult(contestId: string, resultPayload: unknown) {
  const [contest] = await db
    .select()
    .from(predictionContests)
    .where(eq(predictionContests.id, contestId))
    .limit(1);
  if (!contest) throw new PredictionError(PREDICTION_ERROR_CODES.CONTEST_NOT_FOUND, 404);
  if (contest.status === "settled") {
    throw new PredictionError(PREDICTION_ERROR_CODES.SETTLEMENT_PENDING, 409);
  }
  if (!["locked", "ready", "open"].includes(contest.status)) {
    throw new PredictionError(PREDICTION_ERROR_CODES.CONTEST_NOT_OPEN, 409);
  }

  const schema = RESULT_PAYLOAD_SCHEMAS[contest.contestType as ContestType];
  const parsed = schema?.safeParse(resultPayload);
  if (!parsed?.success) {
    throw new PredictionError(PREDICTION_ERROR_CODES.INVALID_PREDICTION_PAYLOAD, 422);
  }

  await db
    .update(predictionContests)
    .set({
      resultPayload: parsed.data,
      resultVersion: contest.resultVersion + 1,
      // نتيجة قبل الإغلاق لا تسوّي مبكرًا — القفل أولًا
      status: contest.status === "open" ? "open" : "ready",
      updatedAt: new Date(),
    })
    .where(eq(predictionContests.id, contestId));
}
