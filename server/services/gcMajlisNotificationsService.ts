/**
 * إشعارات «مجالس توقّعات خليجي 27».
 *
 * تقتصر الدورة على ثلاث لحظات مقصودة: تذكير قبل الإقفال، تجاوز حقيقي في
 * الترتيب بعد التسوية، وانضمام عضو جديد. تُكتب الرسائل أولًا في outbox دائم
 * بمفتاح إزالة تكرار حتمي، ثم تُسلّم إلى inbox وإلى أجهزة تطبيق خليجي فقط.
 *
 * قواعد الموثوقية:
 * - لا يُنشأ إشعار inbox أكثر من مرة حتى لو فشل push وأُعيدت المحاولة.
 * - لا يلتقط عاملان الصف نفسه؛ claim يستخدم FOR UPDATE SKIP LOCKED وحالة
 *   processing مؤقتة مع مهلة استرداد.
 * - نجاح جهاز واحد يكفي لإنهاء push حتى لا تُكرر الرسالة على الجهاز الناجح.
 * - المستخدم بلا صف تفضيلات يُعامل كالمفعّل (الافتراضي في الـschema).
 */
import {
  aliasedTable,
  and,
  asc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../db";
import { notificationBus } from "../notificationBus";
import {
  gcMajalis,
  gcMajlisMembers,
  gcMajlisNotificationDeliveries,
  gcPredictions,
  notificationsInbox,
  userNotificationPrefs,
  users,
  type GcMajlisNotificationDelivery,
} from "@shared/schema";
import { getGcFixtures, type GcFixture } from "./gulfCupService";
import { sendGulfCupPush } from "./userAppPushService";
import {
  buildGcMajlisOvertakeNotifications,
  detectGcMajlisOvertakes,
  selectGcMajlisReminderCandidates,
  type GcMajlisRankSnapshotRow,
  type GcMajlisReminderCandidate,
} from "./gcMajlisNotificationsLogic";

const MAX_DELIVERY_ATTEMPTS = 5;
// أطول من أسوأ دفعة تسليم محدودة التوازي؛ يمنع عاملًا ثانيًا من استرداد آخر
// الصفوف بينما الأول ما زال ينتظر مزوّد push بطيئًا.
const CLAIM_STALE_MS = 15 * 60 * 1000;
const REMINDER_START_MS = 2 * 60 * 60 * 1000;
const REMINDER_CUTOFF_MS = 15 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 100;

export type GcMajlisNotificationType =
  | "gc.majlis.reminder"
  | "gc.majlis.overtake"
  | "gc.majlis.member_joined";

export interface EnqueueGcMajlisNotificationInput {
  userId: string;
  majlisId: string;
  fixtureId?: string;
  type: GcMajlisNotificationType;
  dedupeKey: string;
  title: string;
  body: string;
  deeplink: string;
  payload?: Record<string, unknown>;
  scheduledAt?: Date;
}

export interface GcMajlisNotificationCycleSummary {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
}

type GcMajlisNotificationExecutor = {
  select: typeof db.select;
  selectDistinct: typeof db.selectDistinct;
  insert: typeof db.insert;
};

function displayName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "عضو جديد";
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 1000);
}

function absoluteMajlisLink(majlisId: string, fixtureId?: string): string {
  const query = new URLSearchParams({ id: majlisId });
  if (fixtureId) query.set("fixture", fixtureId);
  return `https://sabq.org/gulf-cup/majlis?${query.toString()}`;
}

/** إدراج آمن للتكرار على executor/transaction المعطى. */
async function enqueueGcMajlisNotificationWith(
  executor: GcMajlisNotificationExecutor,
  input: EnqueueGcMajlisNotificationInput,
): Promise<boolean> {
  const inserted = await executor
    .insert(gcMajlisNotificationDeliveries)
    .values({
      userId: input.userId,
      majlisId: input.majlisId,
      fixtureId: input.fixtureId,
      type: input.type,
      dedupeKey: input.dedupeKey,
      title: input.title,
      body: input.body,
      deeplink: input.deeplink,
      payload: input.payload ?? {},
      scheduledAt: input.scheduledAt ?? new Date(),
    })
    .onConflictDoNothing({ target: gcMajlisNotificationDeliveries.dedupeKey })
    .returning({ id: gcMajlisNotificationDeliveries.id });
  return inserted.length > 0;
}

/** إدراج آمن للتكرار؛ true تعني أن هذه الاستدعاءة أنشأت الصف. */
export async function enqueueGcMajlisNotification(
  input: EnqueueGcMajlisNotificationInput,
): Promise<boolean> {
  return enqueueGcMajlisNotificationWith(db, input);
}

async function claimDeliveries(limit: number): Promise<GcMajlisNotificationDelivery[]> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS);

  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(gcMajlisNotificationDeliveries)
      .where(
        and(
          or(
            eq(gcMajlisNotificationDeliveries.status, "pending"),
            eq(gcMajlisNotificationDeliveries.status, "failed"),
          ),
          lte(gcMajlisNotificationDeliveries.scheduledAt, now),
          lt(gcMajlisNotificationDeliveries.attempts, MAX_DELIVERY_ATTEMPTS),
          or(
            sql`${gcMajlisNotificationDeliveries.pushStatus} <> 'processing'`,
            lt(gcMajlisNotificationDeliveries.updatedAt, staleBefore),
          ),
        ),
      )
      .orderBy(asc(gcMajlisNotificationDeliveries.scheduledAt))
      .limit(Math.max(1, Math.min(limit, 500)))
      .for("update", { skipLocked: true });

    if (rows.length === 0) return [];
    await tx
      .update(gcMajlisNotificationDeliveries)
      .set({
        pushStatus: "processing",
        attempts: sql`${gcMajlisNotificationDeliveries.attempts} + 1`,
        updatedAt: now,
      })
      .where(inArray(gcMajlisNotificationDeliveries.id, rows.map((row) => row.id)));

    return rows.map((row) => ({ ...row, attempts: row.attempts + 1, updatedAt: now }));
  });
}

async function notificationsEnabled(userId: string): Promise<boolean> {
  const [preference] = await db
    .select({ enabled: userNotificationPrefs.gulfCupMajlis })
    .from(userNotificationPrefs)
    .where(eq(userNotificationPrefs.userId, userId))
    .limit(1);
  return preference?.enabled ?? true;
}

/** يمنع دفع رسالة قديمة بعد أن غادر العضو المجلس أو أكمل توقعه. */
async function deliveryStillRelevant(delivery: GcMajlisNotificationDelivery): Promise<boolean> {
  if (!delivery.majlisId) return false;
  const requiredMemberIds = [delivery.userId];
  const counterpartId = delivery.type === "gc.majlis.member_joined"
    ? delivery.payload?.joinedUserId
    : delivery.type === "gc.majlis.overtake"
      ? delivery.payload?.overtakerId
      : null;
  if (typeof counterpartId === "string") requiredMemberIds.push(counterpartId);

  const memberships = await db
    .select({ userId: gcMajlisMembers.userId })
    .from(gcMajlisMembers)
    .where(
      and(
        eq(gcMajlisMembers.majlisId, delivery.majlisId),
        inArray(gcMajlisMembers.userId, requiredMemberIds),
      ),
    );
  if (new Set(memberships.map((row) => row.userId)).size !== new Set(requiredMemberIds).size) {
    return false;
  }

  if (delivery.type === "gc.majlis.reminder" && delivery.fixtureId) {
    const fixture = (await getGcFixtures()).find(
      (item) => String(item.id) === delivery.fixtureId,
    );
    if (!fixture || !reminderWindow(fixture, Date.now())) return false;
    const [prediction] = await db
      .select({ id: gcPredictions.id })
      .from(gcPredictions)
      .where(
        and(
          eq(gcPredictions.userId, delivery.userId),
          eq(gcPredictions.fixtureId, delivery.fixtureId),
        ),
      )
      .limit(1);
    if (prediction) return false;
  }
  return true;
}

async function ensureInbox(
  delivery: GcMajlisNotificationDelivery,
): Promise<{ id: string; created: boolean }> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ inboxNotificationId: gcMajlisNotificationDeliveries.inboxNotificationId })
      .from(gcMajlisNotificationDeliveries)
      .where(eq(gcMajlisNotificationDeliveries.id, delivery.id))
      .for("update")
      .limit(1);

    if (locked?.inboxNotificationId) {
      return { id: locked.inboxNotificationId, created: false };
    }

    const [inbox] = await tx
      .insert(notificationsInbox)
      .values({
        userId: delivery.userId,
        type: delivery.type,
        title: delivery.title,
        body: delivery.body,
        deeplink: delivery.deeplink,
        read: false,
        metadata: {
          ...delivery.payload,
          majlisId: delivery.majlisId,
          fixtureId: delivery.fixtureId,
          deliveryId: delivery.id,
        },
      })
      .returning({ id: notificationsInbox.id });

    await tx
      .update(gcMajlisNotificationDeliveries)
      .set({ inboxNotificationId: inbox.id, updatedAt: new Date() })
      .where(eq(gcMajlisNotificationDeliveries.id, delivery.id));
    return { id: inbox.id, created: true };
  });
}

async function markDelivery(
  id: string,
  values: {
    status: "sent" | "failed";
    pushStatus: string;
    error?: string | null;
  },
): Promise<void> {
  const now = new Date();
  await db
    .update(gcMajlisNotificationDeliveries)
    .set({
      status: values.status,
      pushStatus: values.pushStatus,
      lastError: values.error ?? null,
      sentAt: values.status === "sent" ? now : null,
      updatedAt: now,
    })
    .where(eq(gcMajlisNotificationDeliveries.id, id));
}

async function deliverOne(delivery: GcMajlisNotificationDelivery): Promise<"sent" | "skipped" | "failed"> {
  try {
    if (!(await deliveryStillRelevant(delivery))) {
      await markDelivery(delivery.id, { status: "sent", pushStatus: "recipient_ineligible" });
      return "skipped";
    }
    if (!(await notificationsEnabled(delivery.userId))) {
      await markDelivery(delivery.id, { status: "sent", pushStatus: "preference_disabled" });
      return "skipped";
    }

    const inbox = await ensureInbox(delivery);
    if (inbox.created) {
      notificationBus.emit(delivery.userId, {
        id: inbox.id,
        type: delivery.type,
        title: delivery.title,
        body: delivery.body,
        deeplink: delivery.deeplink,
        metadata: delivery.payload,
      });
    }

    const pushDeeplink =
      typeof delivery.payload?.pushDeeplink === "string"
        ? delivery.payload.pushDeeplink
        : delivery.majlisId
          ? absoluteMajlisLink(delivery.majlisId, delivery.fixtureId ?? undefined)
          : "https://sabq.org/gulf-cup/majlis";
    const push = await sendGulfCupPush(delivery.userId, {
      title: delivery.title,
      body: delivery.body,
      type: delivery.type,
      deeplink: pushDeeplink,
      collapseId: delivery.id,
      interruptionLevel: delivery.type === "gc.majlis.reminder" ? "time-sensitive" : "active",
      data: {
        deliveryId: delivery.id,
        ...(delivery.majlisId ? { majlisId: delivery.majlisId } : {}),
        ...(delivery.fixtureId ? { fixtureId: delivery.fixtureId } : {}),
      },
    });

    if (push.failed > 0 && push.sent === 0) {
      await markDelivery(delivery.id, {
        status: "failed",
        pushStatus: "failed",
        error: push.errors.join("; ") || "Push delivery failed",
      });
      return "failed";
    }

    const pushStatus =
      push.attempted === 0 ? "no_devices" : push.failed > 0 ? "partial" : "sent";
    await markDelivery(delivery.id, { status: "sent", pushStatus });
    return "sent";
  } catch (error) {
    await markDelivery(delivery.id, {
      status: "failed",
      pushStatus: "failed",
      error: safeError(error),
    }).catch(() => {});
    console.error(`[GC Majlis Notifications] delivery ${delivery.id} failed:`, error);
    return "failed";
  }
}

/** يسلم دفعة من الـoutbox؛ آمن للتشغيل من أكثر من pod. */
export async function deliverGcMajlisNotifications(
  limit = DEFAULT_BATCH_SIZE,
): Promise<GcMajlisNotificationCycleSummary> {
  const claimed = await claimDeliveries(limit);
  const summary: GcMajlisNotificationCycleSummary = {
    claimed: claimed.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  // توازٍ محدود: أسرع من 100 طلب متسلسل، ولا يصنع طفرة اتصالات APNs/قاعدة.
  const concurrency = 5;
  for (let index = 0; index < claimed.length; index += concurrency) {
    const results = await Promise.all(claimed.slice(index, index + concurrency).map(deliverOne));
    for (const result of results) summary[result]++;
  }
  return summary;
}

async function reminderCandidates(fixtureId: string): Promise<GcMajlisReminderCandidate[]> {
  const viewerMembership = aliasedTable(gcMajlisMembers, "gc_reminder_viewer_membership");
  const peerMembership = aliasedTable(gcMajlisMembers, "gc_reminder_peer_membership");
  const peerPrediction = aliasedTable(gcPredictions, "gc_reminder_peer_prediction");
  const viewerPrediction = aliasedTable(gcPredictions, "gc_reminder_viewer_prediction");

  const rows = await db
    .select({
      userId: viewerMembership.userId,
      majlisId: gcMajalis.id,
      majlisName: gcMajalis.name,
      createdAt: gcMajalis.createdAt,
      predictedPeers: sql<number>`count(${peerPrediction.id})::int`,
    })
    .from(viewerMembership)
    .innerJoin(gcMajalis, eq(gcMajalis.id, viewerMembership.majlisId))
    .innerJoin(peerMembership, eq(peerMembership.majlisId, viewerMembership.majlisId))
    .leftJoin(
      peerPrediction,
      and(eq(peerPrediction.userId, peerMembership.userId), eq(peerPrediction.fixtureId, fixtureId)),
    )
    .leftJoin(
      viewerPrediction,
      and(eq(viewerPrediction.userId, viewerMembership.userId), eq(viewerPrediction.fixtureId, fixtureId)),
    )
    .where(isNull(viewerPrediction.id))
    .groupBy(
      viewerMembership.userId,
      gcMajalis.id,
      gcMajalis.name,
      gcMajalis.createdAt,
    )
    .having(sql`count(${peerPrediction.id}) > 0`);

  return selectGcMajlisReminderCandidates(
    rows.map((row) => ({ ...row, predictedPeers: Number(row.predictedPeers) })),
  );
}

function reminderWindow(fixture: GcFixture, nowMs: number): boolean {
  if (fixture.status.live || fixture.status.finished) return false;
  if (fixture.home.id <= 0 || fixture.away.id <= 0) return false;
  const remaining = fixture.timestamp * 1000 - nowMs;
  return remaining <= REMINDER_START_MS && remaining >= REMINDER_CUTOFF_MS;
}

/** يفحص مباريات نافذة الساعتين ويضيف تذكيرًا واحدًا لكل عضو/مباراة. */
export async function enqueueGcMajlisReminders(now = new Date()): Promise<number> {
  const fixtures = (await getGcFixtures()).filter((fixture) => reminderWindow(fixture, now.getTime()));
  let inserted = 0;
  for (const fixture of fixtures) {
    const fixtureId = String(fixture.id);
    const candidates = await reminderCandidates(fixtureId);
    for (const candidate of candidates) {
      const didInsert = await enqueueGcMajlisNotification({
        userId: candidate.userId,
        majlisId: candidate.majlisId,
        fixtureId,
        type: "gc.majlis.reminder",
        dedupeKey: `gc-majlis:reminder:${fixtureId}:${candidate.userId}`,
        title: "مجلسك ينتظرك ⏳",
        body: `توقّع ${candidate.predictedPeers} من أعضاء «${candidate.majlisName}» مباراة ${fixture.home.name} و${fixture.away.name}. بقي أقل من ساعتين على الإقفال.`,
        deeplink: `/gulf-cup/majlis?id=${encodeURIComponent(candidate.majlisId)}&fixture=${encodeURIComponent(fixtureId)}`,
        payload: {
          predictedPeers: candidate.predictedPeers,
          homeTeam: fixture.home.name,
          awayTeam: fixture.away.name,
          pushDeeplink: absoluteMajlisLink(candidate.majlisId, fixtureId),
        },
      });
      if (didInsert) inserted++;
    }
  }
  return inserted;
}

async function rankSnapshotRows(
  executor: GcMajlisNotificationExecutor,
  fixtureId: string,
): Promise<GcMajlisRankSnapshotRow[]> {
  const affected = await executor
    .selectDistinct({ majlisId: gcMajlisMembers.majlisId })
    .from(gcMajlisMembers)
    .innerJoin(gcPredictions, eq(gcPredictions.userId, gcMajlisMembers.userId))
    .where(eq(gcPredictions.fixtureId, fixtureId));
  if (affected.length === 0) return [];

  const rows = await executor
    .select({
      majlisId: gcMajalis.id,
      majlisName: gcMajalis.name,
      userId: gcMajlisMembers.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      joinedAt: gcMajlisMembers.joinedAt,
      points: sql<number>`coalesce(sum(${gcPredictions.pointsAwarded}), 0)::int`,
      exact: sql<number>`count(*) filter (where ${gcPredictions.exactHit})::int`,
      correct: sql<number>`count(*) filter (where ${gcPredictions.outcomeHit})::int`,
      fixturePoints: sql<number>`coalesce(sum(${gcPredictions.pointsAwarded}) filter (where ${gcPredictions.fixtureId} = ${fixtureId}), 0)::int`,
      fixtureExact: sql<number>`count(*) filter (where ${gcPredictions.fixtureId} = ${fixtureId} and ${gcPredictions.exactHit})::int`,
      fixtureCorrect: sql<number>`count(*) filter (where ${gcPredictions.fixtureId} = ${fixtureId} and ${gcPredictions.outcomeHit})::int`,
    })
    .from(gcMajlisMembers)
    .innerJoin(gcMajalis, eq(gcMajalis.id, gcMajlisMembers.majlisId))
    .innerJoin(users, eq(users.id, gcMajlisMembers.userId))
    .leftJoin(gcPredictions, eq(gcPredictions.userId, gcMajlisMembers.userId))
    .where(inArray(gcMajlisMembers.majlisId, affected.map((row) => row.majlisId)))
    .groupBy(
      gcMajalis.id,
      gcMajalis.name,
      gcMajlisMembers.userId,
      gcMajlisMembers.joinedAt,
      users.firstName,
      users.lastName,
    );

  return rows.map((row) => ({
    majlisId: row.majlisId,
    majlisName: row.majlisName,
    userId: row.userId,
    name: displayName(row.firstName, row.lastName),
    joinedAt: row.joinedAt,
    points: Number(row.points),
    exact: Number(row.exact),
    correct: Number(row.correct),
    fixturePoints: Number(row.fixturePoints),
    fixtureExact: Number(row.fixtureExact),
    fixtureCorrect: Number(row.fixtureCorrect),
  }));
}

/**
 * يكتب outbox التجاوز باستخدام transaction التسوية نفسها. لا يجلب أي بيانات
 * شبكية؛ اسم المباراة يأتي من fixture الموجود أصلًا لدى محرّك التسوية.
 */
export async function enqueueGcMajlisOvertakesInTransaction(
  tx: GcMajlisNotificationExecutor,
  fixtureId: string,
  fixtureLabel: string,
): Promise<number> {
  const rows = await rankSnapshotRows(tx, fixtureId);
  const events = detectGcMajlisOvertakes(rows);
  if (events.length === 0) return 0;

  let inserted = 0;
  const notifications = buildGcMajlisOvertakeNotifications(events, fixtureId, fixtureLabel);
  for (const notification of notifications) {
    const didInsert = await enqueueGcMajlisNotificationWith(tx, notification);
    if (didInsert) inserted++;
  }
  return inserted;
}

/** مسار يدوي/تصالحي خارج التسوية؛ المسار الدوري يستخدم النسخة transaction-aware. */
export async function enqueueGcMajlisOvertakes(fixtureId: string): Promise<number> {
  const fixture = (await getGcFixtures()).find((item) => String(item.id) === fixtureId);
  const fixtureLabel = fixture ? `${fixture.home.name} و${fixture.away.name}` : "";
  return db.transaction((tx) => enqueueGcMajlisOvertakesInTransaction(tx, fixtureId, fixtureLabel));
}

/** يكتب إشعار الانضمام داخل transaction العضوية نفسها. */
export async function enqueueGcMajlisMemberJoinedInTransaction(
  executor: GcMajlisNotificationExecutor,
  majlisId: string,
  joinedUserId: string,
): Promise<number> {
  const [context] = await executor
    .select({
      majlisName: gcMajalis.name,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(gcMajalis)
    .innerJoin(users, eq(users.id, joinedUserId))
    .where(eq(gcMajalis.id, majlisId))
    .limit(1);
  if (!context) return 0;

  const recipients = await executor
    .select({ userId: gcMajlisMembers.userId })
    .from(gcMajlisMembers)
    .where(
      and(
        eq(gcMajlisMembers.majlisId, majlisId),
        sql`${gcMajlisMembers.userId} <> ${joinedUserId}`,
      ),
    );
  const joinedName = displayName(context.firstName, context.lastName);
  let inserted = 0;
  for (const recipient of recipients) {
    const didInsert = await enqueueGcMajlisNotificationWith(executor, {
      userId: recipient.userId,
      majlisId,
      type: "gc.majlis.member_joined",
      dedupeKey: `gc-majlis:joined:${majlisId}:${joinedUserId}:${recipient.userId}`,
      title: "عضو جديد في المجلس 👋",
      body: `انضم ${joinedName} إلى «${context.majlisName}». رحّبوا بالمنافس الجديد!`,
      deeplink: `/gulf-cup/majlis?id=${encodeURIComponent(majlisId)}`,
      payload: {
        joinedUserId,
        joinedName,
        pushDeeplink: absoluteMajlisLink(majlisId),
      },
    });
    if (didInsert) inserted++;
  }
  return inserted;
}

/** مسار تصالحي/يدوي خارج معاملة الانضمام. */
export async function enqueueGcMajlisMemberJoined(
  majlisId: string,
  joinedUserId: string,
): Promise<number> {
  return db.transaction((tx) =>
    enqueueGcMajlisMemberJoinedInTransaction(tx, majlisId, joinedUserId),
  );
}
