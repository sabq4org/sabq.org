import { Router } from "express";
import { isAuthenticated } from "../auth";
import { db } from "../db";
import { articles } from "@shared/schema";
import { eq } from "drizzle-orm";
import { generateSmartInsights, chatWithContext } from "../services/smartInsightsService";

const router = Router();

router.post("/api/articles/:id/smart-insights", async (req: any, res) => {
  try {
    const articleId = req.params.id;
    
    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        content: articles.content,
        status: articles.status
      })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!article) {
      return res.status(404).json({ message: "المقال غير موجود" });
    }

    if (article.status !== "published") {
      return res.status(403).json({ message: "التحليل الذكي متاح للمقالات المنشورة فقط" });
    }

    const result = await generateSmartInsights(
      article.id,
      article.title,
      article.content
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error("❌ [Smart Insights] Error:", error);
    res.status(500).json({ 
      success: false,
      message: "فشل في توليد التحليل الذكي. يرجى المحاولة مرة أخرى",
      error: error.message 
    });
  }
});

router.post("/api/articles/:id/smart-insights/chat", async (req: any, res) => {
  try {
    const articleId = req.params.id;
    const { message, chatHistory = [] } = req.body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ message: "الرجاء إدخال سؤال صحيح" });
    }

    if (message.length > 1000) {
      return res.status(400).json({ message: "السؤال طويل جداً. الحد الأقصى 1000 حرف" });
    }

    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        content: articles.content,
        status: articles.status
      })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!article) {
      return res.status(404).json({ message: "المقال غير موجود" });
    }

    if (article.status !== "published") {
      return res.status(403).json({ message: "المحادثة الذكية متاحة للمقالات المنشورة فقط" });
    }

    const result = await chatWithContext(
      article.id,
      article.title,
      article.content,
      message.trim(),
      chatHistory
    );

    res.json({
      success: true,
      data: {
        response: result.response,
        model: result.model
      }
    });
  } catch (error: any) {
    console.error("❌ [Smart Insights Chat] Error:", error);
    res.status(500).json({ 
      success: false,
      message: "فشل في الحصول على إجابة. يرجى المحاولة مرة أخرى",
      error: error.message 
    });
  }
});

export default router;
