import { GoogleGenerativeAI } from "@google/generative-ai";
import pRetry from "p-retry";

const genAI = new GoogleGenerativeAI(process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

interface GenerateImageOptions {
  prompt: string;
  width?: number;
  height?: number;
  style?: 'vivid' | 'natural';
  quality?: 'standard' | 'hd';
  useGemini?: boolean;
}

class ImageGenerationService {
  /**
   * Generate an image using AI
   */
  async generateImage(options: GenerateImageOptions): Promise<string> {
    const {
      prompt,
      width = 1024,
      height = 1024,
      style = 'vivid',
      quality = 'hd',
      useGemini = true
    } = options;

    try {
      // For now, we'll use Nano Banana Pro API or a placeholder
      // In production, this would call actual image generation APIs
      
      if (useGemini) {
        // Generate detailed prompt for image generation
        const enhancedPrompt = await this.enhancePrompt(prompt);
        
        // Call Nano Banana Pro or another image generation service
        const imageUrl = await this.callImageGenerationAPI({
          prompt: enhancedPrompt,
          width,
          height,
          style,
          quality
        });
        
        return imageUrl;
      } else {
        // Fallback to placeholder image
        return this.generatePlaceholder(width, height, prompt);
      }
    } catch (error) {
      console.error("Error generating image:", error);
      // Return placeholder on error
      return this.generatePlaceholder(width, height, prompt);
    }
  }

  /**
   * Enhance prompt using Gemini
   */
  private async enhancePrompt(prompt: string): Promise<string> {
    try {
      const enhancementPrompt = `Enhance this image generation prompt to be more detailed and visually descriptive.
Keep it concise but add visual details like style, lighting, colors, and composition.

Original prompt: ${prompt}

Enhanced prompt (max 200 chars):`;

      const result = await model.generateContent(enhancementPrompt);
      return result.response.text().trim() || prompt;
    } catch (error) {
      console.error("Error enhancing prompt:", error);
      return prompt;
    }
  }

  /**
   * Call actual image generation API (placeholder for now)
   */
  private async callImageGenerationAPI(options: {
    prompt: string;
    width: number;
    height: number;
    style: string;
    quality: string;
  }): Promise<string> {
    // This would integrate with Nano Banana Pro or other services
    // For now, return a placeholder
    
    // In production:
    // const response = await fetch('https://api.nanobananapro.com/generate', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${process.env.NANO_BANANA_API_KEY}`,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify(options)
    // });
    // const data = await response.json();
    // return data.imageUrl;
    
    // Placeholder for development
    return this.generatePlaceholder(options.width, options.height, options.prompt);
  }

  /**
   * Generate placeholder image URL
   */
  private generatePlaceholder(width: number, height: number, text: string): string {
    // Use a placeholder service
    const encodedText = encodeURIComponent(text.substring(0, 30));
    return `https://via.placeholder.com/${width}x${height}/1a73e8/ffffff?text=${encodedText}`;
  }

  /**
   * Generate and upload image to storage
   */
  async generateAndUpload(
    prompt: string,
    path: string,
    options?: Partial<GenerateImageOptions>
  ): Promise<string> {
    try {
      // Generate the image
      const imageUrl = await this.generateImage({
        prompt,
        ...options
      });

      // If it's already uploaded (not a placeholder), return it
      if (!imageUrl.includes('placeholder')) {
        return imageUrl;
      }

      // For placeholders, we could optionally upload them to storage
      // In production, the generated images would already be uploaded
      return imageUrl;
    } catch (error) {
      console.error("Error in generateAndUpload:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const imageGenerationService = new ImageGenerationService();
export default imageGenerationService;