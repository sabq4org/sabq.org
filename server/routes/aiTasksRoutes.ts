import { Router, type Request, Response } from 'express';
import { storage } from '../storage';
import { aiTaskExecutor } from '../services/aiTaskExecutor';
import { insertAiScheduledTaskSchema, type InsertAiScheduledTask } from '@shared/schema';
import { ZodError } from 'zod';

const router = Router();

// Middleware to ensure user is authenticated
function isAuthenticated(req: Request, res: Response, next: any) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Middleware to check if user has admin/editor permissions
function isAdmin(req: Request, res: Response, next: any) {
  const user = req.user as any;
  if (!user || !['admin', 'editor', 'chief_editor'].includes(user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * POST /api/ai-tasks
 * Create a new AI task
 */
router.post('/', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    
    // Log incoming request for debugging
    console.log('[AI Tasks API] 📥 Received POST request:', {
      body: req.body,
      scheduledAtType: typeof req.body.scheduledAt,
      scheduledAtValue: req.body.scheduledAt,
    });
    
    // Validate request body
    const taskData = insertAiScheduledTaskSchema.parse({
      ...req.body,
      createdBy: userId,
    });

    console.log('[AI Tasks API] ✅ Validation passed:', taskData);

    const task = await storage.createAiTask(taskData);
    
    res.status(201).json(task);
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('[AI Tasks API] ❌ Validation error:', JSON.stringify(error.errors, null, 2));
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors 
      });
    }
    console.error('[AI Tasks API] Create task error:', error);
    res.status(500).json({ error: 'Failed to create AI task' });
  }
});

/**
 * GET /api/ai-tasks
 * List AI tasks with filters
 */
router.get('/', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { 
      status, 
      page = '1', 
      limit = '20',
      categoryId,
      createdBy
    } = req.query;

    const result = await storage.listAiTasks({
      status: status as any,
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      categoryId: categoryId as string,
      createdBy: createdBy as string
    });

    res.json(result);
  } catch (error) {
    console.error('[AI Tasks API] List tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch AI tasks' });
  }
});

/**
 * GET /api/ai-tasks/stats
 * Get AI tasks statistics
 */
router.get('/stats', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await storage.getAiTaskStats();
    res.json(stats);
  } catch (error) {
    console.error('[AI Tasks API] Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * GET /api/ai-tasks/:id
 * Get AI task details
 */
router.get('/:id', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const task = await storage.getAiTask(id);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  } catch (error) {
    console.error('[AI Tasks API] Get task error:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

/**
 * PUT /api/ai-tasks/:id
 * Update AI task
 */
router.put('/:id', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Check if task exists
    const existingTask = await storage.getAiTask(id);
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Don't allow updating completed or processing tasks
    if (['completed', 'processing'].includes(existingTask.status)) {
      return res.status(400).json({ 
        error: 'Cannot update task in completed or processing status' 
      });
    }

    const updates = req.body;
    const updatedTask = await storage.updateAiTask(id, updates);

    res.json(updatedTask);
  } catch (error) {
    console.error('[AI Tasks API] Update task error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/**
 * DELETE /api/ai-tasks/:id
 * Delete AI task
 */
router.delete('/:id', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Check if task exists
    const existingTask = await storage.getAiTask(id);
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Don't allow deleting processing tasks
    if (existingTask.status === 'processing') {
      return res.status(400).json({ 
        error: 'Cannot delete task that is currently processing' 
      });
    }

    await storage.deleteAiTask(id);
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    console.error('[AI Tasks API] Delete task error:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

/**
 * POST /api/ai-tasks/:id/execute
 * Execute AI task manually
 */
router.post('/:id/execute', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Check if task exists
    const task = await storage.getAiTask(id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check if task is pending
    if (task.status !== 'pending') {
      return res.status(400).json({ 
        error: `Cannot execute task in ${task.status} status. Only pending tasks can be executed.` 
      });
    }

    // Execute task asynchronously
    aiTaskExecutor.executeTask(id)
      .then(result => {
        console.log(`[AI Tasks API] Task ${id} executed manually:`, result);
      })
      .catch(error => {
        console.error(`[AI Tasks API] Manual execution failed for task ${id}:`, error);
      });

    // Return immediately
    res.json({ 
      success: true, 
      message: 'Task execution started',
      taskId: id 
    });
  } catch (error) {
    console.error('[AI Tasks API] Execute task error:', error);
    res.status(500).json({ error: 'Failed to execute task' });
  }
});

/**
 * POST /api/ai-tasks/:id/cancel
 * Cancel AI task
 */
router.post('/:id/cancel', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Check if task exists
    const task = await storage.getAiTask(id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Only pending tasks can be cancelled
    if (task.status !== 'pending') {
      return res.status(400).json({ 
        error: `Cannot cancel task in ${task.status} status. Only pending tasks can be cancelled.` 
      });
    }

    await storage.updateAiTaskExecution(id, {
      status: 'cancelled'
    });

    res.json({ success: true, message: 'Task cancelled successfully' });
  } catch (error) {
    console.error('[AI Tasks API] Cancel task error:', error);
    res.status(500).json({ error: 'Failed to cancel task' });
  }
});

export default router;
