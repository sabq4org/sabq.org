// Task management system (نظام إدارة المهام) — tasks, subtasks, comments,
// attachments, activity log. Extracted verbatim from server/routes.ts on
// 2026-06-10 (Milestone-2 extraction #5, audit T2.2). ADR-001-compliant:
// storage-only data access. taskLimiter moved here with the routes; its
// shared building blocks live in ../utils/rateLimiting.
import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { storage } from "../storage";
import {
  requireAuth,
  requirePermission,
  requireAnyPermission,
} from "../rbac";
import { cfKeyGenerator, cfValidate } from "../utils/rateLimiting";
import { upload } from "../utils/uploadMiddleware";
import {
  insertTaskSchema,
  insertSubtaskSchema,
  insertTaskCommentSchema,
  insertTaskAttachmentSchema,
} from "@shared/schema";

const taskLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "تم تجاوز حد طلبات المهام. يرجى المحاولة بعد دقيقة" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: cfValidate,
});

export function registerTaskRoutes(app: Express) {
  // ============================================
  // TASK MANAGEMENT SYSTEM API ENDPOINTS
  // ============================================

  // GET /api/tasks - Get tasks list with filters
  app.get("/api/tasks", taskLimiter, requireAuth, requireAnyPermission('tasks.view_all', 'tasks.view_own'), async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const userPermissions = await storage.getUserPermissions(userId);
      
      const {
        status,
        priority,
        assignedToId,
        createdById,
        department,
        parentTaskId,
        search,
        page = "1",
        limit = "20"
      } = req.query;
      
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const offset = (pageNum - 1) * limitNum;
      
      // Build base filters
      // Normalize parentTaskId: 'null', '', undefined → null
      let normalizedParentTaskId: string | null | undefined;
      if (parentTaskId === 'null' || parentTaskId === '' || parentTaskId === undefined) {
        normalizedParentTaskId = null;
      } else {
        normalizedParentTaskId = parentTaskId as string;
      }
      
      const filters: any = {
        status: status as string,
        priority: priority as string,
        department: department as string,
        parentTaskId: normalizedParentTaskId,
        search: search as string,
        limit: limitNum,
        offset,
      };
      
      // SECURITY: Handle permission-based filtering
      if (!userPermissions.includes('tasks.view_all')) {
        // User has view_own: ALWAYS filter by their ID, ignore query params
        filters.userIdForOwn = userId;
        // Ignore createdById/assignedToId from query to prevent privilege escalation
      } else {
        // User has view_all: Allow explicit filters
        if (assignedToId) {
          filters.assignedToId = assignedToId as string;
        }
        
        if (createdById) {
          filters.createdById = createdById as string;
        }
      }
      
      const result = await storage.getTasks(filters);
      
      const hasMore = result.total > offset + limitNum;
      res.json({
        tasks: result.tasks,
        total: result.total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(result.total / limitNum),
      });
    } catch (error: any) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({ error: 'فشل في جلب المهام' });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/tasks - Create new task
  app.post("/api/tasks", taskLimiter, requireAuth, requirePermission('tasks.create'), async (req, res) => {
    try {
      const userId = (req.user as any).id;
      
      // Validate request body FIRST (before date conversion)
      const validatedData = insertTaskSchema.parse({
        ...req.body,
        createdById: userId,
      });
      
      // THEN convert date strings to Date objects for Drizzle timestamp columns
      const processedData: any = {
        ...validatedData,
        dueDate: validatedData.dueDate ? new Date(validatedData.dueDate as string) : null,
      };
      
      const task = await storage.createTask(processedData);
      
      // Log activity
      await storage.logTaskActivity({
        taskId: task.id,
        userId,
        action: 'task_created',
        changes: { description: 'تم إنشاء المهمة' },
      });
      
      res.status(201).json(task);
    } catch (error: any) {
      console.error('Error creating task:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'بيانات غير صالحة', details: error.errors });
      }
      res.status(500).json({ error: 'فشل في إنشاء المهمة' });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/tasks/statistics - Get task statistics
  app.get("/api/tasks/statistics", taskLimiter, requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const userPermissions = await storage.getUserPermissions(userId);
      
      // SECURITY: Apply same filter as getTasks
      // If user has view_all, get all stats; otherwise get stats for tasks created OR assigned to user
      const stats = await storage.getTaskStatistics(
        userPermissions.includes('tasks.view_all') ? undefined : userId
      );
      
      res.json(stats);
    } catch (error: any) {
      console.error('Error fetching task statistics:', error);
      res.status(500).json({ error: 'فشل في جلب الإحصائيات' });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/tasks/:id - Get task details
  app.get("/api/tasks/:id", taskLimiter, requireAuth, requireAnyPermission('tasks.view_all', 'tasks.view_own'), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.user as any).id;
      const userPermissions = await storage.getUserPermissions(userId);
      
      const task = await storage.getTaskWithDetails(id);
      if (!task) {
        return res.status(404).json({ error: 'المهمة غير موجودة' });
      }
      
      // Check permissions
      if (!userPermissions.includes('tasks.view_all')) {
        if (task.createdById !== userId && task.assignedToId !== userId) {
          return res.status(403).json({ error: 'غير مصرح لك بعرض هذه المهمة' });
        }
      }
      
      res.json(task);
    } catch (error: any) {
      console.error('Error fetching task:', error);
      res.status(500).json({ error: 'فشل في جلب المهمة' });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // PATCH /api/tasks/:id - Update task
  app.patch("/api/tasks/:id", taskLimiter, requireAuth, requireAnyPermission('tasks.edit_any', 'tasks.edit_own'), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.user as any).id;
      const userPermissions = await storage.getUserPermissions(userId);
      
      const task = await storage.getTaskById(id);
      if (!task) {
        return res.status(404).json({ error: 'المهمة غير موجودة' });
      }
      
      // Check permissions
      if (!userPermissions.includes('tasks.edit_any')) {
        if (task.createdById !== userId && task.assignedToId !== userId) {
          return res.status(403).json({ error: 'غير مصرح لك بتعديل هذه المهمة' });
        }
      }
      
      // Store old task snapshot before update
      const oldTask = { ...task };
      
      // Validate PATCH body with partial schema
      const updateSchema = insertTaskSchema.partial();
      const validatedData = updateSchema.parse(req.body);
      
      // Convert validated date strings to Date objects
      const processedBody: any = { ...validatedData };
      
      if (validatedData.dueDate) {
        const parsedDate = new Date(validatedData.dueDate as string);
        if (isNaN(parsedDate.getTime())) {
          return res.status(400).json({ error: 'تاريخ الاستحقاق غير صالح' });
        }
        processedBody.dueDate = parsedDate;
      }
      
      const updatedTask = await storage.updateTask(id, processedBody);
      
      // Log activity with before/after values
      await storage.logTaskActivity({
        taskId: id,
        userId,
        action: 'task_updated',
        changes: {
          field: 'multiple',
          oldValue: { ...oldTask },
          newValue: { ...updatedTask },
          description: 'تم تحديث المهمة',
        },
      });
      
      res.json(updatedTask);
    } catch (error: any) {
      console.error('Error updating task:', error);
      res.status(500).json({ error: 'فشل في تحديث المهمة' });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // PATCH /api/tasks/:id/status - Update task status
  app.patch("/api/tasks/:id/status", taskLimiter, requireAuth, requireAnyPermission('tasks.edit_any', 'tasks.edit_own'), async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = (req.user as any).id;
      const userPermissions = await storage.getUserPermissions(userId);
      
      // Validate status
      const statusSchema = z.object({
        status: z.enum(['todo', 'in_progress', 'review', 'completed', 'archived']),
      });
      statusSchema.parse({ status });
      
      const task = await storage.getTaskById(id);
      if (!task) {
        return res.status(404).json({ error: 'المهمة غير موجودة' });
      }
      
      // Check permissions
      if (!userPermissions.includes('tasks.edit_any')) {
        if (task.createdById !== userId && task.assignedToId !== userId) {
          return res.status(403).json({ error: 'غير مصرح لك بتعديل هذه المهمة' });
        }
      }
      
      // Store old task snapshot before update
      const oldTask = { ...task };
      
      const updates: any = { status };
      if (status === 'completed') {
        updates.completedAt = new Date();
        updates.progress = 100;
      }
      
      const updatedTask = await storage.updateTask(id, updates);
      
      // Log activity with full before/after values
      await storage.logTaskActivity({
        taskId: id,
        userId,
        action: 'status_changed',
        changes: {
          field: 'multiple',
          oldValue: { ...oldTask },
          newValue: { ...updatedTask },
          description: `تم تغيير الحالة من ${task.status} إلى ${status}`,
        },
      });
      
      res.json(updatedTask);
    } catch (error: any) {
      console.error('Error updating task status:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'حالة غير صالحة' });
      }
      res.status(500).json({ error: 'فشل في تحديث حالة المهمة' });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // DELETE /api/tasks/:id - Delete task
  app.delete("/api/tasks/:id", taskLimiter, requireAuth, requireAnyPermission('tasks.delete_any', 'tasks.delete_own'), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.user as any).id;
      const userPermissions = await storage.getUserPermissions(userId);
      
      const task = await storage.getTaskById(id);
      if (!task) {
        return res.status(404).json({ error: 'المهمة غير موجودة' });
      }
      
      // Check permissions
      if (!userPermissions.includes('tasks.delete_any')) {
        if (task.createdById !== userId) {
          return res.status(403).json({ error: 'غير مصرح لك بحذف هذه المهمة' });
        }
      }
      
      await storage.deleteTask(id);
      
      res.json({ success: true, message: 'تم حذف المهمة بنجاح' });
    } catch (error: any) {
      console.error('Error deleting task:', error);
      res.status(500).json({ error: 'فشل في حذف المهمة' });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/tasks/:id/subtasks - Create subtask
  app.post("/api/tasks/:id/subtasks", taskLimiter, requireAuth, requireAnyPermission('tasks.edit_any', 'tasks.edit_own'), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.user as any).id;
      const userPermissions = await storage.getUserPermissions(userId);
      
      const task = await storage.getTaskById(id);
      if (!task) {
        return res.status(404).json({ error: 'المهمة غير موجودة' });
      }
      
      // Check permissions
      if (!userPermissions.includes('tasks.edit_any')) {
        if (task.createdById !== userId && task.assignedToId !== userId) {
          return res.status(403).json({ error: 'غير مصرح لك بتعديل هذه المهمة' });
        }
      }
      
      const validatedData = insertSubtaskSchema.parse({
        ...req.body,
        taskId: id,
      });
      
      const subtask = await storage.createSubtask(validatedData);
      
      // Log activity
      await storage.logTaskActivity({
        taskId: id,
        userId,
        action: 'subtask_created',
        changes: { description: `تم إضافة مهمة فرعية: ${subtask.title}` },
      });
      
      res.status(201).json(subtask);
    } catch (error: any) {
      console.error('Error creating subtask:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'بيانات غير صالحة' });
      }
      res.status(500).json({ error: 'فشل في إضافة المهمة الفرعية' });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // PATCH /api/subtasks/:id - Update subtask
  app.patch("/api/subtasks/:id", taskLimiter, requireAuth, requireAnyPermission('tasks.edit_any', 'tasks.edit_own'), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.user as any).id;
      const userPermissions = await storage.getUserPermissions(userId);
      
      // Get subtask to find parent task
      const subtask = await storage.getSubtaskById(id);
      if (!subtask) {
        return res.status(404).json({ error: 'المهمة الفرعية غير موجودة' });
      }
      
      // Get parent task to check ownership
      const parentTask = await storage.getTaskById(subtask.taskId);
      if (!parentTask) {
        return res.status(404).json({ error: 'المهمة الأصلية غير موجودة' });
      }
      
      // Check permissions
      if (!userPermissions.includes('tasks.edit_any')) {
        if (parentTask.createdById !== userId && parentTask.assignedToId !== userId) {
          return res.status(403).json({ error: 'غير مصرح لك بتعديل هذه المهمة' });
        }
      }
      
      // Store old subtask snapshot before update
      const oldSubtask = { ...subtask };
      
      const updatedSubtask = await storage.updateSubtask(id, req.body);
      
      // Log activity with before/after values
      await storage.logTaskActivity({
        taskId: parentTask.id,
        userId,
        action: 'subtask_updated',
        changes: {
          field: 'multiple',
          oldValue: { ...oldSubtask },
          newValue: { ...updatedSubtask },
          description: `تم تحديث المهمة الفرعية: ${subtask.title}`,
        },
      });
      
      res.json(updatedSubtask);
    } catch (error: any) {
      console.error('Error updating subtask:', error);
      res.status(500).json({ error: 'فشل في تحديث المهمة الفرعية' });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // PATCH /api/subtasks/:id/toggle - Toggle subtask completion
  app.patch("/api/subtasks/:id/toggle", taskLimiter, requireAuth, requireAnyPermission('tasks.edit_any', 'tasks.edit_own'), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.user as any).id;
      const userPermissions = await storage.getUserPermissions(userId);
      
      // Get subtask to find parent task
      const oldSubtask = await storage.getSubtaskById(id);
      if (!oldSubtask) {
        return res.status(404).json({ error: 'المهمة الفرعية غير موجودة' });
      }
      
      // Get parent task to check ownership
      const parentTask = await storage.getTaskById(oldSubtask.taskId);
      if (!parentTask) {
        return res.status(404).json({ error: 'المهمة الأصلية غير موجودة' });
      }
      
      // Check permissions
      if (!userPermissions.includes('tasks.edit_any')) {
        if (parentTask.createdById !== userId && parentTask.assignedToId !== userId) {
          return res.status(403).json({ error: 'غير مصرح لك بتعديل هذه المهمة' });
        }
      }
      
      const subtask = await storage.toggleSubtaskComplete(id, userId);
      
      // Log activity with before/after values
      await storage.logTaskActivity({
        taskId: parentTask.id,
        userId,
        action: 'subtask_toggled',
        changes: {
          field: 'completed',
          oldValue: { ...oldSubtask },
          newValue: { ...subtask },
          description: `تم ${subtask.isCompleted ? 'إكمال' : 'إلغاء إكمال'} المهمة الفرعية: ${subtask.title}`,
        },
      });
      
      res.json(subtask);
    } catch (error: any) {
      console.error('Error toggling subtask:', error);
      res.status(500).json({ error: 'فشل في تحديث حالة المهمة الفرعية' });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // DELETE /api/subtasks/:id - Delete subtask
  app.delete("/api/subtasks/:id", taskLimiter, requireAuth, requireAnyPermission('tasks.edit_any', 'tasks.edit_own'), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.user as any).id;
      const userPermissions = await storage.getUserPermissions(userId);
      
      // Get subtask to find parent task
      const subtask = await storage.getSubtaskById(id);
      if (!subtask) {
        return res.status(404).json({ error: 'المهمة الفرعية غير موجودة' });
      }
      
      // Get parent task to check ownership
      const parentTask = await storage.getTaskById(subtask.taskId);
      if (!parentTask) {
        return res.status(404).json({ error: 'المهمة الأصلية غير موجودة' });
      }
      
      // Check permissions
      if (!userPermissions.includes('tasks.edit_any')) {
        if (parentTask.createdById !== userId && parentTask.assignedToId !== userId) {
          return res.status(403).json({ error: 'غير مصرح لك بتعديل هذه المهمة' });
        }
      }
      
      await storage.deleteSubtask(id);
      
      res.json({ success: true, message: 'تم حذف المهمة الفرعية بنجاح' });
    } catch (error: any) {
      console.error('Error deleting subtask:', error);
      res.status(500).json({ error: 'فشل في حذف المهمة الفرعية' });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/tasks/:id/comments - Get task comments
  app.get("/api/tasks/:id/comments", taskLimiter, requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      const comments = await storage.getTaskComments(id);
      
      res.json(comments);
    } catch (error: any) {
      console.error('Error fetching comments:', error);
      res.status(500).json({ error: 'فشل في جلب التعليقات' });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/tasks/:id/comments - Create comment
  app.post("/api/tasks/:id/comments", taskLimiter, requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.user as any).id;
      const userPermissions = await storage.getUserPermissions(userId);
      
      // Get parent task to check ownership
      const parentTask = await storage.getTaskById(id);
      if (!parentTask) {
        return res.status(404).json({ error: 'المهمة غير موجودة' });
      }
      
      // Check permissions
      if (!userPermissions.includes('tasks.view_all')) {
        if (parentTask.createdById !== userId && parentTask.assignedToId !== userId) {
          return res.status(403).json({ error: 'غير مصرح لك بالتعليق على هذه المهمة' });
        }
      }
      
      const validatedData = insertTaskCommentSchema.parse({
        ...req.body,
        taskId: id,
        userId,
      });
      
      const comment = await storage.createTaskComment(validatedData);
      
      // Log activity
      await storage.logTaskActivity({
        taskId: id,
        userId,
        action: 'comment_added',
        changes: { description: 'تم إضافة تعليق' },
      });
      
      res.status(201).json(comment);
    } catch (error: any) {
      console.error('Error creating comment:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'بيانات غير صالحة' });
      }
      res.status(500).json({ error: 'فشل في إضافة التعليق' });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // DELETE /api/task-comments/:id - Delete comment
  app.delete("/api/task-comments/:id", taskLimiter, requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.user as any).id;
      const userPermissions = await storage.getUserPermissions(userId);
      
      // Get comment to find parent task
      const comment = await storage.getTaskCommentById(id);
      if (!comment) {
        return res.status(404).json({ error: 'التعليق غير موجود' });
      }
      
      // Get parent task to check ownership
      const parentTask = await storage.getTaskById(comment.taskId);
      if (!parentTask) {
        return res.status(404).json({ error: 'المهمة الأصلية غير موجودة' });
      }
      
      // Check permissions
      if (!userPermissions.includes('tasks.edit_any')) {
        if (parentTask.createdById !== userId && parentTask.assignedToId !== userId && comment.userId !== userId) {
          return res.status(403).json({ error: 'غير مصرح لك بحذف هذا التعليق' });
        }
      }
      
      await storage.deleteTaskComment(id);
      
      res.json({ success: true, message: 'تم حذف التعليق بنجاح' });
    } catch (error: any) {
      console.error('Error deleting comment:', error);
      res.status(500).json({ error: 'فشل في حذف التعليق' });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/tasks/:id/attachments - Get task attachments
  app.get("/api/tasks/:id/attachments", taskLimiter, requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      const attachments = await storage.getTaskAttachments(id);
      
      res.json(attachments);
    } catch (error: any) {
      console.error('Error fetching attachments:', error);
      res.status(500).json({ error: 'فشل في جلب المرفقات' });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/tasks/:id/attachments - Upload attachment
  app.post("/api/tasks/:id/attachments", taskLimiter, requireAuth, upload.single('file'), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.user as any).id;
      const userPermissions = await storage.getUserPermissions(userId);
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ error: 'لم يتم رفع ملف' });
      }
      
      // Get parent task to check ownership
      const parentTask = await storage.getTaskById(id);
      if (!parentTask) {
        return res.status(404).json({ error: 'المهمة غير موجودة' });
      }
      
      // Check permissions
      if (!userPermissions.includes('tasks.edit_any')) {
        if (parentTask.createdById !== userId && parentTask.assignedToId !== userId) {
          return res.status(403).json({ error: 'غير مصرح لك بإضافة مرفقات لهذه المهمة' });
        }
      }
      
      // TODO: Upload to object storage and get URL
      const fileUrl = `https://placeholder.com/${file.originalname}`;
      
      const validatedData = insertTaskAttachmentSchema.parse({
        taskId: id,
        userId,
        fileName: file.originalname,
        fileUrl,
        fileSize: file.size,
        fileType: file.mimetype,
      });
      
      const attachment = await storage.createTaskAttachment(validatedData);
      
      // Log activity
      await storage.logTaskActivity({
        taskId: id,
        userId,
        action: 'attachment_added',
        changes: { description: `تم رفع ملف: ${file.originalname}` },
      });
      
      res.status(201).json(attachment);
    } catch (error: any) {
      console.error('Error uploading attachment:', error);
      res.status(500).json({ error: 'فشل في رفع الملف' });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // DELETE /api/task-attachments/:id - Delete attachment
  app.delete("/api/task-attachments/:id", taskLimiter, requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.user as any).id;
      const userPermissions = await storage.getUserPermissions(userId);
      
      // Get attachment to find parent task
      const attachment = await storage.getTaskAttachmentById(id);
      if (!attachment) {
        return res.status(404).json({ error: 'المرفق غير موجود' });
      }
      
      // Get parent task to check ownership
      const parentTask = await storage.getTaskById(attachment.taskId);
      if (!parentTask) {
        return res.status(404).json({ error: 'المهمة الأصلية غير موجودة' });
      }
      
      // Check permissions
      if (!userPermissions.includes('tasks.edit_any')) {
        if (parentTask.createdById !== userId && parentTask.assignedToId !== userId && attachment.userId !== userId) {
          return res.status(403).json({ error: 'غير مصرح لك بحذف هذا المرفق' });
        }
      }
      
      await storage.deleteTaskAttachment(id);
      
      res.json({ success: true, message: 'تم حذف المرفق بنجاح' });
    } catch (error: any) {
      console.error('Error deleting attachment:', error);
      res.status(500).json({ error: 'فشل في حذف المرفق' });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/tasks/:id/activity - Get task activity log
  app.get("/api/tasks/:id/activity", taskLimiter, requireAuth, async (req, res) => {
    try {
      const { id} = req.params;
      
      const activity = await storage.getTaskActivity(id);
      
      res.json(activity);
    } catch (error: any) {
      console.error('Error fetching activity:', error);
      res.status(500).json({ error: 'فشل في جلب سجل النشاط' });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights
}
