import { GoogleGenerativeAI } from "@google/generative-ai";
import pRetry from "p-retry";
import { eq } from "drizzle-orm";
import { storyCards } from "@shared/schema";
import visualAiService from "./visualAiService";
import { imageGenerationService } from "./imageGenerationService";
import { db } from "../db";

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

interface StorySlide {
  order: number;
  type: 'intro' | 'content' | 'quote' | 'fact' | 'outro';
  title?: string;
  content: string;
  imageUrl?: string;
  backgroundColor?: string;
  textColor?: string;
  emphasis?: string;
}

interface StoryCardData {
  articleId: string;
  slides: StorySlide[];
  theme: 'news' | 'tech' | 'lifestyle' | 'business' | 'sports';
  primaryColor: string;
  secondaryColor: string;
  fontStyle: 'modern' | 'classic' | 'bold' | 'elegant';
  aspectRatio: '9:16' | '1:1' | '16:9';
  duration: number; // seconds per slide
}

export class StoryCardsService {
  private dbInstance = db;

  /**
   * Generate story cards from article content
   */
  async generateStoryCards(
    articleId: string,
    title: string,
    content: string,
    options?: {
      category?: string;
      imageUrl?: string;
      author?: string;
      maxSlides?: number;
      aspectRatio?: '9:16' | '1:1' | '16:9';
      language?: 'ar' | 'en' | 'ur';
    }
  ): Promise<StoryCardData> {
    const maxSlides = options?.maxSlides || 7;
    const aspectRatio = options?.aspectRatio || '9:16';
    const language = options?.language || 'ar';

    try {
      // Analyze content and break into slides
      const prompt = `Analyze this article and create a story with ${maxSlides} slides for social media.
      
Article Title: ${title}
Content: ${content}
Category: ${options?.category || 'General'}
Language: ${language}

Create a compelling story structure with:
1. An engaging intro slide
2. ${maxSlides - 2} content slides with key points
3. A memorable outro slide

For each slide provide:
- type: intro/content/quote/fact/outro
- title: Short, impactful title (optional for some types)
- content: Concise text (max 50 words for ${aspectRatio} format)
- emphasis: Key word or phrase to highlight
- suggested_mood: visual mood (energetic/serious/inspiring/informative)

Return as JSON with this structure:
{
  "slides": [...],
  "theme": "suggested theme",
  "fontStyle": "suggested font style",
  "primaryColor": "#hex color",
  "secondaryColor": "#hex color"
}

Make it visually engaging for ${aspectRatio} format social media stories.
${language === 'ar' ? 'Output all text in Arabic RTL format.' : ''}`;

      const result = await pRetry(
        async () => {
          const response = await model.generateContent(prompt);
          const text = response.response.text();
          
          // Extract JSON from response
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("No JSON found in response");
          
          return JSON.parse(jsonMatch[0]);
        },
        { retries: 2 }
      );

      // Generate images for each slide
      const slidesWithImages = await this.generateSlideImages(
        result.slides,
        {
          theme: result.theme || 'news',
          primaryColor: result.primaryColor || '#1a73e8',
          secondaryColor: result.secondaryColor || '#34a853',
          aspectRatio,
          brandName: 'سبق',
          category: options?.category
        }
      );

      const storyData: StoryCardData = {
        articleId,
        slides: slidesWithImages,
        theme: result.theme || 'news',
        primaryColor: result.primaryColor || '#1a73e8',
        secondaryColor: result.secondaryColor || '#34a853',
        fontStyle: result.fontStyle || 'modern',
        aspectRatio,
        duration: 5 // 5 seconds per slide default
      };

      // Save to database
      await this.saveStoryCards(storyData);

      return storyData;
    } catch (error) {
      console.error("Error generating story cards:", error);
      throw error;
    }
  }

  /**
   * Generate images for story slides
   */
  private async generateSlideImages(
    slides: any[],
    options: {
      theme: string;
      primaryColor: string;
      secondaryColor: string;
      aspectRatio: string;
      brandName: string;
      category?: string;
    }
  ): Promise<StorySlide[]> {
    const aspectDimensions = {
      '9:16': { width: 1080, height: 1920 }, // Stories/Reels
      '1:1': { width: 1080, height: 1080 },   // Instagram Posts
      '16:9': { width: 1920, height: 1080 }   // YouTube/LinkedIn
    };

    const dimensions = aspectDimensions[options.aspectRatio as keyof typeof aspectDimensions];

    const slidesWithImages: StorySlide[] = [];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      
      // Generate appropriate background image for slide type
      const imagePrompt = this.createImagePrompt(slide, options);
      
      try {
        const imageUrl = await imageGenerationService.generateImage({
          prompt: imagePrompt,
          width: dimensions.width,
          height: dimensions.height,
          style: 'vivid',
          quality: 'hd',
          useGemini: true
        });

        slidesWithImages.push({
          order: i + 1,
          type: slide.type,
          title: slide.title,
          content: slide.content,
          imageUrl,
          backgroundColor: this.getSlideBackgroundColor(slide.type, options.primaryColor),
          textColor: this.getSlideTextColor(slide.type),
          emphasis: slide.emphasis
        });
      } catch (error) {
        console.error(`Error generating image for slide ${i + 1}:`, error);
        
        // Fallback to solid color background
        slidesWithImages.push({
          order: i + 1,
          type: slide.type,
          title: slide.title,
          content: slide.content,
          backgroundColor: this.getSlideBackgroundColor(slide.type, options.primaryColor),
          textColor: this.getSlideTextColor(slide.type),
          emphasis: slide.emphasis
        });
      }
    }

    return slidesWithImages;
  }

  /**
   * Create image generation prompt for slide
   */
  private createImagePrompt(slide: any, options: any): string {
    const baseStyle = `professional social media story slide, ${options.aspectRatio} aspect ratio, 
                      ${options.theme} theme, minimalist design, ${options.primaryColor} accent color`;

    switch (slide.type) {
      case 'intro':
        return `${baseStyle}, eye-catching opening slide, bold geometric patterns, 
                "${options.brandName}" branding, category: ${options.category || 'news'}`;
      
      case 'content':
        return `${baseStyle}, clean content slide background, subtle patterns, 
                professional layout space for text overlay`;
      
      case 'quote':
        return `${baseStyle}, elegant quote background, soft gradients, 
                inspirational atmosphere, space for quotation`;
      
      case 'fact':
        return `${baseStyle}, data visualization background, modern infographic style, 
                tech-inspired patterns, statistical theme`;
      
      case 'outro':
        return `${baseStyle}, call-to-action slide, engaging closing design, 
                "${options.brandName}" logo placement area, swipe up indicator`;
      
      default:
        return `${baseStyle}, versatile story slide background`;
    }
  }

  /**
   * Get background color for slide type
   */
  private getSlideBackgroundColor(type: string, primaryColor: string): string {
    const colorVariations = {
      intro: primaryColor,
      content: '#ffffff',
      quote: '#f8f9fa',
      fact: primaryColor + '15', // 15% opacity
      outro: primaryColor
    };

    return colorVariations[type as keyof typeof colorVariations] || '#ffffff';
  }

  /**
   * Get text color for slide type
   */
  private getSlideTextColor(type: string): string {
    const textColors = {
      intro: '#ffffff',
      content: '#212529',
      quote: '#495057',
      fact: '#212529',
      outro: '#ffffff'
    };

    return textColors[type as keyof typeof textColors] || '#212529';
  }

  /**
   * Save story cards to database
   */
  private async saveStoryCards(storyData: StoryCardData, userId: string = 'system'): Promise<void> {
    try {
      const storyCard = {
        articleId: storyData.articleId,
        userId: userId, // Required field
        title: `Story for Article ${storyData.articleId}`, // Add a title
        language: 'ar' as const, // Default to Arabic
        slideCount: storyData.slides.length,
        slides: storyData.slides, // Store as JSON
        template: storyData.theme === 'news' ? 'news_story' : 'quick_facts', // Map theme to template
        colorScheme: 'brand' as const,
        brandElements: {
          primaryColor: storyData.primaryColor,
          secondaryColor: storyData.secondaryColor,
          fontStyle: storyData.fontStyle
        },
        // Set URLs based on aspect ratio
        instagramStoryUrl: storyData.aspectRatio === '9:16' ? storyData.slides[0]?.imageUrl : undefined,
        facebookStoryUrl: storyData.aspectRatio === '9:16' ? storyData.slides[0]?.imageUrl : undefined,
        whatsappStatusUrl: storyData.aspectRatio === '9:16' ? storyData.slides[0]?.imageUrl : undefined,
        status: 'completed' as const, // Map 'generated' to 'completed'
        isPublished: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await this.dbInstance.insert(storyCards).values(storyCard);
    } catch (error) {
      console.error("Error saving story cards:", error);
      throw error;
    }
  }

  /**
   * Generate Instagram carousel from article
   */
  async generateInstagramCarousel(
    articleId: string,
    title: string,
    content: string,
    options?: {
      category?: string;
      maxSlides?: number;
    }
  ): Promise<StoryCardData> {
    return this.generateStoryCards(articleId, title, content, {
      ...options,
      aspectRatio: '1:1',
      maxSlides: options?.maxSlides || 10 // Instagram allows up to 10
    });
  }

  /**
   * Generate LinkedIn carousel document
   */
  async generateLinkedInDocument(
    articleId: string,
    title: string,
    content: string,
    options?: {
      category?: string;
    }
  ): Promise<StoryCardData> {
    return this.generateStoryCards(articleId, title, content, {
      ...options,
      aspectRatio: '16:9',
      maxSlides: 15 // LinkedIn documents can be longer
    });
  }

  /**
   * Get story cards by article ID
   */
  async getStoryCardsByArticle(articleId: string): Promise<any[]> {
    try {
      const cards = await this.dbInstance
        .select()
        .from(storyCards)
        .where(eq(storyCards.articleId, articleId));
      
      return cards;
    } catch (error) {
      console.error("Error fetching story cards:", error);
      return [];
    }
  }

  /**
   * Update story card
   */
  async updateStoryCard(
    cardId: string,
    updates: Partial<StoryCardData>
  ): Promise<void> {
    try {
      await this.dbInstance
        .update(storyCards)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(storyCards.id, cardId));
    } catch (error) {
      console.error("Error updating story card:", error);
      throw error;
    }
  }

  /**
   * Delete story card
   */
  async deleteStoryCard(cardId: string): Promise<void> {
    try {
      await this.dbInstance
        .delete(storyCards)
        .where(eq(storyCards.id, cardId));
    } catch (error) {
      console.error("Error deleting story card:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const storyCardsService = new StoryCardsService();