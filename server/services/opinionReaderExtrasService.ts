/**
 * إضافات مقال الرأي: جملة المقال، «أوافق / لا أوافق»، وتغيير الموعد مرة واحدة.
 * المنطق الخالص في shared/opinionReaderExtras.ts. الأصوات تمر بمسار
 * الاستطلاعات القائم (POST /api/polls/:pollId/vote) على استطلاع بخيارين.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  articles,
  articlePolls,
  opinionArticleExtras,
  opinionWriterReschedules,
  pollOptions,
  pollVotes,
  users,
} from "@shared/schema";
import {
  AGREE_OPTION_MARK,
  AGREE_OPTION_TEXT,
  AGREE_POLL_QUESTION,
  DISAGREE_OPTION_MARK,
  DISAGREE_OPTION_TEXT,
  agreeVotePercents,
  rescheduleEligibility,
  rescheduleTargetError,
  RESCHEDULE_REASON_LABELS,
  validatePullQuote,
} from "@shared/opinionReaderExtras";
import { memoryCache } from "../memoryCache";
import { findWriterGapConflicts } from "./opinionWritersService";

type ArticleHead = {
  id: string;
  status: string;
  articleType: string | null;
  authorId: string | null;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  title: string;
  slug: string;
};

async function loadOpinionArticle(articleId: string): Promise<ArticleHead | null> {
  const [row] = await db
    .select({
      id: articles.id,
      status: articles.status,
      articleType: articles.articleType,
      authorId: articles.authorId,
      scheduledAt: articles.scheduledAt,
      publishedAt: articles.publishedAt,
      title: articles.title,
      slug: articles.slug,
    })
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.articleType, "opinion")))
    .limit(1);
  return row ?? null;
}

export function isArticlePubliclyVisible(a: Pick<ArticleHead, "status" | "publishedAt">): boolean {
  return a.status === "published" && (!a.publishedAt || a.publishedAt.getTime() <= Date.now());
}

export type AgreeState = {
  pollId: string;
  agreeOptionId: string;
  disagreeOptionId: string;
  agree: number;
  disagree: number;
  agreePct: number;
  disagreePct: number;
  total: number;
  userChoice: "agree" | "disagree" | null;
};

export type OpinionExtrasView = {
  articleId: string;
  canEdit: boolean;
  pullQuote: string | null;
  agreeVoteEnabled: boolean;
  author: { name: string; imageUrl: string | null } | null;
  agree: AgreeState | null;
  quoteCardUrl: string | null;
};

async function loadAuthor(authorId: string | null): Promise<{ name: string; imageUrl: string | null } | null> {
  if (!authorId) return null;
  const [u] = await db
    .select({ firstName: users.firstName, lastName: users.lastName, profileImageUrl: users.profileImageUrl })
    .from(users)
    .where(eq(users.id, authorId))
    .limit(1);
  if (!u) return null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || "كاتب رأي";
  return { name, imageUrl: u.profileImageUrl ?? null };
}

async function loadExtrasRow(articleId: string) {
  const [row] = await db.select().from(opinionArticleExtras).where(eq(opinionArticleExtras.articleId, articleId)).limit(1);
  return row ?? null;
}

/** ينشئ استطلاع «أوافق / لا أوافق» مرة واحدة للمقال (قفل استشاري يمنع التكرار). */
export async function ensureAgreePoll(articleId: string, createdBy: string | null): Promise<string> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`opinion-agree-poll:${articleId}`}, 0))`);
    const [extras] = await tx.select().from(opinionArticleExtras).where(eq(opinionArticleExtras.articleId, articleId)).limit(1);
    if (extras?.agreePollId) {
      const [exists] = await tx.select({ id: articlePolls.id }).from(articlePolls).where(eq(articlePolls.id, extras.agreePollId)).limit(1);
      if (exists) return exists.id;
    }
    const [poll] = await tx
      .insert(articlePolls)
      .values({ articleId, question: AGREE_POLL_QUESTION, isActive: true, showResults: true, createdBy })
      .returning({ id: articlePolls.id });
    await tx.insert(pollOptions).values([
      { pollId: poll.id, text: AGREE_OPTION_TEXT, sortOrder: 0, color: AGREE_OPTION_MARK },
      { pollId: poll.id, text: DISAGREE_OPTION_TEXT, sortOrder: 1, color: DISAGREE_OPTION_MARK },
    ]);
    await tx
      .insert(opinionArticleExtras)
      .values({ articleId, agreeVoteEnabled: true, agreePollId: poll.id, updatedBy: createdBy })
      .onConflictDoUpdate({ target: opinionArticleExtras.articleId, set: { agreePollId: poll.id, updatedAt: new Date() } });
    memoryCache.delete(`poll:article:${articleId}`);
    return poll.id;
  });
}

async function loadAgreeState(pollId: string, voter: { userId?: string | null; sessionId?: string | null }): Promise<AgreeState | null> {
  const options = await db
    .select({ id: pollOptions.id, color: pollOptions.color, votesCount: pollOptions.votesCount })
    .from(pollOptions)
    .where(eq(pollOptions.pollId, pollId));
  const agreeOpt = options.find((o) => o.color === AGREE_OPTION_MARK);
  const disagreeOpt = options.find((o) => o.color === DISAGREE_OPTION_MARK);
  if (!agreeOpt || !disagreeOpt) return null;
  let userChoice: AgreeState["userChoice"] = null;
  if (voter.userId || voter.sessionId) {
    const [vote] = await db
      .select({ optionId: pollVotes.optionId })
      .from(pollVotes)
      .where(and(
        eq(pollVotes.pollId, pollId),
        voter.userId ? eq(pollVotes.userId, voter.userId) : eq(pollVotes.sessionId, String(voter.sessionId)),
      ))
      .limit(1);
    if (vote) userChoice = vote.optionId === agreeOpt.id ? "agree" : vote.optionId === disagreeOpt.id ? "disagree" : null;
  }
  const pct = agreeVotePercents(agreeOpt.votesCount, disagreeOpt.votesCount);
  return {
    pollId,
    agreeOptionId: agreeOpt.id,
    disagreeOptionId: disagreeOpt.id,
    agree: agreeOpt.votesCount,
    disagree: disagreeOpt.votesCount,
    agreePct: pct.agree,
    disagreePct: pct.disagree,
    total: pct.total,
    userChoice,
  };
}

export async function canEditOpinionExtras(
  userId: string | null | undefined,
  authorId: string | null,
  hasEditorPermission: () => Promise<boolean>,
): Promise<boolean> {
  if (!userId) return false;
  if (authorId && authorId === userId) return true;
  return hasEditorPermission();
}

export type GetExtrasResult = { ok: true; view: OpinionExtrasView } | { ok: false; status: number; message: string };

export async function getOpinionExtras(
  articleId: string,
  viewer: {
    userId?: string | null;
    /** هوية المصوّت المجهول كما في مسار التصويت (كوكي، ترويسة، أو بصمة العنوان). */
    sessionIdFor: (pollId: string) => string;
    isEditor: () => Promise<boolean>;
  },
): Promise<GetExtrasResult> {
  const article = await loadOpinionArticle(articleId);
  if (!article) return { ok: false, status: 404, message: "مقال الرأي غير موجود" };
  const canEdit = await canEditOpinionExtras(viewer.userId, article.authorId, viewer.isEditor);
  const isPublic = isArticlePubliclyVisible(article);
  if (!isPublic && !canEdit) return { ok: false, status: 404, message: "مقال الرأي غير موجود" };

  const row = await loadExtrasRow(articleId);
  let agree: AgreeState | null = null;
  if (row?.agreeVoteEnabled) {
    // الاستطلاع يُنشأ عند أول عرض علني فقط، لا في معاينة المسودة.
    const pollId = row.agreePollId ?? (isPublic ? await ensureAgreePoll(articleId, article.authorId) : null);
    agree = pollId
      ? await loadAgreeState(pollId, { userId: viewer.userId, sessionId: viewer.userId ? null : viewer.sessionIdFor(pollId) })
      : null;
  }
  return {
    ok: true,
    view: {
      articleId,
      canEdit,
      pullQuote: row?.pullQuote ?? null,
      agreeVoteEnabled: Boolean(row?.agreeVoteEnabled),
      author: await loadAuthor(article.authorId),
      agree,
      quoteCardUrl: row?.pullQuote ? `/api/opinion-extras/${articleId}/quote-card.png` : null,
    },
  };
}

export async function saveOpinionExtras(
  articleId: string,
  input: { pullQuote?: string | null; agreeVoteEnabled?: boolean },
  user: { id: string; isEditor: () => Promise<boolean> },
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const article = await loadOpinionArticle(articleId);
  if (!article) return { ok: false, status: 404, message: "مقال الرأي غير موجود" };
  if (!(await canEditOpinionExtras(user.id, article.authorId, user.isEditor))) {
    return { ok: false, status: 403, message: "تعديل هذا المقال لكاتبه وفريق التحرير" };
  }
  const patch: Partial<typeof opinionArticleExtras.$inferInsert> = { updatedBy: user.id, updatedAt: new Date() };
  if (input.pullQuote !== undefined) {
    const v = validatePullQuote(input.pullQuote);
    if (!v.ok) return { ok: false, status: 400, message: v.message };
    patch.pullQuote = v.value;
  }
  if (input.agreeVoteEnabled !== undefined) patch.agreeVoteEnabled = input.agreeVoteEnabled;

  const [saved] = await db
    .insert(opinionArticleExtras)
    .values({ articleId, ...patch })
    .onConflictDoUpdate({ target: opinionArticleExtras.articleId, set: patch })
    .returning();

  // الإيقاف يُخفي الاستطلاع ويحفظ أصواته؛ إعادة التفعيل تعيده كما كان.
  if (saved.agreePollId && input.agreeVoteEnabled !== undefined) {
    await db.update(articlePolls).set({ isActive: input.agreeVoteEnabled, updatedAt: new Date() }).where(eq(articlePolls.id, saved.agreePollId));
  }
  memoryCache.delete(`poll:article:${articleId}`);
  return { ok: true };
}

/** بيانات بطاقة الصورة: للمقال المنشور الذي له جملة فقط. */
export async function getQuoteCardData(articleId: string): Promise<{
  quote: string;
  authorName: string;
  authorImageUrl: string | null;
  articleTitle: string;
  updatedAt: Date;
} | null> {
  const article = await loadOpinionArticle(articleId);
  if (!article || !isArticlePubliclyVisible(article)) return null;
  const row = await loadExtrasRow(articleId);
  if (!row?.pullQuote) return null;
  const author = await loadAuthor(article.authorId);
  return {
    quote: row.pullQuote,
    authorName: author?.name ?? "كاتب رأي",
    authorImageUrl: author?.imageUrl ?? null,
    articleTitle: article.title,
    updatedAt: row.updatedAt,
  };
}

// ── تغيير الموعد مرة واحدة ──

export async function listWriterReschedules(writerId: string): Promise<Array<{ articleId: string; fromAt: string; toAt: string; createdAt: string }>> {
  const rows = await db.select().from(opinionWriterReschedules).where(eq(opinionWriterReschedules.writerId, writerId));
  return rows.map((r) => ({
    articleId: r.articleId,
    fromAt: r.fromAt.toISOString(),
    toAt: r.toAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));
}

class RescheduleStateChanged extends Error {}

export async function rescheduleOpinionArticleOnce(
  writerId: string,
  articleId: string,
  target: Date | null,
  now: Date = new Date(),
): Promise<{ ok: true; fromAt: Date; toAt: Date; title: string } | { ok: false; status: number; message: string }> {
  const article = await loadOpinionArticle(articleId);
  if (!article || article.authorId !== writerId) return { ok: false, status: 404, message: "المقال غير موجود في مقالاتك" };

  const [used] = await db
    .select({ articleId: opinionWriterReschedules.articleId })
    .from(opinionWriterReschedules)
    .where(eq(opinionWriterReschedules.articleId, articleId))
    .limit(1);
  const eligibility = rescheduleEligibility({
    status: article.status,
    scheduledAt: article.scheduledAt,
    alreadyUsed: Boolean(used),
    nowMs: now.getTime(),
  });
  if (!eligibility.canReschedule) {
    return { ok: false, status: 409, message: RESCHEDULE_REASON_LABELS[eligibility.reason] };
  }
  const fromAt = article.scheduledAt!;
  const targetError = rescheduleTargetError(target, fromAt.getTime(), now.getTime());
  if (targetError) return { ok: false, status: 400, message: targetError };
  const toAt = target!;

  const conflicts = await findWriterGapConflicts(articleId, writerId, toAt);
  if (conflicts.length > 0) {
    return { ok: false, status: 409, message: "هذا الموعد قريب من مقال آخر لك (الفاصل أسبوع تقريبًا). اختر موعدًا أبعد." };
  }

  const result = await db
    .transaction(async (tx) => {
      const inserted = await tx
        .insert(opinionWriterReschedules)
        .values({ articleId, writerId, fromAt, toAt })
        .onConflictDoNothing()
        .returning({ articleId: opinionWriterReschedules.articleId });
      if (inserted.length === 0) return "used" as const;
      // ما زال مجدولًا ولم يُنشر أثناء الطلب؟ وإلا نتراجع عن تسجيل الاستخدام
      const updated = await tx
        .update(articles)
        .set({ scheduledAt: toAt, updatedAt: new Date() })
        .where(and(eq(articles.id, articleId), eq(articles.status, "scheduled")))
        .returning({ id: articles.id });
      if (updated.length === 0) throw new RescheduleStateChanged();
      return "ok" as const;
    })
    .catch((err: unknown) => {
      if (err instanceof RescheduleStateChanged) return "changed" as const;
      throw err;
    });

  if (result === "used") return { ok: false, status: 409, message: RESCHEDULE_REASON_LABELS.already_used };
  if (result === "changed") return { ok: false, status: 409, message: "تغيّرت حالة المقال أثناء الطلب، حدّث الصفحة" };
  return { ok: true, fromAt, toAt, title: article.title };
}

