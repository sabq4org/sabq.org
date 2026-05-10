import { generateNewsImage } from './visualAiService';
import type { AiScheduledTask } from '@shared/schema';

export interface ImageGenerationConfig {
  articleTitle: string;
  articleSummary?: string;
  category: string;
  language: 'ar' | 'en' | 'ur';
  style?: 'photorealistic' | 'illustration' | 'abstract' | 'infographic';
  mood?: 'serious' | 'optimistic' | 'neutral' | 'dramatic' | 'calm';
}

export interface GeneratedImage {
  imageUrl: string;
  thumbnailUrl: string;
  generationTimeMs: number;
}

export class AIImageGenerator {
  async generateImageForTask(task: AiScheduledTask): Promise<GeneratedImage | null> {
    if (!task.generateImage) {
      return null;
    }

    const startTime = Date.now();
    
    try {
      const result = await generateNewsImage({
        articleTitle: task.title,
        articleSummary: task.aiPrompt || task.description || undefined,
        category: task.categoryId || 'general',
        language: task.locale as 'ar' | 'en' | 'ur',
        style: (task.imageModel as 'photorealistic' | 'illustration' | 'abstract' | 'infographic') || 'photorealistic',
        mood: 'neutral'
      });

      if (!result.imageUrl) {
        throw new Error('Image generation failed: no image URL returned');
      }

      return {
        imageUrl: result.imageUrl,
        thumbnailUrl: result.thumbnailUrl || result.imageUrl,
        generationTimeMs: Date.now() - startTime
      };
    } catch (error) {
      console.error('[AI Image Generator] Failed to generate image:', error);
      throw new Error(`Image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateImageFromArticle(
    articleTitle: string,
    articleSummary: string,
    category: string,
    locale: 'ar' | 'en' | 'ur'
  ): Promise<GeneratedImage> {
    const startTime = Date.now();
    
    const result = await generateNewsImage({
      articleTitle,
      articleSummary,
      category,
      language: locale,
      style: 'photorealistic',
      mood: 'neutral'
    });

    if (!result.imageUrl) {
      throw new Error('Image generation failed: no image URL returned');
    }

    return {
      imageUrl: result.imageUrl,
      thumbnailUrl: result.thumbnailUrl || result.imageUrl,
      generationTimeMs: Date.now() - startTime
    };
  }
}

export const aiImageGenerator = new AIImageGenerator();
