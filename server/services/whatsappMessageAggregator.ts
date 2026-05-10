import { storage } from "../storage";
import { log } from "../utils/logger";
import { PendingWhatsappMessage, tags, articleTags } from "@shared/schema";
import { sendWhatsAppMessage, extractTokenFromMessage, removeTokenFromMessage, updateLastInboundTime } from "./whatsapp";
import { analyzeAndEditWithSabqStyle, detectLanguage } from "../ai/contentAnalyzer";
import { nanoid } from "nanoid";
import { db } from "../db";
import { mediaFiles, articleMediaAssets } from "@shared/schema";
import { memoryCache } from "../memoryCache";
import { invalidatePublishedContent } from "./contentInvalidation";
import { eq } from "drizzle-orm";
import { detectUrls, isNewsUrl, containsOnlyUrl, extractArticleContent, getSourceAttribution } from "./urlContentExtractor";

// تم تغيير وقت الانتظار إلى 0 للنشر الفوري
// الأخبار الطويلة ستُنشر عبر البريد الذكي بدلاً من ذلك
const AGGREGATION_WINDOW_SECONDS = 0;
const PROCESSING_INTERVAL_MS = 120000; // كل دقيقتين لتقليل الضغط على قاعدة البيانات

interface ProcessingContext {
  phoneNumber: string;
  token: string;
  combinedText: string;
  mediaUrls: string[];
  tokenData: any;
  pendingId: string;
}

function generateSlug(text: string): string {
  const baseSlug = text
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\u0600-\u06FFa-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  return `${baseSlug}-${Date.now()}`;
}

export async function processAggregatedMessage(pending: PendingWhatsappMessage): Promise<void> {
  const startTime = Date.now();
  
  log.info(`[WhatsApp Aggregator] Processing aggregated message: ${pending.id}`);
  log.info(`[WhatsApp Aggregator] - Parts: ${pending.messageParts.length}`);
  log.info(`[WhatsApp Aggregator] - Media: ${pending.mediaUrls?.length || 0}`);
  
  const markedPending = await storage.markPendingMessageProcessing(pending.id);
  if (!markedPending) {
    log.info(`[WhatsApp Aggregator] Message already processing or deleted: ${pending.id}`);
    return;
  }
  
  try {
    const combinedText = pending.messageParts.join('\n\n');
    const mediaUrls = pending.mediaUrls || [];
    
    log.info(`[WhatsApp Aggregator] Combined text length: ${combinedText.length} chars`);
    
    const webhookLog = await storage.createWhatsappWebhookLog({
      from: pending.phoneNumber,
      message: combinedText,
      status: "received",
      token: pending.token,
      userId: pending.userId || undefined,
      tokenId: pending.tokenId || undefined,
      mediaUrls: mediaUrls,
    });
    
    const tokenData = await storage.getWhatsappTokenByToken(pending.token);
    
    if (!tokenData || !tokenData.isActive) {
      log.info(`[WhatsApp Aggregator] Token invalid or inactive: ${pending.token}`);
      
      await storage.updateWhatsappWebhookLog(webhookLog.id, {
        status: "rejected",
        reason: tokenData ? "token_inactive" : "invalid_token",
        processingTimeMs: Date.now() - startTime,
      });
      
      await storage.deletePendingWhatsappMessage(pending.id);
      return;
    }
    
    let cleanText = removeTokenFromMessage(combinedText);
    
    // 🔗 URL CONTENT EXTRACTION: Check if message contains a news URL
    let urlExtractionResult: any = null;
    let extractedFromUrl = false;
    const detectedUrls = detectUrls(cleanText);
    
    if (detectedUrls.length > 0) {
      log.info(`[WhatsApp Aggregator] 🔗 Detected URLs: ${detectedUrls.join(', ')}`);
      
      const newsUrl = detectedUrls.find(url => isNewsUrl(url));
      
      if (newsUrl && containsOnlyUrl(cleanText)) {
        log.info(`[WhatsApp Aggregator] 🌐 URL-only message, extracting content from: ${newsUrl}`);
        
        try {
          urlExtractionResult = await extractArticleContent(newsUrl);
          
          if (urlExtractionResult.success && urlExtractionResult.article) {
            log.info(`[WhatsApp Aggregator] ✅ URL extraction successful!`);
            log.info(`[WhatsApp Aggregator]    - Title: ${urlExtractionResult.article.title}`);
            log.info(`[WhatsApp Aggregator]    - Source: ${urlExtractionResult.article.sourceNameAr}`);
            log.info(`[WhatsApp Aggregator]    - Attribution: ${urlExtractionResult.article.attribution}`);
            
            // Replace message content with extracted article
            cleanText = `${urlExtractionResult.article.title}\n\n${urlExtractionResult.article.content}`;
            extractedFromUrl = true;
            
            // Use image from source if no images uploaded
            if (urlExtractionResult.article.imageUrl && mediaUrls.length === 0) {
              log.info(`[WhatsApp Aggregator] 🖼️ Using source image: ${urlExtractionResult.article.imageUrl}`);
              mediaUrls.push(urlExtractionResult.article.imageUrl);
            }
          } else {
            log.info(`[WhatsApp Aggregator] ⚠️ URL extraction failed: ${urlExtractionResult.error}`);
          }
        } catch (extractError: any) {
          console.error(`[WhatsApp Aggregator] ❌ URL extraction error: ${extractError.message}`);
        }
      }
    }
    
    if (!mediaUrls.length && cleanText.trim().length < 10) {
      log.info(`[WhatsApp Aggregator] Text too short: ${cleanText.length} chars`);
      
      await storage.updateWhatsappWebhookLog(webhookLog.id, {
        status: "rejected",
        reason: "text_too_short",
        userId: tokenData.userId,
        processingTimeMs: Date.now() - startTime,
      });
      
      await storage.deletePendingWhatsappMessage(pending.id);
      return;
    }
    
    const targetLang = "ar" as const;
    const categories = await storage.getAllCategories();
    const aiResult = await analyzeAndEditWithSabqStyle(cleanText, targetLang, categories);
    
    log.info(`[WhatsApp Aggregator] AI analysis complete. Quality: ${aiResult.qualityScore}`);
    
    if (aiResult.qualityScore < 10 || !aiResult.hasNewsValue) {
      log.info(`[WhatsApp Aggregator] Quality too low or no news value`);
      
      await storage.updateWhatsappWebhookLog(webhookLog.id, {
        status: "rejected",
        reason: "low_quality",
        userId: tokenData.userId,
        qualityScore: aiResult.qualityScore,
        aiAnalysis: {
          detectedLanguage: aiResult.language,
          detectedCategory: aiResult.detectedCategory,
          hasNewsValue: aiResult.hasNewsValue,
          issues: aiResult.issues,
        },
        processingTimeMs: Date.now() - startTime,
      });
      
      updateLastInboundTime(pending.phoneNumber);
      await sendWhatsAppMessage({
        to: pending.phoneNumber,
        body: `السلام عليكم\n❌ لم يتم نشر الخبر\n\nالسبب: ${aiResult.issues?.join(', ') || 'جودة المحتوى غير كافية'}`,
      });
      
      await storage.deletePendingWhatsappMessage(pending.id);
      return;
    }
    
    const category = categories.find(
      c => c.nameAr === aiResult.detectedCategory || c.nameEn === aiResult.detectedCategory
    );
    
    const slug = generateSlug(aiResult.optimized.title);
    const englishSlug = nanoid(7); // Short URL for social media sharing
    const articleStatus = tokenData.autoPublish ? 'published' : 'draft';
    
    // 🔗 Prepare source metadata (include external source info for URL-extracted articles)
    const sourceMetadata = extractedFromUrl && urlExtractionResult?.article ? {
      type: 'whatsapp_url_extracted',
      from: pending.phoneNumber,
      token: pending.token,
      partsCount: pending.messageParts.length,
      webhookLogId: webhookLog.id,
      externalSource: urlExtractionResult.article.sourceNameAr,
      externalUrl: urlExtractionResult.article.sourceUrl,
      attribution: urlExtractionResult.article.attribution,
    } : {
      type: 'whatsapp_aggregated',
      from: pending.phoneNumber,
      token: pending.token,
      partsCount: pending.messageParts.length,
      webhookLogId: webhookLog.id,
    };
    
    // 📰 Newspaper account ID for default reporter ("صحيفة سبق")
    const NEWSPAPER_ACCOUNT_ID = 'RnP7eDOAl5T5rGpib9_8d';
    
    const article = await storage.createArticle({
      title: aiResult.optimized.title,
      slug,
      englishSlug,
      content: aiResult.optimized.content,
      excerpt: aiResult.optimized.lead,
      imageUrl: mediaUrls[0] || null,
      categoryId: category?.id || null,
      authorId: tokenData.userId,
      reporterId: NEWSPAPER_ACCOUNT_ID, // 📰 Default to صحيفة سبق for WhatsApp articles
      status: articleStatus,
      publishedAt: articleStatus === 'published' ? new Date() : null,
      source: extractedFromUrl ? 'url' : 'whatsapp',
      sourceMetadata: sourceMetadata,
      seoKeywords: aiResult.optimized.seoKeywords,
      articleType: "news",
      newsType: "regular",
      hideFromHomepage: false,
      displayOrder: Date.now(),
    } as any);
    
    log.info(`[WhatsApp Aggregator] Article created: ${article.id}`);
    
    // إنشاء الوسوم من الكلمات المفتاحية
    const seoKeywords = aiResult.optimized.seoKeywords || [];
    if (seoKeywords.length > 0) {
      log.info(`[WhatsApp Aggregator] Creating ${seoKeywords.length} tags from keywords...`);
      
      for (const keyword of seoKeywords.slice(0, 8)) {
        try {
          const cleanKeyword = keyword.trim();
          if (!cleanKeyword || cleanKeyword.length < 2) continue;
          
          const tagSlug = cleanKeyword
            .toLowerCase()
            .replace(/[\s_]+/g, '-')
            .replace(/[^\u0600-\u06FFa-z0-9-]/g, '')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
          
          if (!tagSlug) continue;
          
          // البحث عن الوسم أو إنشاؤه
          let existingTag = await db.select().from(tags).where(eq(tags.slug, tagSlug)).limit(1);
          
          let tagId: string;
          if (existingTag.length > 0) {
            tagId = existingTag[0].id;
          } else {
            const [newTag] = await db.insert(tags).values({
              nameAr: cleanKeyword,
              nameEn: cleanKeyword,
              slug: tagSlug,
            }).returning();
            tagId = newTag.id;
            log.info(`[WhatsApp Aggregator] Created new tag: ${cleanKeyword}`);
          }
          
          // ربط الوسم بالمقال
          await db.insert(articleTags).values({
            articleId: article.id,
            tagId: tagId,
          }).onConflictDoNothing();
          
        } catch (tagError) {
          console.error(`[WhatsApp Aggregator] Failed to create/link tag "${keyword}":`, tagError);
        }
      }
    }
    
    // مسح الكاش فوراً لظهور الخبر مباشرة (cross-pod fanout + Cloudflare purge)
    if (articleStatus === 'published') {
      invalidatePublishedContent({
        articleSlug: (article as any)?.slug,
        isBreaking: false,
        reason: `whatsapp-aggregator-publish:${article.id}`,
      });
    } else {
      memoryCache.invalidatePattern('^homepage');
      memoryCache.invalidatePattern('^blocks:');
    }
    log.info(`[WhatsApp Aggregator] Cache invalidated for immediate visibility`);
    
    if (mediaUrls.length > 0) {
      log.info(`[WhatsApp Aggregator] Linking ${mediaUrls.length} images to article...`);
      
      for (let i = 0; i < mediaUrls.length; i++) {
        const url = mediaUrls[i];
        
        try {
          const titleWords = aiResult.optimized.title.split(' ').slice(0, 8).join(' ');
          let altText = i === 0 
            ? `صورة ${titleWords}`
            : `${aiResult.optimized.lead.split(' ').slice(0, 5).join(' ')} - صورة ${i + 1}`;
          
          if (altText.length > 125) {
            altText = altText.substring(0, 122) + "...";
          }
          
          await db.transaction(async (tx) => {
            const filename = url.split('/').pop() || `image-${nanoid()}.jpg`;
            
            const [mediaFile] = await tx.insert(mediaFiles).values({
              fileName: filename,
              originalName: filename,
              url: url,
              type: "image",
              mimeType: "image/jpeg",
              size: 0,
              category: "articles",
              uploadedBy: tokenData.userId,
              title: `${titleWords} - صورة ${i + 1}`,
              keywords: ["whatsapp", "auto-upload", "aggregated"],
              altText: altText,
            }).returning();
            
            await tx.insert(articleMediaAssets).values({
              articleId: article.id,
              mediaFileId: mediaFile.id,
              locale: targetLang,
              displayOrder: i,
              altText: altText,
              moderationStatus: "approved",
              sourceName: "WhatsApp (Aggregated)",
            });
            
            log.info(`[WhatsApp Aggregator] Linked image ${i + 1} to article`);
          });
        } catch (linkError) {
          console.error(`[WhatsApp Aggregator] Failed to link image ${i + 1}:`, linkError);
        }
      }
    }
    
    await storage.updateWhatsappTokenUsage(tokenData.id);
    
    await storage.updateWhatsappWebhookLog(webhookLog.id, {
      status: "processed",
      userId: tokenData.userId,
      tokenId: tokenData.id,
      articleId: article.id,
      articleLink: `https://sabq.org/article/${englishSlug}`,
      publishStatus: articleStatus,
      qualityScore: aiResult.qualityScore,
      aiAnalysis: {
        detectedLanguage: aiResult.language,
        detectedCategory: aiResult.detectedCategory,
        hasNewsValue: aiResult.hasNewsValue,
        issues: aiResult.issues || [],
      },
      processingTimeMs: Date.now() - startTime,
    });
    
    const partsInfo = pending.messageParts.length > 1 
      ? `\n📝 تم دمج ${pending.messageParts.length} رسائل`
      : '';
    
    const replyMessage = articleStatus === 'published'
      ? `السلام عليكم\n✅ تم نشر الخبر بنجاح${partsInfo}\n\nhttps://sabq.org/article/${englishSlug}`
      : `السلام عليكم\n📝 تم حفظ الخبر كمسودة${partsInfo}\nسيتم مراجعته قبل النشر`;
    
    log.info(`[WhatsApp Aggregator] 📤 Sending publication reply to ${pending.phoneNumber}...`);
    log.info(`[WhatsApp Aggregator] 📤 Reply message: ${replyMessage}`);
    
    // Refresh the 24-hour window tracking before sending (in case server restarted)
    updateLastInboundTime(pending.phoneNumber);
    
    try {
      // Use status callback to track delivery status
      const frontendUrl = process.env.FRONTEND_URL || 'https://sabq.org';
      const statusCallbackUrl = `${frontendUrl}/api/whatsapp/status-callback`;
      
      const sendResult = await sendWhatsAppMessage({
        to: pending.phoneNumber,
        body: replyMessage,
        statusCallback: statusCallbackUrl,
      });
      
      if (sendResult) {
        log.info(`[WhatsApp Aggregator] ✅ Publication link SENT SUCCESSFULLY to ${pending.phoneNumber}`);
      } else {
        console.error(`[WhatsApp Aggregator] ❌ sendWhatsAppMessage returned FALSE - Twilio not configured?`);
      }
    } catch (sendError) {
      console.error(`[WhatsApp Aggregator] ❌ EXCEPTION sending reply:`, sendError instanceof Error ? sendError.message : sendError);
      if (sendError instanceof Error) {
        console.error(`[WhatsApp Aggregator] Stack:`, sendError.stack);
      }
    }
    
    log.info(`[WhatsApp Aggregator] ✅ Successfully processed aggregated message: ${pending.id}`);
    
    await storage.deletePendingWhatsappMessage(pending.id);
    
  } catch (error) {
    console.error(`[WhatsApp Aggregator] Error processing message ${pending.id}:`, error);
    
    await storage.deletePendingWhatsappMessage(pending.id);
    
    try {
      updateLastInboundTime(pending.phoneNumber);
      await sendWhatsAppMessage({
        to: pending.phoneNumber,
        body: `السلام عليكم\n❌ حدث خطأ أثناء معالجة الرسالة\nيرجى المحاولة مرة أخرى`,
      });
    } catch (sendError) {
      console.error(`[WhatsApp Aggregator] Failed to send error message:`, sendError);
    }
  }
}

export async function processExpiredMessages(): Promise<void> {
  try {
    const expiredMessages = await storage.getExpiredPendingMessages();
    
    if (expiredMessages.length === 0) {
      return;
    }
    
    log.info(`[WhatsApp Aggregator] Found ${expiredMessages.length} expired messages to process`);
    
    for (const pending of expiredMessages) {
      try {
        await processAggregatedMessage(pending);
      } catch (messageError) {
        console.error(`[WhatsApp Aggregator] ❌ Error processing message ${pending.id}:`, messageError);
        // Continue with next message instead of stopping
        try {
          await storage.deletePendingWhatsappMessage(pending.id);
        } catch (deleteError) {
          console.error(`[WhatsApp Aggregator] Failed to cleanup:`, deleteError);
        }
      }
    }
  } catch (error) {
    console.error(`[WhatsApp Aggregator] Error in processExpiredMessages:`, error);
  }
}

let processingInterval: NodeJS.Timeout | null = null;

export function startMessageAggregatorJob(): void {
  if (processingInterval) {
    log.info(`[WhatsApp Aggregator] Job already running`);
    return;
  }
  
  log.info(`[WhatsApp Aggregator] Starting aggregator job (interval: ${PROCESSING_INTERVAL_MS}ms)`);
  
  processExpiredMessages();
  
  processingInterval = setInterval(processExpiredMessages, PROCESSING_INTERVAL_MS);
}

export function stopMessageAggregatorJob(): void {
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
    log.info(`[WhatsApp Aggregator] Job stopped`);
  }
}

export async function addMessagePart(data: {
  phoneNumber: string;
  token: string;
  tokenId?: string;
  userId?: string;
  messagePart: string;
  mediaUrls?: string[];
  forceProcess?: boolean;
}): Promise<{ pending: PendingWhatsappMessage; isFirst: boolean }> {
  const existing = await storage.getPendingWhatsappMessage(data.phoneNumber, data.token);
  const isFirst = !existing;
  
  const pending = await storage.createOrUpdatePendingWhatsappMessage({
    phoneNumber: data.phoneNumber,
    token: data.token,
    tokenId: data.tokenId,
    userId: data.userId,
    messagePart: data.messagePart,
    mediaUrls: data.mediaUrls,
    aggregationWindowSeconds: AGGREGATION_WINDOW_SECONDS,
  });
  
  log.info(`[WhatsApp Aggregator] ${isFirst ? 'Created' : 'Updated'} pending message: ${pending.id}`);
  log.info(`[WhatsApp Aggregator] - Total parts: ${pending.messageParts.length}`);
  log.info(`[WhatsApp Aggregator] - Expires at: ${pending.expiresAt}`);
  
  if (data.forceProcess) {
    log.info(`[WhatsApp Aggregator] Force processing requested`);
    await processAggregatedMessage(pending);
    return { pending, isFirst };
  }
  
  return { pending, isFirst };
}

export function shouldForceProcess(text: string): boolean {
  const forceKeywords = ['إرسال', 'نهاية', 'انشر', 'publish', 'send', 'done', 'end'];
  const normalizedText = text.trim().toLowerCase();
  
  return forceKeywords.some(keyword => 
    normalizedText === keyword.toLowerCase() || 
    normalizedText.startsWith(keyword.toLowerCase())
  );
}

export { AGGREGATION_WINDOW_SECONDS };
