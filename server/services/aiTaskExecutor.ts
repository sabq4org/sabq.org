import { storage } from '../storage';
import { aiArticleGenerator } from './aiArticleGenerator';
import { aiImageGenerator } from './aiImageGenerator';
import type { AiScheduledTask } from '@shared/schema';

export interface TaskExecutionResult {
  success: boolean;
  skipped?: boolean;
  articleId?: string;
  imageUrl?: string;
  error?: string;
  executionTimeMs: number;
  tokensUsed: number;
  generationCost: number;
}

export class AITaskExecutor {
  private readonly costPerToken = 0.00001; // $0.01 per 1000 tokens (estimate)
  private readonly costPerImage = 0.04; // DALL-E 3 standard cost

  /**
   * Wraps a promise with a timeout, properly cleaning up the timer to avoid unhandled rejections
   */
  private async promiseWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage: string
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId!); // Clear timeout on success
      return result;
    } catch (error) {
      clearTimeout(timeoutId!); // Clear timeout on error
      throw error;
    }
  }

  async executeTask(taskId: string): Promise<TaskExecutionResult> {
    const startTime = Date.now();
    let totalTokens = 0;
    let totalCost = 0;

    try {
      // Atomically claim the task (prevents race conditions)
      // This will only succeed if the task is still 'pending'
      const task = await storage.markAiTaskProcessing(taskId);
      if (!task) {
        // Task already claimed by another worker - skip silently
        return {
          success: true,
          skipped: true,
          executionTimeMs: Date.now() - startTime,
          tokensUsed: 0,
          generationCost: 0
        };
      }

      console.log(`[AI Task Executor] ⏳ Executing task ${taskId}: ${task.title}`);

      // Step 1: Generate article content (with timeout protection)
      console.log(`[AI Task Executor] 📝 Step 1: Generating article content...`);
      const generatedArticle = await this.promiseWithTimeout(
        aiArticleGenerator.generateArticle({
          title: task.title,
          categoryId: task.categoryId || '112b3ebd-ab7c-424c-a2d8-ee0287df5506',
          locale: task.locale as 'ar' | 'en' | 'ur',
          contentType: task.contentType as 'news' | 'analysis' | 'report' | 'interview' | 'opinion',
          keywords: Array.isArray(task.keywords) ? task.keywords : undefined,
          tone: 'neutral',
          length: 'medium',
          additionalInstructions: task.aiPrompt || undefined
        }),
        5 * 60 * 1000,
        'Article generation timed out after 5 minutes'
      );

      totalTokens += generatedArticle.tokensUsed;
      totalCost += generatedArticle.tokensUsed * this.costPerToken;

      console.log(`[AI Task Executor] ✅ Article generated in ${generatedArticle.generationTimeMs}ms`);

      // Step 2: Generate image (optional, with timeout protection)
      let imageUrl: string | undefined;
      if (task.generateImage) {
        try {
          console.log(`[AI Task Executor] 🎨 Step 2: Generating featured image...`);
          const generatedImage = await this.promiseWithTimeout(
            aiImageGenerator.generateImageForTask(task),
            3 * 60 * 1000,
            'Image generation timed out after 3 minutes'
          );
          
          if (generatedImage) {
            imageUrl = generatedImage.imageUrl;
            totalCost += this.costPerImage;
            console.log(`[AI Task Executor] ✅ Image generated in ${generatedImage.generationTimeMs}ms`);
          }
        } catch (error) {
          console.error('[AI Task Executor] ⚠️ Image generation failed, continuing without image:', error);
          // Continue without image - not a critical failure
        }
      } else {
        console.log(`[AI Task Executor] ⏭️ Step 2: Skipping image generation (disabled in task settings)`);
      }

      // Step 3: Create article in database
      console.log(`[AI Task Executor] 💾 Step 3: Creating article in database...`);
      const articleData = await aiArticleGenerator.convertTaskToArticleData(task, generatedArticle);
      if (!articleData) {
        throw new Error('Failed to convert task to article data');
      }

      const createdArticle = await storage.createArticle(articleData);
      
      // Update with featured image if generated
      if (imageUrl && createdArticle.id) {
        console.log(`[AI Task Executor] 🖼️ Updating article with featured image...`);
        await storage.updateArticle(createdArticle.id, {
          imageUrl: imageUrl,
          isAiGeneratedImage: true,
          aiImageModel: task.imageModel || 'gemini-pro-image'
        });
      }

      console.log(`[AI Task Executor] ✅ Article created with ID: ${createdArticle.id}`);

      // Step 4: Mark task as completed
      await storage.updateAiTaskExecution(taskId, {
        status: 'completed',
        generatedArticleId: createdArticle.id,
        generatedImageUrl: imageUrl,
        executionTimeMs: Date.now() - startTime,
        tokensUsed: totalTokens,
        generationCost: totalCost,
        executionLogs: {
          articleGenerationTime: generatedArticle.generationTimeMs,
          imageGenerationTime: imageUrl ? 'success' : 'skipped',
          articleLength: generatedArticle.content.length,
          timestamp: new Date().toISOString()
        }
      });

      console.log(`[AI Task Executor] 🎉 Task ${taskId} completed successfully in ${Date.now() - startTime}ms`);

      return {
        success: true,
        articleId: createdArticle.id,
        imageUrl,
        executionTimeMs: Date.now() - startTime,
        tokensUsed: totalTokens,
        generationCost: totalCost
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error(`[AI Task Executor] ❌ Task ${taskId} failed after ${Date.now() - startTime}ms:`, errorMessage);
      console.error(`[AI Task Executor] Error details:`, { errorMessage, errorStack });

      // Mark task as failed (rollback from processing → failed)
      try {
        await storage.updateAiTaskExecution(taskId, {
          status: 'failed',
          errorMessage: errorMessage,
          executionTimeMs: Date.now() - startTime,
          tokensUsed: totalTokens,
          generationCost: totalCost,
          executionLogs: {
            error: errorMessage,
            stack: errorStack,
            failedAt: new Date().toISOString(),
            totalCost: totalCost,
            tokensUsed: totalTokens
          }
        });
        console.log(`[AI Task Executor] 💾 Task status updated to 'failed'`);
      } catch (updateError) {
        console.error(`[AI Task Executor] ⚠️ Failed to update task status:`, updateError);
        // Task will be stuck in 'processing' - consider adding a cleanup job
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTimeMs: Date.now() - startTime,
        tokensUsed: totalTokens,
        generationCost: totalCost
      };
    }
  }

  async executePendingTasks(): Promise<{
    executed: number;
    succeeded: number;
    failed: number;
  }> {
    console.log('[AI Task Executor] Checking for pending tasks...');

    const pendingTasks = await storage.getPendingAiTasks();

    if (pendingTasks.length === 0) {
      return { executed: 0, succeeded: 0, failed: 0 };
    }

    console.log(`[AI Task Executor] Found ${pendingTasks.length} pending task(s)`);

    let succeeded = 0;
    let failed = 0;

    // Execute tasks sequentially (to avoid overwhelming AI APIs)
    for (const task of pendingTasks) {
      const result = await this.executeTask(task.id);
      if (result.success && !result.skipped) {
        succeeded++;
      } else if (!result.success) {
        failed++;
      }
      // Skipped tasks don't count as succeeded or failed
    }

    console.log(`[AI Task Executor] Execution summary: ${succeeded} succeeded, ${failed} failed`);

    return {
      executed: pendingTasks.length,
      succeeded,
      failed
    };
  }
}

export const aiTaskExecutor = new AITaskExecutor();
