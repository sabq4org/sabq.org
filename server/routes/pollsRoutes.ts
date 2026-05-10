import { Router, Request, Response } from "express";
import { db } from "../db";
import { articlePolls, pollOptions, pollVotes, articles } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requirePermission } from "../rbac";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import OpenAI from "openai";
import { withCache, CACHE_TTL, memoryCache } from "../memoryCache";

const router = Router();
const openai = new OpenAI();

// Get poll for an article (public)
router.get("/article/:articleId", async (req: Request, res: Response) => {
  try {
    const { articleId } = req.params;
    const sessionId = req.cookies?.sessionId || req.headers['x-session-id'] as string;
    const userId = (req as any).user?.id;

    // Cache the poll structure (no user-specific data) for 1 minute
    const pollCacheKey = `poll:article:${articleId}`;
    const poll = await withCache(pollCacheKey, 60_000, () =>
      db.query.articlePolls.findFirst({
        where: and(
          eq(articlePolls.articleId, articleId),
          eq(articlePolls.isActive, true)
        ),
        with: {
          options: {
            orderBy: [pollOptions.sortOrder],
          },
        },
      })
    );

    if (!poll) {
      return res.json(null);
    }

    // Check if user already voted
    let userVote = null;
    if (userId || sessionId) {
      const voteCondition = userId 
        ? eq(pollVotes.userId, userId)
        : eq(pollVotes.sessionId, sessionId);
      
      const existingVote = await db.query.pollVotes.findFirst({
        where: and(
          eq(pollVotes.pollId, poll.id),
          voteCondition
        ),
      });
      
      if (existingVote) {
        userVote = existingVote.optionId;
      }
    }

    // Calculate percentages
    const totalVotes = poll.totalVotes || 0;
    const optionsWithPercentage = poll.options.map(opt => ({
      ...opt,
      percentage: totalVotes > 0 ? Math.round((opt.votesCount / totalVotes) * 100) : 0,
    }));

    res.json({
      ...poll,
      options: optionsWithPercentage,
      userVote,
      hasVoted: !!userVote,
    });
  } catch (error) {
    console.error("[Polls] Error fetching poll:", error);
    res.status(500).json({ message: "حدث خطأ أثناء جلب الاستطلاع" });
  }
});

// Vote on a poll (public)
router.post("/:pollId/vote", async (req: Request, res: Response) => {
  try {
    const { pollId } = req.params;
    const { optionId } = req.body;
    const userId = (req as any).user?.id;
    const sessionId = req.cookies?.sessionId || req.headers['x-session-id'] as string || `anon-${Date.now()}`;
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip;

    if (!optionId) {
      return res.status(400).json({ message: "يرجى اختيار إجابة" });
    }

    // Check if poll exists and is active
    const poll = await db.query.articlePolls.findFirst({
      where: and(
        eq(articlePolls.id, pollId),
        eq(articlePolls.isActive, true)
      ),
    });

    if (!poll) {
      return res.status(404).json({ message: "الاستطلاع غير موجود أو منتهي" });
    }

    // Check if already voted
    const voteCondition = userId 
      ? eq(pollVotes.userId, userId)
      : eq(pollVotes.sessionId, sessionId);
    
    const existingVote = await db.query.pollVotes.findFirst({
      where: and(
        eq(pollVotes.pollId, pollId),
        voteCondition
      ),
    });

    if (existingVote && !poll.allowMultipleVotes) {
      return res.status(400).json({ message: "لقد قمت بالتصويت مسبقاً" });
    }

    // Record the vote
    await db.insert(pollVotes).values({
      pollId,
      optionId,
      userId: userId || null,
      sessionId,
      ipAddress,
    });

    // Update vote counts
    await db.update(pollOptions)
      .set({ votesCount: sql`${pollOptions.votesCount} + 1` })
      .where(eq(pollOptions.id, optionId));

    await db.update(articlePolls)
      .set({ 
        totalVotes: sql`${articlePolls.totalVotes} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(articlePolls.id, pollId));

    // Invalidate poll cache for this article so vote counts refresh
    if (poll.articleId) {
      memoryCache.delete(`poll:article:${poll.articleId}`);
    }

    // Fetch updated poll
    const updatedPoll = await db.query.articlePolls.findFirst({
      where: eq(articlePolls.id, pollId),
      with: {
        options: {
          orderBy: [pollOptions.sortOrder],
        },
      },
    });

    if (!updatedPoll) {
      return res.status(404).json({ message: "خطأ في تحديث الاستطلاع" });
    }

    const totalVotes = updatedPoll.totalVotes || 0;
    const optionsWithPercentage = updatedPoll.options.map(opt => ({
      ...opt,
      percentage: totalVotes > 0 ? Math.round((opt.votesCount / totalVotes) * 100) : 0,
    }));

    res.json({
      ...updatedPoll,
      options: optionsWithPercentage,
      userVote: optionId,
      hasVoted: true,
    });
  } catch (error) {
    console.error("[Polls] Error voting:", error);
    res.status(500).json({ message: "حدث خطأ أثناء التصويت" });
  }
});

// Admin: Create poll for article
router.post("/", requireAuth, requirePermission(PERMISSION_CODES.ARTICLES_POLLS), async (req: any, res: Response) => {
  try {
    const { articleId, question, options, expiresAt } = req.body;
    const userId = req.user.id;

    if (!articleId || !question || !options || options.length < 2) {
      return res.status(400).json({ message: "يرجى إدخال السؤال وخيارين على الأقل" });
    }

    // Check if article already has a poll
    const existingPoll = await db.query.articlePolls.findFirst({
      where: eq(articlePolls.articleId, articleId),
    });

    if (existingPoll) {
      return res.status(400).json({ message: "يوجد استطلاع مرتبط بهذا المقال مسبقاً" });
    }

    // Create poll
    const [newPoll] = await db.insert(articlePolls).values({
      articleId,
      question,
      createdBy: userId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }).returning();

    // Create options
    const optionValues = options.map((text: string, index: number) => ({
      pollId: newPoll.id,
      text,
      sortOrder: index,
    }));

    await db.insert(pollOptions).values(optionValues);

    // Fetch complete poll
    const completePoll = await db.query.articlePolls.findFirst({
      where: eq(articlePolls.id, newPoll.id),
      with: {
        options: {
          orderBy: [pollOptions.sortOrder],
        },
      },
    });

    memoryCache.delete(`poll:article:${articleId}`);
    res.status(201).json(completePoll);
  } catch (error) {
    console.error("[Polls] Error creating poll:", error);
    res.status(500).json({ message: "حدث خطأ أثناء إنشاء الاستطلاع" });
  }
});

// Admin: Update poll
router.patch("/:pollId", requireAuth, requirePermission(PERMISSION_CODES.ARTICLES_POLLS), async (req: any, res: Response) => {
  try {
    const { pollId } = req.params;
    const { question, isActive, options } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (question !== undefined) updateData.question = question;
    if (isActive !== undefined) updateData.isActive = isActive;

    await db.update(articlePolls)
      .set(updateData)
      .where(eq(articlePolls.id, pollId));

    // Update options if provided
    if (options && Array.isArray(options)) {
      for (const opt of options) {
        if (opt.id) {
          await db.update(pollOptions)
            .set({ text: opt.text, sortOrder: opt.sortOrder })
            .where(eq(pollOptions.id, opt.id));
        }
      }
    }

    const updatedPoll = await db.query.articlePolls.findFirst({
      where: eq(articlePolls.id, pollId),
      with: {
        options: {
          orderBy: [pollOptions.sortOrder],
        },
      },
    });

    if (updatedPoll?.articleId) {
      memoryCache.delete(`poll:article:${updatedPoll.articleId}`);
    }
    res.json(updatedPoll);
  } catch (error) {
    console.error("[Polls] Error updating poll:", error);
    res.status(500).json({ message: "حدث خطأ أثناء تحديث الاستطلاع" });
  }
});

// Admin: Delete poll
router.delete("/:pollId", requireAuth, requirePermission(PERMISSION_CODES.ARTICLES_POLLS), async (req: any, res: Response) => {
  try {
    const { pollId } = req.params;

    const existing = await db.query.articlePolls.findFirst({ where: eq(articlePolls.id, pollId) });
    await db.delete(articlePolls).where(eq(articlePolls.id, pollId));

    if (existing?.articleId) {
      memoryCache.delete(`poll:article:${existing.articleId}`);
    }
    res.json({ message: "تم حذف الاستطلاع بنجاح" });
  } catch (error) {
    console.error("[Polls] Error deleting poll:", error);
    res.status(500).json({ message: "حدث خطأ أثناء حذف الاستطلاع" });
  }
});

// AI: Generate poll from article content
router.post("/generate", requireAuth, requirePermission(PERMISSION_CODES.ARTICLES_POLLS), async (req: any, res: Response) => {
  try {
    const { articleId, content, title } = req.body;

    if (!content && !articleId) {
      return res.status(400).json({ message: "يرجى تقديم محتوى المقال أو معرف المقال" });
    }

    let articleContent = content;
    let articleTitle = title;

    // If articleId provided, fetch article content
    if (articleId && !content) {
      const article = await db.query.articles.findFirst({
        where: eq(articles.id, articleId),
        columns: { content: true, title: true },
      });
      if (article) {
        articleContent = article.content;
        articleTitle = article.title;
      }
    }

    if (!articleContent) {
      return res.status(400).json({ message: "لم يتم العثور على محتوى المقال" });
    }

    // Strip HTML tags for cleaner AI input
    const cleanContent = articleContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const truncatedContent = cleanContent.slice(0, 3000);

    const prompt = `أنت خبير في إنشاء استطلاعات رأي تفاعلية للمقالات الإخبارية العربية.

المقال:
العنوان: ${articleTitle || 'بدون عنوان'}
المحتوى: ${truncatedContent}

قم بإنشاء استطلاع رأي واحد مناسب لهذا المقال. يجب أن يكون:
1. السؤال واضح ومباشر ويثير اهتمام القراء
2. الخيارات متوازنة (2-4 خيارات)
3. الخيارات قصيرة ومختصرة (كلمة إلى 4 كلمات لكل خيار)
4. السؤال يبدأ بـ "هل" أو "ما رأيك في" أو مشابه

أجب بصيغة JSON فقط:
{
  "question": "السؤال هنا",
  "options": ["الخيار 1", "الخيار 2", "الخيار 3"]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 300,
      response_format: { type: "json_object" },
    });

    const aiResponse = response.choices[0]?.message?.content;
    if (!aiResponse) {
      return res.status(500).json({ message: "فشل توليد الاستطلاع" });
    }

    const pollData = JSON.parse(aiResponse);

    if (!pollData.question || !pollData.options || pollData.options.length < 2) {
      return res.status(500).json({ message: "الاستطلاع المولد غير صالح" });
    }

    res.json({
      question: pollData.question,
      options: pollData.options.slice(0, 4),
    });
  } catch (error) {
    console.error("[Polls] Error generating AI poll:", error);
    res.status(500).json({ message: "حدث خطأ أثناء توليد الاستطلاع" });
  }
});

// Admin: Get all polls
router.get("/", requireAuth, requirePermission(PERMISSION_CODES.ARTICLES_POLLS), async (req: any, res: Response) => {
  try {
    const polls = await db.query.articlePolls.findMany({
      with: {
        options: {
          orderBy: [pollOptions.sortOrder],
        },
        article: {
          columns: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: [desc(articlePolls.createdAt)],
    });

    res.json(polls);
  } catch (error) {
    console.error("[Polls] Error fetching polls:", error);
    res.status(500).json({ message: "حدث خطأ أثناء جلب الاستطلاعات" });
  }
});

export default router;
