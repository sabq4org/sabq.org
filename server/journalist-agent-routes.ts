import { Router, Request, Response } from "express";
import { db } from "./db";
import { journalistTasks, insertJournalistTaskSchema, JournalistTask } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { executeJournalistTask } from "./journalist-agent-ai";

const router = Router();

/**
 * Transform backend JournalistTask to frontend-compatible format
 * Maps: progressStep (0-5) → progress (0-100%), progress text → currentStep, results → result
 */
function transformTaskForFrontend(task: JournalistTask) {
  return {
    ...task,
    // Map progressStep (0-5) to percentage (0-100)
    progress: Math.round((task.progressStep / 5) * 100),
    // Map progress text to currentStep
    currentStep: task.progress,
    // Map results to result
    result: task.results,
  };
}

// Create a new journalist task
router.post("/api/journalist-tasks", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ message: "غير مصرح" });
      return;
    }

    // Validate request body
    const validatedData = insertJournalistTaskSchema.parse({
      ...req.body,
      userId: user.id,
    });

    console.log(`📝 [Journalist Agent API] Creating new task for user ${user.id}`);

    // Insert task into database
    const [newTask] = await db
      .insert(journalistTasks)
      .values(validatedData)
      .returning();

    console.log(`✅ [Journalist Agent API] Task created: ${newTask.id}`);

    // Automatically start execution in background
    console.log(`🚀 [Journalist Agent API] Auto-executing task ${newTask.id}`);
    executeJournalistTask(newTask.id, newTask.prompt).catch((error) => {
      console.error(`❌ [Journalist Agent API] Task ${newTask.id} auto-execution error:`, error);
    });

    res.status(201).json(transformTaskForFrontend(newTask));
  } catch (error) {
    console.error("[Journalist Agent API] Error creating task:", error);
    res.status(400).json({
      message: error instanceof Error ? error.message : "فشل إنشاء المهمة",
    });
  }
});

// Get all journalist tasks for current user
router.get("/api/journalist-tasks", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ message: "غير مصرح" });
      return;
    }

    const tasks = await db
      .select()
      .from(journalistTasks)
      .where(eq(journalistTasks.userId, user.id))
      .orderBy(desc(journalistTasks.createdAt));

    res.json(tasks.map(transformTaskForFrontend));
  } catch (error) {
    console.error("[Journalist Agent API] Error fetching tasks:", error);
    res.status(500).json({ message: "فشل جلب المهام" });
  }
});

// Get recent journalist tasks (last 10) for current user
router.get("/api/journalist-tasks/recent", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ message: "غير مصرح" });
      return;
    }

    const tasks = await db
      .select()
      .from(journalistTasks)
      .where(eq(journalistTasks.userId, user.id))
      .orderBy(desc(journalistTasks.createdAt))
      .limit(10);

    res.json(tasks.map(transformTaskForFrontend));
  } catch (error) {
    console.error("[Journalist Agent API] Error fetching recent tasks:", error);
    res.status(500).json({ message: "فشل جلب المهام الأخيرة" });
  }
});

// Get a specific journalist task
router.get("/api/journalist-tasks/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ message: "غير مصرح" });
      return;
    }

    const { id } = req.params;

    const [task] = await db
      .select()
      .from(journalistTasks)
      .where(eq(journalistTasks.id, id));

    if (!task) {
      res.status(404).json({ message: "المهمة غير موجودة" });
      return;
    }

    // Ensure user owns the task
    if (task.userId !== user.id) {
      res.status(403).json({ message: "غير مصرح بالوصول إلى هذه المهمة" });
      return;
    }

    res.json(transformTaskForFrontend(task));
  } catch (error) {
    console.error("[Journalist Agent API] Error fetching task:", error);
    res.status(500).json({ message: "فشل جلب المهمة" });
  }
});

// Execute a journalist task
router.post("/api/journalist-tasks/:id/execute", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ message: "غير مصرح" });
      return;
    }

    const { id } = req.params;

    // Get the task
    const [task] = await db
      .select()
      .from(journalistTasks)
      .where(eq(journalistTasks.id, id));

    if (!task) {
      res.status(404).json({ message: "المهمة غير موجودة" });
      return;
    }

    // Ensure user owns the task
    if (task.userId !== user.id) {
      res.status(403).json({ message: "غير مصرح بالوصول إلى هذه المهمة" });
      return;
    }

    // Check if task is already processing or completed
    if (task.status === "processing") {
      res.status(400).json({ message: "المهمة قيد التنفيذ حالياً" });
      return;
    }

    if (task.status === "completed") {
      res.status(400).json({ message: "المهمة مكتملة بالفعل" });
      return;
    }

    console.log(`🚀 [Journalist Agent API] Executing task ${id}`);

    // Execute task asynchronously
    executeJournalistTask(id, task.prompt).catch((error) => {
      console.error(`❌ [Journalist Agent API] Task ${id} execution error:`, error);
    });

    res.json({ message: "بدأ تنفيذ المهمة", taskId: id });
  } catch (error) {
    console.error("[Journalist Agent API] Error executing task:", error);
    res.status(500).json({ message: "فشل تنفيذ المهمة" });
  }
});

// Delete a journalist task
router.delete("/api/journalist-tasks/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ message: "غير مصرح" });
      return;
    }

    const { id } = req.params;

    // Get the task first to verify ownership
    const [task] = await db
      .select()
      .from(journalistTasks)
      .where(eq(journalistTasks.id, id));

    if (!task) {
      res.status(404).json({ message: "المهمة غير موجودة" });
      return;
    }

    // Ensure user owns the task
    if (task.userId !== user.id) {
      res.status(403).json({ message: "غير مصرح بحذف هذه المهمة" });
      return;
    }

    // Delete the task
    await db.delete(journalistTasks).where(eq(journalistTasks.id, id));

    console.log(`🗑️ [Journalist Agent API] Task ${id} deleted`);

    res.json({ message: "تم حذف المهمة بنجاح" });
  } catch (error) {
    console.error("[Journalist Agent API] Error deleting task:", error);
    res.status(500).json({ message: "فشل حذف المهمة" });
  }
});

export default router;
