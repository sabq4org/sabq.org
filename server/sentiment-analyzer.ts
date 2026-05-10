import { aiManager, AI_MODELS } from './ai-manager';
import pRetry from 'p-retry';

/**
 * Result of sentiment analysis
 */
export interface SentimentAnalysisResult {
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number; // 0-1
  provider: string;
  model: string;
  rawMetadata?: any;
}

/**
 * Detects the language of the given text using regex patterns
 * @param text - Text to analyze
 * @returns Detected language code ('ar', 'en', or 'ur')
 */
export function detectLanguage(text: string): 'ar' | 'en' | 'ur' {
  // Arabic Unicode range (U+0600 to U+06FF)
  const arabicPattern = /[\u0600-\u06FF]/;
  
  // Urdu-specific characters (subset of Arabic/Persian script)
  // These characters are more common in Urdu than standard Arabic
  const urduPattern = /[\u0679\u067E\u0686\u0688\u0691\u0698\u06A9\u06AF\u06BA\u06BE\u06C1\u06C3]/;
  
  // Check for Urdu-specific characters first
  if (urduPattern.test(text)) {
    return 'ur';
  }
  
  // Then check for general Arabic script
  if (arabicPattern.test(text)) {
    return 'ar';
  }
  
  // Default to English
  return 'en';
}

/**
 * Gets the appropriate prompt template for the given language
 * Prompts are structured to request specific output format for easier parsing
 * @param language - Language code
 * @param commentText - Comment text to analyze
 * @returns Formatted prompt string
 */
function getPromptForLanguage(language: 'ar' | 'en' | 'ur', commentText: string): string {
  const prompts = {
    ar: `حلل مشاعر هذا التعليق. حدد ما إذا كان إيجابي أو محايد أو سلبي مع درجة الثقة (من 0 إلى 1).

التعليق: "${commentText}"

يرجى الرد بالصيغة التالية فقط:
المشاعر: [إيجابي/محايد/سلبي]
الثقة: [رقم من 0 إلى 1]`,
    
    en: `Analyze the sentiment of this comment. Determine if it's positive, neutral, or negative with a confidence score (0 to 1).

Comment: "${commentText}"

Please respond in the following format only:
Sentiment: [positive/neutral/negative]
Confidence: [number from 0 to 1]`,
    
    ur: `اس تبصرے کے جذبات کا تجزیہ کریں۔ طے کریں کہ یہ مثبت، غیر جانبدار یا منفی ہے اور اعتماد کا درجہ (0 سے 1 تک) بتائیں۔

تبصرہ: "${commentText}"

براہ کرم صرف اس فارمیٹ میں جواب دیں:
جذبات: [مثبت/غیر جانبدار/منفی]
اعتماد: [0 سے 1 تک کا عدد]`,
  };
  
  return prompts[language];
}

/**
 * Parses the AI response to extract sentiment and confidence
 * Handles various response formats and languages
 * @param response - AI response text
 * @returns Parsed sentiment and confidence
 */
function parseSentimentResponse(response: string): { sentiment: 'positive' | 'neutral' | 'negative'; confidence: number } {
  const lowerResponse = response.toLowerCase();
  
  // Try to extract sentiment
  let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
  
  // Check for positive indicators
  if (
    lowerResponse.includes('positive') || 
    lowerResponse.includes('إيجابي') || 
    lowerResponse.includes('ايجابي') || 
    lowerResponse.includes('مثبت')
  ) {
    sentiment = 'positive';
  } 
  // Check for negative indicators
  else if (
    lowerResponse.includes('negative') || 
    lowerResponse.includes('سلبي') || 
    lowerResponse.includes('منفی') ||
    lowerResponse.includes('منفي')
  ) {
    sentiment = 'negative';
  } 
  // Check for neutral indicators
  else if (
    lowerResponse.includes('neutral') || 
    lowerResponse.includes('محايد') || 
    lowerResponse.includes('غیر جانبدار') ||
    lowerResponse.includes('غير جانبدار')
  ) {
    sentiment = 'neutral';
  }
  
  // Try to extract confidence score
  let confidence = 0.5; // Default confidence
  
  // Look for percentage patterns (e.g., "85%", "0.85")
  const percentageMatch = response.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentageMatch) {
    confidence = parseFloat(percentageMatch[1]) / 100;
  } else {
    // Look for decimal patterns (0.xx)
    const decimalMatch = response.match(/\b0\.\d+\b/);
    if (decimalMatch) {
      confidence = parseFloat(decimalMatch[0]);
    } else {
      // Look for "Confidence: X" or similar patterns
      const confidenceMatch = response.match(/(?:confidence|ثقة|اعتماد):\s*(\d+(?:\.\d+)?)/i);
      if (confidenceMatch) {
        const value = parseFloat(confidenceMatch[1]);
        // If value > 1, assume it's a percentage
        confidence = value > 1 ? value / 100 : value;
      }
    }
  }
  
  // Ensure confidence is between 0 and 1
  confidence = Math.max(0, Math.min(1, confidence));
  
  return { sentiment, confidence };
}

/**
 * Analyzes the sentiment of a comment using AI models
 * 
 * Uses Claude Sonnet 4-5 as the primary model for accuracy,
 * with automatic fallback to Gemini Flash if Claude fails.
 * Implements retry logic with p-retry (3 attempts per model).
 * 
 * @param commentText - The comment text to analyze
 * @param language - Language of the comment ('ar', 'en', or 'ur')
 * @returns Sentiment analysis result with sentiment, confidence, and metadata
 * @throws Error if all AI models fail after retries
 * 
 * @example
 * ```typescript
 * const result = await analyzeSentiment("This is great!", "en");
 * console.log(result.sentiment); // "positive"
 * console.log(result.confidence); // 0.95
 * ```
 */
export async function analyzeSentiment(
  commentText: string,
  language: 'ar' | 'en' | 'ur'
): Promise<SentimentAnalysisResult> {
  // Handle edge case: empty text
  if (!commentText || commentText.trim().length === 0) {
    return {
      sentiment: 'neutral',
      confidence: 0,
      provider: 'none',
      model: 'none',
      rawMetadata: { error: 'Empty comment text' },
    };
  }
  
  // Handle edge case: very short comments
  if (commentText.trim().length < 3) {
    return {
      sentiment: 'neutral',
      confidence: 0.3,
      provider: 'heuristic',
      model: 'length-based',
      rawMetadata: { reason: 'Comment too short for meaningful analysis' },
    };
  }
  
  const prompt = getPromptForLanguage(language, commentText);
  
  // Try primary model (Claude Sonnet 4-5) with retries
  try {
    const result = await pRetry(
      async () => {
        const response = await aiManager.generate(prompt, {
          ...AI_MODELS.CLAUDE_SONNET,
          maxTokens: 150,
          temperature: 0.3, // Lower temperature for more consistent results
        });
        
        if (response.error) {
          throw new Error(`Claude error: ${response.error}`);
        }
        
        const parsed = parseSentimentResponse(response.content);
        
        return {
          sentiment: parsed.sentiment,
          confidence: parsed.confidence,
          provider: response.provider,
          model: response.model,
          rawMetadata: {
            content: response.content,
            usage: response.usage,
          },
        };
      },
      {
        retries: 3,
        minTimeout: 1000,
        onFailedAttempt: (error: any) => {
          console.log(`[SentimentAnalyzer] Claude attempt ${error.attemptNumber} failed:`, error);
        },
      }
    );
    
    return result;
  } catch (claudeError: any) {
    console.warn(`[SentimentAnalyzer] Claude Sonnet failed after retries: ${claudeError.message}`);
    
    // Fallback to Gemini Flash
    try {
      const result = await pRetry(
        async () => {
          const response = await aiManager.generate(prompt, {
            ...AI_MODELS.GEMINI_FLASH,
            maxTokens: 150,
            temperature: 0.3,
          });
          
          if (response.error) {
            throw new Error(`Gemini error: ${response.error}`);
          }
          
          const parsed = parseSentimentResponse(response.content);
          
          return {
            sentiment: parsed.sentiment,
            confidence: parsed.confidence,
            provider: response.provider,
            model: response.model,
            rawMetadata: {
              content: response.content,
              usage: response.usage,
              fallbackReason: 'Claude Sonnet failed',
            },
          };
        },
        {
          retries: 3,
          minTimeout: 1000,
          onFailedAttempt: (error: any) => {
            console.log(`[SentimentAnalyzer] Gemini attempt ${error.attemptNumber} failed:`, error);
          },
        }
      );
      
      return result;
    } catch (geminiError: any) {
      console.error(`[SentimentAnalyzer] Both AI models failed for sentiment analysis`);
      throw new Error(
        `Sentiment analysis failed. Claude: ${claudeError.message}, Gemini: ${geminiError.message}`
      );
    }
  }
}
