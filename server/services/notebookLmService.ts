/**
 * NotebookLM Service
 * Integration with Google Gemini for professional infographic generation
 * Uses Gemini 3 Pro Image for high-quality Arabic infographics
 */

import { GoogleGenAI, Modality } from "@google/genai";
import { ObjectStorageService } from "../objectStorage";
import pRetry from "p-retry";

// Validate required environment variables
const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
if (!apiKey) {
  console.error("[NotebookLM] CRITICAL: GEMINI_API_KEY or AI_INTEGRATIONS_GEMINI_API_KEY is not set!");
  console.error("[NotebookLM] Image generation will fail without valid API key");
} else {
  console.log("[NotebookLM] API key configured successfully");
}

// Initialize Gemini client
const geminiClient = new GoogleGenAI({
  apiKey: apiKey || "missing-api-key",
});

// Initialize Object Storage Service
const objectStorageService = new ObjectStorageService();

interface NotebookLMConfig {
  apiKey?: string;
  baseUrl?: string;
}

interface NotebookLMGenerationOptions {
  prompt: string;
  detail: 'concise' | 'standard' | 'detailed';
  orientation: 'square' | 'portrait' | 'landscape';
  language: string;
  colorStyle?: 'auto' | 'vibrant' | 'professional' | 'elegant' | 'modern';
}

// Helper to check rate limit errors
function isRateLimitError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") ||
    errorMsg.toLowerCase().includes("rate limit")
  );
}

// Map orientations to aspect ratios
function getAspectRatio(orientation: string): "1:1" | "16:9" | "9:16" {
  switch (orientation) {
    case 'square': return '1:1';
    case 'landscape': return '16:9';
    case 'portrait': return '9:16';
    default: return '16:9';
  }
}

class NotebookLMService {
  private config: NotebookLMConfig;

  constructor(config?: NotebookLMConfig) {
    this.config = {
      apiKey: config?.apiKey || apiKey,
      baseUrl: config?.baseUrl || 'https://generativelanguage.googleapis.com'
    };
  }

  /**
   * Generate infographic using Gemini 3 Pro Image
   */
  async generateInfographic(options: NotebookLMGenerationOptions): Promise<{
    success: boolean;
    imageUrl?: string;
    imageData?: string; // Base64
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      console.log('[NotebookLM] Generating infographic with Gemini 3 Pro Image');
      console.log(`[NotebookLM] Prompt: "${options.prompt.substring(0, 100)}..."`);
      
      // Build enhanced prompt for infographic generation
      const languageInstructions = {
        'ar': 'Create a professional Arabic infographic. Use right-to-left text layout. Include clear Arabic typography.',
        'en': 'Create a professional English infographic. Use clear typography and modern design.',
        'ur': 'Create a professional Urdu infographic. Use right-to-left text layout. Include clear Urdu typography.',
      };

      const detailInstructions = {
        'concise': 'Keep it simple with key points only.',
        'standard': 'Include main points with supporting details.',
        'detailed': 'Include comprehensive information with statistics and examples.',
      };

      // Define color palettes for different styles
      const colorPalettes: Record<string, string[]> = {
        vibrant: [
          'vibrant gradient (orange to purple) with yellow accents',
          'bold red-orange gradient with deep blue accents',
          'energetic yellow-orange with turquoise highlights',
          'bright magenta-cyan gradient with lime green highlights'
        ],
        professional: [
          'professional blue-green gradient with coral highlights',
          'corporate navy-teal with silver accents',
          'business gray-blue with gold highlights',
          'classic royal blue with charcoal and white accents'
        ],
        elegant: [
          'elegant teal-cyan with golden yellow highlights',
          'sophisticated navy-purple with rose gold accents',
          'luxurious emerald-sapphire with pearl accents',
          'refined burgundy-gold with cream highlights'
        ],
        modern: [
          'modern pink-purple gradient with mint green accents',
          'fresh green-lime gradient with sky blue highlights',
          'contemporary coral-turquoise with yellow highlights',
          'trendy neon gradient with dark background'
        ],
        auto: [
          'vibrant gradient (orange to purple) with yellow accents',
          'professional blue-green gradient with coral highlights',
          'modern pink-purple gradient with mint green accents',
          'elegant teal-cyan with golden yellow highlights',
          'bold red-orange gradient with deep blue accents',
          'fresh green-lime gradient with sky blue highlights',
          'sophisticated navy-purple with rose gold accents',
          'energetic yellow-orange with turquoise highlights'
        ]
      };
      
      // Select palette based on user preference or random
      const stylePreference = options.colorStyle || 'auto';
      const availablePalettes = colorPalettes[stylePreference] || colorPalettes.auto;
      const selectedPalette = availablePalettes[Math.floor(Math.random() * availablePalettes.length)];
      
      // Determine if this is a banner (landscape 16:9) or infographic (portrait 9:16)
      const isBanner = options.orientation === 'landscape';
      
      let enhancedPrompt: string;
      
      if (isBanner) {
        // BANNER PROMPT - For horizontal 16:9 card banners - CINEMATIC STYLE
        enhancedPrompt = `
Create a CINEMATIC PHOTOREALISTIC BANNER IMAGE for this news article:

ARTICLE CONTENT:
${options.prompt}

STYLE: CINEMATIC PHOTOREALISTIC / DIGITAL ART
Think like a movie poster designer or premium magazine cover artist.

VISUAL APPROACH:
1. Analyze the article and identify the MAIN VISUAL SUBJECT
2. Create a DRAMATIC SCENE that represents the story
3. Use PHOTOREALISTIC or HYPER-REALISTIC digital art style
4. Apply CINEMATIC LIGHTING (golden hour, dramatic shadows, volumetric light)
5. Create DEPTH with bokeh, atmospheric haze, or depth of field

COMPOSITION (16:9 Horizontal):
- Hero subject positioned using rule of thirds
- Strong visual hierarchy with clear focal point
- Atmospheric background that tells the story
- Professional color grading: ${selectedPalette}

MUST INCLUDE:
✓ Photorealistic or high-quality digital art rendering
✓ Cinematic movie-poster quality
✓ Dramatic lighting and atmosphere
✓ Rich colors with professional color grading
✓ Clean composition without clutter

MUST NOT INCLUDE:
❌ NO text, titles, labels, or any typography
❌ NO cartoon or flat illustration style
❌ NO isometric or 2.5D graphics
❌ NO infographic elements or data charts
❌ NO logos, watermarks, or branding
❌ NO "Sabq" or "سبق" anywhere

OUTPUT: A stunning, scroll-stopping cinematic image that visually tells the story at first glance. Quality level: Netflix thumbnail, movie poster, Bloomberg/Reuters editorial imagery.
        `.trim();
      } else {
        // INFOGRAPHIC PROMPT - For vertical 9:16 or square detailed infographics
        enhancedPrompt = `
${languageInstructions[options.language as keyof typeof languageInstructions] || languageInstructions['ar']}

📰 CONTENT TO TRANSFORM INTO CREATIVE VISUAL:
${options.prompt}

🎨 CREATIVE DESIGN MISSION:
Create an ARTISTIC VISUAL STORY that transforms the above content into a stunning creative illustration. 
Think like an EDITORIAL ARTIST - not just data visualization, but VISUAL STORYTELLING.

CREATIVE APPROACH:
1. EXTRACT THE CORE STORY: What is the main message? Create a visual metaphor for it.
2. VISUAL SYMBOLISM: Use creative symbols, icons, and illustrations that represent the content's meaning.
3. ARTISTIC INTERPRETATION: Go beyond charts - create scenes, characters, or conceptual art that tells the story.
4. EMOTIONAL DESIGN: The design should evoke the feeling of the content (excitement, concern, hope, etc.).

DESIGN STYLE - 2.5D EDITORIAL ILLUSTRATION:
- Modern 2.5D isometric or semi-flat illustration style
- Rich ${selectedPalette} color palette with depth and dimension
- ${detailInstructions[options.detail]}
- Layered composition with foreground, midground, and background elements
- Soft shadows and subtle gradients for depth
- Bold, expressive typography integrated into the design
- Creative use of negative space
- Cinematic composition with visual flow

ILLUSTRATION ELEMENTS:
- Custom illustrated characters or objects representing the story
- Abstract shapes and geometric elements that support the narrative
- Icons and symbols with creative styling (not generic flat icons)
- Scene-setting backgrounds that add context
- Motion lines or visual effects for dynamism
- Decorative elements that enhance without cluttering

CRITICAL RULES:
❌ NO "Sabq" or "سبق" branding, logos, or watermarks
❌ NO generic stock illustrations
❌ NO boring pie charts or bar graphs as the main focus
❌ NO cluttered or busy designs
✅ Create ORIGINAL artistic interpretation of the content
✅ Focus on visual impact and storytelling
✅ Make it share-worthy and scroll-stopping

Create a magazine-cover-quality editorial illustration that makes people stop scrolling and want to read the story. The visual should be so compelling that it tells the story even without reading the text.
        `.trim();
      }

      // Build the generation request
      const contents: any[] = [{
        role: "user",
        parts: [{ text: enhancedPrompt }]
      }];
      
      // Configure generation settings
      const aspectRatio = getAspectRatio(options.orientation);
      const config: any = {
        responseModalities: [Modality.IMAGE],
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: "2K", // High quality for infographics
          numImages: 1
        }
      };
      
      console.log(`[NotebookLM] Generating with aspect ratio: ${aspectRatio}`);
      
      // Generate with retry logic
      const response = await pRetry(
        async () => {
          try {
            return await geminiClient.models.generateContent({
              model: "gemini-3-pro-image-preview",
              contents,
              config
            });
          } catch (error: any) {
            console.error(`[NotebookLM] Generation error:`, error);
            if (isRateLimitError(error)) {
              throw error; // Retry
            }
            // Don't retry non-rate-limit errors
            const abortError: any = new Error(error.message);
            abortError.name = 'AbortError';
            throw abortError;
          }
        },
        {
          retries: 5,
          minTimeout: 3000,
          maxTimeout: 30000,
          factor: 2,
          onFailedAttempt: (error) => {
            console.log(`[NotebookLM] Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`);
          }
        }
      );
      
      const generationTime = Math.round((Date.now() - startTime) / 1000);
      console.log(`[NotebookLM] Generation completed in ${generationTime}s`);
      
      // Extract image data
      const candidate = response.candidates?.[0];
      const imagePart = candidate?.content?.parts?.find((part: any) => part.inlineData);
      
      if (!imagePart?.inlineData?.data) {
        throw new Error('No image data in response');
      }

      const imageBase64 = imagePart.inlineData.data;
      console.log(`[NotebookLM] Image data received (${Math.round(imageBase64.length / 1024)}KB)`);

      // Upload to Google Cloud Storage
      const timestamp = Date.now();
      const fileName = `notebooklm_infographic_${timestamp}.png`;
      const filePath = `ai-generated/${fileName}`;
      
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      
      const uploadResult = await objectStorageService.uploadFile(
        filePath,
        imageBuffer,
        "image/png",
        "public"
      );
      
      console.log(`[NotebookLM] Image uploaded to GCS:`, uploadResult.url);
      
      // Return URL through our api/public-media endpoint for social sharing compatibility
      // Extract object path from the full path - bucket is resolved internally
      // Format: /bucket-name/public/ai-generated/file.png -> public/ai-generated/file.png
      const bucketMatch = uploadResult.path.match(/^\/?[^/]+\/(.+)$/);
      const objectPath = bucketMatch ? bucketMatch[1] : `public/${filePath}`;
      const publicUrl = `/api/public-media/${objectPath}`;
      console.log(`[NotebookLM] Public URL: ${publicUrl}`);

      return {
        success: true,
        imageUrl: publicUrl,
        imageData: imageBase64,
      };
    } catch (error: any) {
      const generationTime = Math.round((Date.now() - startTime) / 1000);
      console.error(`[NotebookLM] Generation failed after ${generationTime}s:`, error);
      return {
        success: false,
        error: error.message || 'Failed to generate infographic',
      };
    }
  }

  /**
   * Get available features and limits
   */
  getCapabilities() {
    return {
      maxSources: 50,
      supportedFormats: ['PDF', 'TXT', 'MD', 'Google Docs', 'Google Slides', 'Audio', 'YouTube'],
      outputFormats: ['PNG'],
      languages: ['ar', 'en', 'ur', 'es', 'fr', 'de', 'zh', 'ja', 'ko'],
      detailLevels: ['concise', 'standard', 'detailed'],
      orientations: ['square', 'portrait', 'landscape'],
      features: {
        infographics: true,
        slideDecks: true,
        audioOverviews: true,
        summaries: true,
        faqs: true,
        studyGuides: true,
      },
    };
  }

  /**
   * Validate generation options
   */
  validateOptions(options: NotebookLMGenerationOptions): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!options.prompt || options.prompt.trim().length < 10) {
      errors.push('Content must be at least 10 characters');
    }

    if (options.prompt.length > 10000) {
      errors.push('Content exceeds maximum length of 10,000 characters');
    }

    const validDetails = ['concise', 'standard', 'detailed'];
    if (!validDetails.includes(options.detail)) {
      errors.push('Invalid detail level');
    }

    const validOrientations = ['square', 'portrait', 'landscape'];
    if (!validOrientations.includes(options.orientation)) {
      errors.push('Invalid orientation');
    }

    const capabilities = this.getCapabilities();
    if (!capabilities.languages.includes(options.language)) {
      errors.push('Unsupported language');
    }

    // Validate color style if provided
    if (options.colorStyle) {
      const validColorStyles = ['auto', 'vibrant', 'professional', 'elegant', 'modern'];
      if (!validColorStyles.includes(options.colorStyle)) {
        errors.push('Invalid color style');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton instance
export const notebookLmService = new NotebookLMService();

// Export class for testing
export { NotebookLMService, NotebookLMGenerationOptions };
