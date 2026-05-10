import { Router, Request, Response } from "express";
import { db } from "./db";
import { articleQuizzes, quizQuestions, quizResponses, articles } from "@shared/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { requireRole } from "./rbac";
import { z } from "zod";

const router = Router();

// Schema for creating/updating quiz
const createQuizSchema = z.object({
  title: z.string().min(1, "العنوان مطلوب"),
  description: z.string().optional(),
  isEnabled: z.boolean().default(true),
  passingScore: z.number().min(0).max(100).default(70),
  showCorrectAnswers: z.boolean().default(true),
  allowRetake: z.boolean().default(true),
  questions: z.array(z.object({
    question: z.string().min(1, "السؤال مطلوب"),
    choices: z.array(z.string().min(1)).min(2, "يجب إضافة خيارين على الأقل"),
    correctIndex: z.number().min(0),
    explanation: z.string().optional(),
  })).min(1, "يجب إضافة سؤال واحد على الأقل"),
});

const submitQuizSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string(),
    selectedIndex: z.number(),
  })),
  timeSpent: z.number().optional(),
  sessionId: z.string().optional(),
});

// ============================================
// ADMIN ENDPOINTS
// ============================================

// Create or update quiz for an article
router.post("/api/articles/:articleId/quiz", requireRole("editor"), async (req: Request, res: Response) => {
  try {
    const { articleId } = req.params;
    const userId = (req.user as any)?.id;

    // Validate article exists
    const [article] = await db.select().from(articles).where(eq(articles.id, articleId));
    if (!article) {
      return res.status(404).json({ error: "المقال غير موجود" });
    }

    const parsed = createQuizSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const { questions, ...quizData } = parsed.data;

    // Check if quiz already exists
    const [existingQuiz] = await db.select().from(articleQuizzes).where(eq(articleQuizzes.articleId, articleId));

    let quizId: string;

    if (existingQuiz) {
      // Update existing quiz
      await db.update(articleQuizzes)
        .set({ ...quizData, updatedAt: new Date() })
        .where(eq(articleQuizzes.id, existingQuiz.id));
      quizId = existingQuiz.id;

      // Delete old questions
      await db.delete(quizQuestions).where(eq(quizQuestions.quizId, quizId));
    } else {
      // Create new quiz
      const [newQuiz] = await db.insert(articleQuizzes)
        .values({
          articleId,
          ...quizData,
          createdBy: userId,
        })
        .returning();
      quizId = newQuiz.id;
    }

    // Insert questions
    for (let i = 0; i < questions.length; i++) {
      await db.insert(quizQuestions).values({
        quizId,
        question: questions[i].question,
        choices: questions[i].choices,
        correctIndex: questions[i].correctIndex,
        explanation: questions[i].explanation,
        order: i,
      });
    }

    // Fetch complete quiz with questions
    const quiz = await getQuizWithQuestions(quizId);
    res.json(quiz);
  } catch (error) {
    console.error("[Quiz] Error creating/updating quiz:", error);
    res.status(500).json({ error: "حدث خطأ أثناء حفظ الاختبار" });
  }
});

// Get quiz for an article (admin - includes correct answers)
router.get("/api/admin/articles/:articleId/quiz", requireRole("editor"), async (req: Request, res: Response) => {
  try {
    const { articleId } = req.params;

    const [quiz] = await db.select().from(articleQuizzes).where(eq(articleQuizzes.articleId, articleId));
    if (!quiz) {
      return res.status(404).json({ error: "لا يوجد اختبار لهذا المقال" });
    }

    const questions = await db.select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quiz.id))
      .orderBy(asc(quizQuestions.order));

    res.json({ ...quiz, questions });
  } catch (error) {
    console.error("[Quiz] Error fetching admin quiz:", error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب الاختبار" });
  }
});

// Delete quiz
router.delete("/api/articles/:articleId/quiz", requireRole("editor"), async (req: Request, res: Response) => {
  try {
    const { articleId } = req.params;

    const result = await db.delete(articleQuizzes).where(eq(articleQuizzes.articleId, articleId)).returning();
    if (result.length === 0) {
      return res.status(404).json({ error: "لا يوجد اختبار لحذفه" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("[Quiz] Error deleting quiz:", error);
    res.status(500).json({ error: "حدث خطأ أثناء حذف الاختبار" });
  }
});

// Toggle quiz enabled status
router.patch("/api/articles/:articleId/quiz/toggle", requireRole("editor"), async (req: Request, res: Response) => {
  try {
    const { articleId } = req.params;
    const { isEnabled } = req.body;

    const [updated] = await db.update(articleQuizzes)
      .set({ isEnabled, updatedAt: new Date() })
      .where(eq(articleQuizzes.articleId, articleId))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "لا يوجد اختبار لهذا المقال" });
    }

    res.json(updated);
  } catch (error) {
    console.error("[Quiz] Error toggling quiz:", error);
    res.status(500).json({ error: "حدث خطأ أثناء تحديث حالة الاختبار" });
  }
});

// Get quiz statistics
router.get("/api/admin/articles/:articleId/quiz/stats", requireRole("editor"), async (req: Request, res: Response) => {
  try {
    const { articleId } = req.params;

    const [quiz] = await db.select().from(articleQuizzes).where(eq(articleQuizzes.articleId, articleId));
    if (!quiz) {
      return res.status(404).json({ error: "لا يوجد اختبار لهذا المقال" });
    }

    const responses = await db.select().from(quizResponses).where(eq(quizResponses.quizId, quiz.id));

    const totalResponses = responses.length;
    const passedCount = responses.filter(r => r.passed).length;
    const avgScore = totalResponses > 0 
      ? Math.round(responses.reduce((sum, r) => sum + r.score, 0) / totalResponses)
      : 0;
    const avgTimeSpent = totalResponses > 0
      ? Math.round(responses.filter(r => r.timeSpent).reduce((sum, r) => sum + (r.timeSpent || 0), 0) / responses.filter(r => r.timeSpent).length)
      : 0;

    res.json({
      totalResponses,
      passedCount,
      failedCount: totalResponses - passedCount,
      passRate: totalResponses > 0 ? Math.round((passedCount / totalResponses) * 100) : 0,
      avgScore,
      avgTimeSpent,
    });
  } catch (error) {
    console.error("[Quiz] Error fetching quiz stats:", error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب الإحصائيات" });
  }
});

// ============================================
// PUBLIC ENDPOINTS
// ============================================

// Get quiz for an article (public - without correct answers initially)
router.get("/api/articles/:articleId/quiz", async (req: Request, res: Response) => {
  try {
    const { articleId } = req.params;

    const [quiz] = await db.select().from(articleQuizzes)
      .where(and(
        eq(articleQuizzes.articleId, articleId),
        eq(articleQuizzes.isEnabled, true)
      ));

    if (!quiz) {
      return res.status(404).json({ error: "لا يوجد اختبار لهذا المقال" });
    }

    const questions = await db.select({
      id: quizQuestions.id,
      question: quizQuestions.question,
      choices: quizQuestions.choices,
      order: quizQuestions.order,
    })
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quiz.id))
      .orderBy(asc(quizQuestions.order));

    res.json({
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      passingScore: quiz.passingScore,
      showCorrectAnswers: quiz.showCorrectAnswers,
      allowRetake: quiz.allowRetake,
      questions,
    });
  } catch (error) {
    console.error("[Quiz] Error fetching public quiz:", error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب الاختبار" });
  }
});

// Submit quiz answers
router.post("/api/articles/:articleId/quiz/submit", async (req: Request, res: Response) => {
  try {
    const { articleId } = req.params;
    const userId = (req.user as any)?.id;

    const parsed = submitQuizSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const { answers, timeSpent, sessionId } = parsed.data;

    // Get quiz
    const [quiz] = await db.select().from(articleQuizzes)
      .where(and(
        eq(articleQuizzes.articleId, articleId),
        eq(articleQuizzes.isEnabled, true)
      ));

    if (!quiz) {
      return res.status(404).json({ error: "لا يوجد اختبار لهذا المقال" });
    }

    // Check if user already submitted (if retake not allowed)
    if (!quiz.allowRetake && userId) {
      const [existingResponse] = await db.select()
        .from(quizResponses)
        .where(and(
          eq(quizResponses.quizId, quiz.id),
          eq(quizResponses.userId, userId)
        ));
      
      if (existingResponse) {
        return res.status(400).json({ error: "لقد أجبت على هذا الاختبار مسبقاً" });
      }
    }

    // Get questions with correct answers
    const questions = await db.select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quiz.id));

    // Calculate score
    let correctCount = 0;
    const questionMap = new Map(questions.map(q => [q.id, q]));
    const results: { questionId: string; correct: boolean; correctIndex: number; explanation?: string }[] = [];

    for (const answer of answers) {
      const question = questionMap.get(answer.questionId);
      if (question) {
        const isCorrect = answer.selectedIndex === question.correctIndex;
        if (isCorrect) correctCount++;
        results.push({
          questionId: answer.questionId,
          correct: isCorrect,
          correctIndex: question.correctIndex,
          explanation: question.explanation || undefined,
        });
      }
    }

    const totalQuestions = questions.length;
    const score = Math.round((correctCount / totalQuestions) * 100);
    const passed = score >= quiz.passingScore;

    // Save response
    await db.insert(quizResponses).values({
      quizId: quiz.id,
      userId: userId || null,
      sessionId: userId ? null : sessionId,
      answers,
      score,
      correctCount,
      totalQuestions,
      passed,
      timeSpent,
    });

    res.json({
      score,
      correctCount,
      totalQuestions,
      passed,
      passingScore: quiz.passingScore,
      results: quiz.showCorrectAnswers ? results : undefined,
    });
  } catch (error) {
    console.error("[Quiz] Error submitting quiz:", error);
    res.status(500).json({ error: "حدث خطأ أثناء إرسال الإجابات" });
  }
});

// Check if user has taken quiz
router.get("/api/articles/:articleId/quiz/status", async (req: Request, res: Response) => {
  try {
    const { articleId } = req.params;
    const userId = (req.user as any)?.id;
    const sessionId = req.query.sessionId as string;

    const [quiz] = await db.select().from(articleQuizzes).where(eq(articleQuizzes.articleId, articleId));
    if (!quiz) {
      return res.json({ hasQuiz: false });
    }

    let hasTaken = false;
    let lastScore: number | null = null;

    if (userId) {
      const [response] = await db.select()
        .from(quizResponses)
        .where(and(
          eq(quizResponses.quizId, quiz.id),
          eq(quizResponses.userId, userId)
        ))
        .orderBy(desc(quizResponses.completedAt))
        .limit(1);
      
      if (response) {
        hasTaken = true;
        lastScore = response.score;
      }
    } else if (sessionId) {
      const [response] = await db.select()
        .from(quizResponses)
        .where(and(
          eq(quizResponses.quizId, quiz.id),
          eq(quizResponses.sessionId, sessionId)
        ))
        .orderBy(desc(quizResponses.completedAt))
        .limit(1);
      
      if (response) {
        hasTaken = true;
        lastScore = response.score;
      }
    }

    res.json({
      hasQuiz: quiz.isEnabled,
      hasTaken,
      lastScore,
      allowRetake: quiz.allowRetake,
    });
  } catch (error) {
    console.error("[Quiz] Error checking quiz status:", error);
    res.status(500).json({ error: "حدث خطأ" });
  }
});

// Helper function to get quiz with questions
async function getQuizWithQuestions(quizId: string) {
  const [quiz] = await db.select().from(articleQuizzes).where(eq(articleQuizzes.id, quizId));
  if (!quiz) return null;

  const questions = await db.select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(asc(quizQuestions.order));

  return { ...quiz, questions };
}

export default router;
