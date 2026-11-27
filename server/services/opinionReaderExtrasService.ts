/**
 * إضافات مقال الرأي: جملة المقال و«أوافق / لا أوافق».
 * المنطق الخالص في shared/opinionReaderExtras.ts. الأصوات تمر بمسار
 * الاستطلاعات القائم (POST /api/polls/:pollId/vote) على استطلاع بخيارين.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  articles,
  articlePolls,
  opinionArticleExtras,
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
  validatePullQuote,
} from "@shared/opinionReaderExtras";
import { memoryCache, withCache } from "../memoryCache";
import { anonVoteCapReached } from "./pollVoteGuard";

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

/**
 * الجزء العام من القراءة (المقال والإضافات والكاتب) مشترك بين كل القرّاء،
 * فيُخزَّن 30 ثانية بجلب واحد لكل مقال (REVIEW.md C2). اختيار القارئ وصلاحيته
 * والأعداد تُقرأ لكل طلب. الحفظ وإنشاء الاستطلاع يُبطلانه على هذه النسخة؛
 * النسخة الأخرى تلحق خلال 30 ثانية.
 */
const PUBLIC_BASE_TTL_MS = 30_000;
const publicBaseKey = (articleId: string) => `opinion-extras:base:${articleId}`;

function loadPublicBase(articleId: string) {
  return withCache(publicBaseKey(articleId), PUBLIC_BASE_TTL_MS, async () => {
    const article = await loadOpinionArticle(articleId);
    if (!article) return { article: null, row: null, author: null };
    const [row, author] = await Promise.all([loadExtrasRow(articleId), loadAuthor(article.authorId)]);
    return { article, row, author };
  });
}

function invalidatePublicBase(articleId: string) {
  memoryCache.delete(publicBaseKey(articleId));
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
    invalidatePublicBase(articleId);
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
  const base = await loadPublicBase(articleId);
  const article = base.article;
  if (!article) return { ok: false, status: 404, message: "مقال الرأي غير موجود" };
  const canEdit = await canEditOpinionExtras(viewer.userId, article.authorId, viewer.isEditor);
  const isPublic = isArticlePubliclyVisible(article);
  if (!isPublic && !canEdit) return { ok: false, status: 404, message: "مقال الرأي غير موجود" };

  const row = base.row;
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
      author: base.author,
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
  invalidatePublicBase(articleId);
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

export type AgreeVoteResult =
  | { ok: true; agree: AgreeState }
  | { ok: false; status: number; message: string };

/**
 * صوت «أوافق / لا أوافق» من التطبيق (/api/v1). القواعد نفسها في
 * POST /api/polls/:pollId/vote: صوت واحد لكل مصوّت، قفل استشاري على
 * (الاستطلاع، المصوّت)، وسقف للأصوات المجهولة من العنوان الواحد.
 */
export async function castAgreeVote(
  articleId: string,
  choice: "agree" | "disagree",
  voter: { userId: string | null; sessionIdFor: (pollId: string) => string; ip: string },
): Promise<AgreeVoteResult> {
  const article = await loadOpinionArticle(articleId);
  if (!article || !isArticlePubliclyVisible(article)) return { ok: false, status: 404, message: "مقال الرأي غير موجود" };
  const row = await loadExtrasRow(articleId);
  if (!row?.agreeVoteEnabled) return { ok: false, status: 404, message: "التصويت غير مفعّل لهذا المقال" };
  const pollId = row.agreePollId ?? (await ensureAgreePoll(articleId, article.authorId));
  const sessionId = voter.userId ? null : voter.sessionIdFor(pollId);
  const before = await loadAgreeState(pollId, { userId: voter.userId, sessionId });
  if (!before) return { ok: false, status: 404, message: "التصويت غير متاح" };
  if (before.userChoice) return { ok: true, agree: before };

  if (!voter.userId) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(pollVotes)
      .where(and(eq(pollVotes.pollId, pollId), eq(pollVotes.ipAddress, voter.ip), isNull(pollVotes.userId)));
    if (anonVoteCapReached(Number(count))) return { ok: false, status: 429, message: "تم بلوغ حد التصويت من هذا الاتصال" };
  }

  const optionId = choice === "agree" ? before.agreeOptionId : before.disagreeOptionId;
  const voterKey = voter.userId ? `u:${voter.userId}` : `s:${sessionId}`;
  const voteCondition = voter.userId ? eq(pollVotes.userId, voter.userId) : eq(pollVotes.sessionId, String(sessionId));
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`poll-vote:${pollId}:${voterKey}`}, 0))`);
    const [already] = await tx
      .select({ id: pollVotes.id })
      .from(pollVotes)
      .where(and(eq(pollVotes.pollId, pollId), voteCondition))
      .limit(1);
    if (already) return;
    const inserted = await tx
      .insert(pollVotes)
      .values({ pollId, optionId, userId: voter.userId, sessionId: sessionId ?? voter.sessionIdFor(pollId), ipAddress: voter.ip })
      .onConflictDoNothing()
      .returning({ id: pollVotes.id });
    if (inserted.length === 0) return;
    await tx
      .update(pollOptions)
      .set({ votesCount: sql`${pollOptions.votesCount} + 1` })
      .where(and(eq(pollOptions.id, optionId), eq(pollOptions.pollId, pollId)));
    await tx
      .update(articlePolls)
      .set({ totalVotes: sql`${articlePolls.totalVotes} + 1`, updatedAt: new Date() })
      .where(eq(articlePolls.id, pollId));
  });
  memoryCache.delete(`poll:article:${articleId}`);
  const after = await loadAgreeState(pollId, { userId: voter.userId, sessionId });
  return after ? { ok: true, agree: after } : { ok: false, status: 500, message: "تعذر قراءة نتيجة التصويت" };
}
