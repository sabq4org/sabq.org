import { Router, Request, Response } from "express";
import multer from "multer";
import { simpleParser } from "mailparser";
import mammoth from "mammoth";
import * as pdfParse from "pdf-parse";
import OpenAI from "openai";
import { storage } from "../storage";
import { analyzeAndEditWithSabqStyle, detectLanguage, normalizeLanguageCode } from "../ai/contentAnalyzer";
import { objectStorageClient, ObjectStorageService } from "../objectStorage";
import { needsWebpTranscode, normalizeImageForUpload } from "../utils/imageVerify";
import { newsImageStorageService } from "../services/newsImageStorageService";
import { nanoid } from "nanoid";
import { isAuthenticated } from "../auth";
import { requireRole, requirePermission } from "../rbac";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { mediaFiles, articleMediaAssets, enArticles } from "@shared/schema";
import { nanoid as generateEnglishSlug } from "nanoid";
import { memoryCache } from "../memoryCache";
import { invalidatePublishedContent } from "../services/contentInvalidation";
import { detectUrls, isNewsUrl, containsOnlyUrl, extractArticleContent, getSourceAttribution } from "../services/urlContentExtractor";
import { sendEditorPublishAlert, getPublisherName } from "../services/editorAlerts";
import { riyadhDayRange } from "../utils/riyadhDay";
import {
  claimEmailDedup,
  extractEmailAddress,
  releaseEmailContentDedup,
  sweepStuckEmailLogs,
} from "../services/emailAgentDedup";
import {
  buildSenderReply,
  emailAgentRepliesEnabled,
  evaluateSenderAuth,
  pickFallbackCategory,
  selectEditorialCategories,
  matchDetectedCategory,
  redactEmailTokens,
  resolveSenderToken,
  senderAuthEnforced,
  shouldOcrAttachedImages,
  wantsNewspaperByline,
  evaluateSenderToken,
  isReprocessableLog,
  isTokenExpiryOption,
  type SenderAuthVerdict,
  type SenderReplyOutcome,
} from "../services/emailAgentGuards";
import {
  claimLogForReprocess,
  getEmailWebhookLogById,
  releaseReprocessClaim,
  revokePreviousSenderToken,
  rotateSenderToken,
} from "../services/emailAgentTokens";
import { denyBannedWords } from "../services/publishBannedWordsService";
import { sendEmailNotification } from "../services/email";
import { trackedOpenAICompletion } from "../ai/gateway/trackedOpenAI";
import { z } from "zod";
import { parsePage, parseLimit } from "../utils/pagination";
import { requireInboundWebhookSecret } from "../services/emailAgentAuth";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB for file attachments (SendGrid's max)
    fieldSize: 50 * 1024 * 1024, // 50MB for raw MIME email field (increased to handle large emails with attachments)
    files: 30,
    fields: 100,
    parts: 150,
  },
});

// قراءة الصور و PDF الممسوح تُسجَّل في مركز الذكاء تحت «وكيل البريد» لتظهر تكلفتها.
const OCR_FEATURE = "email-agent";

interface SendGridAttachment {
  filename: string;
  type: string;
  content: Buffer;
}

// 🖼️ Extract inline/embedded images from HTML (base64 data URLs and CID references)
// This handles forwarded emails from Apple Mail and other clients that embed images in HTML
async function extractInlineImagesFromHtml(
  html: string,
  cidAttachments: Map<string, { buffer: Buffer; contentType: string; filename: string }>
): Promise<Array<{ buffer: Buffer; filename: string; contentType: string; size: number }>> {
  const extractedImages: Array<{ buffer: Buffer; filename: string; contentType: string; size: number }> = [];
  
  if (!html) return extractedImages;
  
  console.log("[Email Agent] 🔍 Scanning HTML for embedded images...");
  
  // 1. Extract base64 data URLs (data:image/jpeg;base64,...)
  const dataUrlRegex = /src\s*=\s*["']data:(image\/(?:jpeg|jpg|png|gif|webp));base64,([^"']+)["']/gi;
  let match;
  let dataUrlCount = 0;
  
  while ((match = dataUrlRegex.exec(html)) !== null) {
    try {
      const contentType = match[1];
      // Normalize base64: remove whitespace/newlines (common in forwarded HTML)
      const base64Data = match[2].replace(/[\s\n\r]/g, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Skip tiny images (likely tracking pixels or icons)
      if (buffer.length < 5000) {
        console.log(`[Email Agent] ⏭️ Skipping small data URL image (${buffer.length} bytes)`);
        continue;
      }
      
      const extension = contentType.split('/')[1] || 'jpg';
      const filename = `inline-image-${nanoid(8)}.${extension}`;
      
      extractedImages.push({
        buffer,
        filename,
        contentType,
        size: buffer.length
      });
      
      dataUrlCount++;
      console.log(`[Email Agent] 📸 Extracted data URL image: ${filename} (${(buffer.length / 1024).toFixed(2)} KB)`);
    } catch (error) {
      console.error("[Email Agent] ⚠️ Failed to extract data URL image:", error);
    }
  }
  
  // 2. Extract CID (Content-ID) references from HTML and match with attachments
  const cidRegex = /src\s*=\s*["']cid:([^"']+)["']/gi;
  let cidCount = 0;
  
  while ((match = cidRegex.exec(html)) !== null) {
    const cid = match[1];
    const cidAttachment = cidAttachments.get(cid) || cidAttachments.get(`<${cid}>`) || cidAttachments.get(cid.replace(/[<>]/g, ''));
    
    if (cidAttachment) {
      // Skip tiny images
      if (cidAttachment.buffer.length < 5000) {
        console.log(`[Email Agent] ⏭️ Skipping small CID image (${cidAttachment.buffer.length} bytes)`);
        continue;
      }
      
      extractedImages.push({
        buffer: cidAttachment.buffer,
        filename: cidAttachment.filename,
        contentType: cidAttachment.contentType,
        size: cidAttachment.buffer.length
      });
      
      cidCount++;
      console.log(`[Email Agent] 📸 Matched CID image: cid:${cid} -> ${cidAttachment.filename}`);
    } else {
      console.log(`[Email Agent] ⚠️ CID reference not found in attachments: ${cid}`);
    }
  }
  
  console.log(`[Email Agent] 🖼️ Extracted ${extractedImages.length} inline images (${dataUrlCount} data URLs, ${cidCount} CID refs)`);
  
  return extractedImages;
}

async function uploadAttachmentToGCS(
  file: Buffer,
  filename: string,
  contentType: string,
  isPublic: boolean = false
): Promise<string> {
  // Public editorial images use the shared R2 rollout with Cloudflare Images
  // fallback. Non-image attachments remain on the private object-store path.
  if (isPublic && contentType.startsWith('image/') && newsImageStorageService.isUploadAvailable()) {
    try {
      const imageResult = await newsImageStorageService.upload({
        buffer: file,
        filename,
        mimeType: contentType,
        purpose: 'email-article-image',
        metadata: { source: 'email-agent' },
        rolloutKey: `email:${filename}:${file.length}`,
      });

      if (imageResult.success && imageResult.deliveryUrl) {
        console.log(`[Email Agent] ☁️ Canonical image upload successful`);
        return imageResult.deliveryUrl;
      }
      console.log(`[Email Agent] ☁️ Canonical upload failed, falling back to GCS: ${imageResult.error}`);
    } catch (imageError) {
      console.error("[Email Agent] ☁️ Canonical upload error, falling back to GCS:", imageError);
    }
  }

  // باقي الملفات (Word وPDF والفيديو ونسخة «أعد المعالجة») عبر طبقة التخزين الموحدة:
  // R2 أو S3 على Render، وGCS على Replit فقط. كان المسار يستدعي عميل GCS مباشرة
  // فيفشل كل مرفق على Render (127.0.0.1:1106 ECONNREFUSED).
  try {
    const fileId = nanoid();
    // Reject anything other than a plain alphanumeric extension
    // (security audit H2, 2026-05-11). filename.split('.').pop() could
    // otherwise contain "../" and break out of email-attachments/.
    const rawExt = (filename.split('.').pop() || '').toLowerCase();
    const extension = /^[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : 'bin';
    const stored = await new ObjectStorageService().uploadFile(
      `email-attachments/${fileId}.${extension}`,
      file,
      contentType,
      isPublic ? "public" : "private",
    );
    console.log(`[Email Agent] ✅ Uploaded ${isPublic ? 'PUBLIC' : 'PRIVATE'} attachment: ${stored.path}`);
    // العام رابط مباشر، والخاص مفتاح يُقرأ برابط موقّع (anywhere: loadStoredAttachments ونقطة «عرض»)
    return isPublic ? stored.url : stored.path;
  } catch (error) {
    console.error("[Email Agent] Error uploading attachment:", error);
    throw error;
  }
}

/** مرفق خاص حُفظ عبر R2/S3 (مفتاح `.private/...`) لا عبر مسار GCS القديم. */
function isProviderPrivateKey(url: string): boolean {
  return url.startsWith(".private/");
}

/** يقرأ مرفقًا خاصًا: مفتاح R2/S3 برابط موقّع قصير، أو مسار GCS القديم (Replit). */
async function readStoredAttachment(url: string): Promise<Buffer> {
  if (isProviderPrivateKey(url)) {
    const signed = await new ObjectStorageService().getPrivateFileDownloadURL(url, 120);
    const response = await fetch(signed, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`attachment fetch failed: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  const { bucketName, objectPath } = parseObjectPath(url);
  const [buffer] = await objectStorageClient.bucket(bucketName).file(objectPath).download();
  return buffer;
}

/**
 * ينسخ صورة المصدر إلى تخزين سبق. المضيف يجب أن يكون من مصادر الأخبار الموثوقة
 * نفسها (https وقائمة النطاقات في urlContentExtractor) فلا يصل الطلب لعنوان داخلي.
 * أي فشل يعيد null وتبقى الصورة على رابطها الأصلي كما كانت.
 */
async function rehostSourceImage(imageUrl: string): Promise<string | null> {
  try {
    if (!isNewsUrl(imageUrl)) return null;
    const response = await fetch(imageUrl, { redirect: "error", signal: AbortSignal.timeout(10_000) });
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!response.ok || !/^image\/(jpeg|jpg|png|webp|gif)$/.test(contentType)) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 5000 || buffer.length > 10 * 1024 * 1024) return null;
    const url = await uploadAttachmentToGCS(buffer, `source-image-${nanoid(8)}.${contentType.split("/")[1]}`, contentType, true);
    return /^https:\/\//.test(url) ? url : null;
  } catch (error) {
    console.warn("[Email Agent] تعذر نسخ صورة المصدر:", (error as Error).message);
    return null;
  }
}

function parseObjectPath(path: string): { bucketName: string; objectPath: string } {
  const { getBucketConfig } = require('../objectStorage');
  const config = getBucketConfig();
  const REPLIT_BUCKET = config.bucketName;
  const BUCKET_ALIAS = 'sabq-production-bucket';
  
  let cleanPath = path.startsWith('/') ? path.substring(1) : path;
  
  // Remove bucket alias prefix (e.g., "sabq-production-bucket/public" -> "public")
  if (cleanPath.startsWith(`${BUCKET_ALIAS}/`)) {
    cleanPath = cleanPath.substring(BUCKET_ALIAS.length + 1);
  }
  
  // Remove raw bucket ID prefix (e.g., "replit-objstore-xxx/public" -> "public")
  if (cleanPath.startsWith(`${REPLIT_BUCKET}/`)) {
    cleanPath = cleanPath.substring(REPLIT_BUCKET.length + 1);
  }
  
  // Also handle any objstore pattern dynamically
  if (cleanPath.match(/^replit-objstore-[a-f0-9-]+\//)) {
    cleanPath = cleanPath.replace(/^replit-objstore-[a-f0-9-]+\//, '');
  }
  
  console.log(`[Email Agent] 🪣 Parsed object path: bucket="${REPLIT_BUCKET}", path="${cleanPath}"`);
  return { bucketName: REPLIT_BUCKET, objectPath: cleanPath };
}

function extractTokenFromText(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  
  const cleanText = text.replace(/<[^>]*>/g, ' ').trim();
  
  const patterns = [
    /\[TOKEN:\s*([A-F0-9]{64})\s*\]/i,
    /TOKEN:\s*([A-F0-9]{64})/i,
    /\b([A-F0-9]{64})\b/i,
  ];
  
  for (const pattern of patterns) {
    const match = cleanText.match(pattern);
    if (match && match[1]) {
      console.log(`[Email Agent] Token extracted using pattern: ${pattern.source}`);
      return match[1].toLowerCase();
    }
  }
  
  return null;
}

function generateSlug(text: string): string {
  const baseSlug = text
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\u0600-\u06FFa-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  // Add timestamp to ensure uniqueness
  return `${baseSlug}-${Date.now()}`;
}

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  } catch (error) {
    console.error("[Email Agent] Error extracting text from DOCX:", error);
    return "";
  }
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const data = await (pdfParse as any).default(buffer);
    const text = data.text.trim();
    console.log(`[Email Agent] 📄 PDF-parse extracted ${text.length} chars from PDF (${data.numpages} pages)`);
    
    // If pdf-parse extracted enough text, return it
    if (text.length > 50) {
      return text;
    }
    
    // Otherwise, this might be a scanned/image-based PDF - try OCR
    console.log(`[Email Agent] 📄 PDF text minimal (${text.length} chars), trying OCR on PDF...`);
    const ocrText = await extractTextFromPdfWithOcr(buffer);
    if (ocrText && ocrText.length > text.length) {
      console.log(`[Email Agent] 📄 OCR extracted ${ocrText.length} chars from scanned PDF`);
      return ocrText;
    }
    
    return text;
  } catch (error) {
    console.error("[Email Agent] Error extracting text from PDF:", error);
    // Try OCR as fallback
    try {
      console.log(`[Email Agent] 📄 PDF-parse failed, trying OCR fallback...`);
      const ocrText = await extractTextFromPdfWithOcr(buffer);
      if (ocrText && ocrText.length > 20) {
        return ocrText;
      }
    } catch (ocrError) {
      console.error("[Email Agent] OCR fallback also failed:", ocrError);
    }
    return "";
  }
}

// OCR for scanned PDFs - convert to images first, then use GPT-4o Vision
async function extractTextFromPdfWithOcr(buffer: Buffer): Promise<string> {
  try {
    const { fromBuffer } = await import("pdf2pic");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    console.log("[Email Agent] 🔍 Converting PDF to images for OCR...");
    
    // Configure pdf2pic to convert PDF pages to PNG images
    const convert = fromBuffer(buffer, {
      density: 200,           // DPI - higher for better OCR
      format: "png",
      width: 1600,
      height: 2000,
      savePath: "/tmp"        // Temporary path
    });
    
    // Convert first 3 pages (or all if fewer)
    const maxPages = 3;
    const allExtractedText: string[] = [];
    
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      try {
        console.log(`[Email Agent] 🔍 Converting PDF page ${pageNum} to image...`);
        const result = await convert(pageNum, { responseType: "base64" });
        
        if (!result || !result.base64) {
          console.log(`[Email Agent] 🔍 No more pages after page ${pageNum - 1}`);
          break;
        }
        
        // Run OCR on this page image using GPT-4o Vision
        console.log(`[Email Agent] 🔍 Running OCR on page ${pageNum}...`);
        const dataUrl = `data:image/png;base64,${result.base64}`;
        
        const response = await trackedOpenAICompletion(openai, OCR_FEATURE, {
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `أنت خبير في استخراج النص من المستندات. استخرج كل النص العربي والإنجليزي من هذه الصفحة.

قواعد مهمة:
1. استخرج النص بالضبط كما يظهر
2. حافظ على ترتيب النص والفقرات
3. إذا كانت الصفحة تحتوي على خبر أو بيان صحفي، استخرج كل التفاصيل
4. لا تضف أي تعليقات أو شروحات، فقط النص المستخرج`
                },
                {
                  type: "image_url",
                  image_url: {
                    url: dataUrl,
                    detail: "high"
                  }
                }
              ]
            }
          ],
          max_tokens: 4000,
          temperature: 0.1
        });
        
        const pageText = response.choices[0]?.message?.content?.trim() || "";
        if (pageText && pageText.length > 10 && pageText !== "لا يوجد نص") {
          console.log(`[Email Agent] 🔍 Page ${pageNum} OCR: ${pageText.length} chars`);
          allExtractedText.push(pageText);
        }
      } catch (pageError: any) {
        // Page doesn't exist or conversion failed
        if (pageError.message?.includes("Invalid page") || pageError.message?.includes("out of range")) {
          console.log(`[Email Agent] 🔍 No page ${pageNum}, stopping`);
          break;
        }
        console.error(`[Email Agent] Error on page ${pageNum}:`, pageError.message);
        break;
      }
    }
    
    const combinedText = allExtractedText.join("\n\n---\n\n");
    
    if (combinedText.length < 20) {
      console.log("[Email Agent] 🔍 PDF OCR: No/minimal text extracted");
      return "";
    }
    
    console.log(`[Email Agent] 🔍 PDF OCR total: ${combinedText.length} chars from ${allExtractedText.length} pages`);
    console.log(`[Email Agent] 🔍 PDF OCR preview: ${combinedText.substring(0, 200)}...`);
    return combinedText;
  } catch (error) {
    console.error("[Email Agent] Error in PDF OCR:", error);
    return "";
  }
}

async function extractTextFromImage(buffer: Buffer, mimeType: string): Promise<string> {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const base64Image = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Image}`;
    
    console.log("[Email Agent] 🔍 Running OCR on image using GPT-4o Vision...");
    
    const response = await trackedOpenAICompletion(openai, OCR_FEATURE, {
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `أنت خبير في استخراج النص من الصور. استخرج كل النص العربي والإنجليزي من هذه الصورة.

قواعد مهمة:
1. استخرج النص بالضبط كما يظهر في الصورة
2. حافظ على ترتيب النص وتنسيقه
3. إذا كانت الصورة تحتوي على خبر أو بيان صحفي، استخرج كل التفاصيل
4. إذا لم يكن هناك نص في الصورة، أجب بـ "لا يوجد نص"
5. لا تضف أي تعليقات أو شروحات، فقط النص المستخرج`
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
                detail: "high"
              }
            }
          ]
        }
      ],
      max_tokens: 4000,
      temperature: 0.1
    });
    
    const extractedText = response.choices[0]?.message?.content?.trim() || "";
    
    if (extractedText === "لا يوجد نص" || extractedText.length < 10) {
      console.log("[Email Agent] 🔍 OCR: No text found in image");
      return "";
    }
    
    console.log(`[Email Agent] ✅ OCR extracted ${extractedText.length} chars from image`);
    return extractedText;
  } catch (error) {
    console.error("[Email Agent] Error extracting text from image (OCR):", error);
    return "";
  }
}

// 🔒 DEDUPLICATION: In-memory fallback only when DB claim fails.
// Primary dedup is DB-backed via claimEmailDedup (Message-ID + sender/subject).
const processedEmails = new Map<string, number>(); // messageId -> timestamp
const DEDUP_TTL = 5 * 60 * 1000; // 5 minutes TTL for processed emails

function cleanupProcessedEmails() {
  const now = Date.now();
  const entries = Array.from(processedEmails.entries());
  for (const [key, timestamp] of entries) {
    if (now - timestamp > DEDUP_TTL) {
      processedEmails.delete(key);
    }
  }
}

setInterval(cleanupProcessedEmails, 5 * 60 * 1000);

// Shared-secret check for the SendGrid Inbound Parse webhook lives in
// services/emailAgentAuth.ts and runs before multer (Security audit C6).
/** Safe JSON response — no-op if we already ACKed SendGrid after dedup claim. */
function respondWebhook(res: Response, body: Record<string, unknown>, status = 200): void {
  if (res.headersSent) return;
  res.status(status).json(body);
}


/**
 * إعادة معالجة رسالة فشلت بعد التحقق من مرسلها ورمزها: تُعاد من النص والمرفقات
 * المحفوظة في السجل نفسه، بلا رمز (حُذف من السجل) وبلا حجز تكرار جديد.
 */
interface ReprocessContext {
  log: any;
  senderAuth: SenderAuthVerdict;
}

async function processInboundEmail(req: Request, res: Response, reprocess?: ReprocessContext): Promise<unknown> {
  let webhookLog: any = null; // Define outside try block so it's accessible in catch
  let dedupKey = ''; // Will be set after parsing
  let replyToSender: (outcome: SenderReplyOutcome) => void = () => undefined;
  let dedupFrom = "";
  let dedupSubject = "";
  let tokenWasVerified = false;
  // بعد إنشاء المقال لا تُفك بصمة التكرار ولا يُطلب من المرسل إعادة الإرسال ولا تُعرض
  // «أعد المعالجة»: الإعادة تنشر الخبر مرتين.
  let createdArticle: { id: string | null; published: boolean } | null = null;
  let senderAuthVerdict: SenderAuthVerdict | null = null;

  try {
    console.log("[Email Agent] ============ WEBHOOK START ============");
    console.log("[Email Agent] Received webhook from SendGrid");
    console.log("[Email Agent] Raw req.body keys:", Object.keys(req.body));
    
    let from = "";
    let to = "";
    let subject = "";
    let text = "";
    let html = "";
    let parsedAttachments: any[] = [];
    let messageId = ""; // For deduplication
    
    // Check if SendGrid sent raw email (Inbound Parse Raw mode)
    if (req.body.email) {
      console.log("[Email Agent] Detected RAW email format - parsing with mailparser");
      console.log("[Email Agent] Raw email length:", req.body.email.length);
      console.log("[Email Agent] Raw email type:", typeof req.body.email);
      
      // 🔍 DIAGNOSTIC: Check for field size truncation
      const MULTER_FIELD_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB
      if (req.body.email.length >= MULTER_FIELD_SIZE_LIMIT * 0.95) {
        console.warn("[Email Agent] ⚠️ WARNING: Raw email size approaching Multer fieldSize limit!");
        console.warn(`[Email Agent] Size: ${(req.body.email.length / 1024 / 1024).toFixed(2)}MB, Limit: ${(MULTER_FIELD_SIZE_LIMIT / 1024 / 1024).toFixed(2)}MB`);
      }
      
      try {
        // Parse the raw email using mailparser
        // CRITICAL: SendGrid sends raw MIME as string, must preserve binary data for attachments
        // Using 'binary' encoding prevents corruption of base64/binary attachment data
        const emailBuffer = typeof req.body.email === 'string' 
          ? Buffer.from(req.body.email, 'binary')  // ✅ Preserve binary data (images, files)
          : req.body.email;
        
        console.log("[Email Agent] Buffer created, size:", emailBuffer.length, "bytes");
        const parsed = await simpleParser(emailBuffer);
        
        // 🔒 Extract Message-ID for deduplication IMMEDIATELY after parsing
        messageId = parsed.messageId || '';
        console.log(`[Email Agent] 🔒 Parsed Message-ID: ${messageId}`);
        
        console.log("[Email Agent] 📧 Parsed email structure:");
        console.log("[Email Agent] - Has attachments array:", !!parsed.attachments);
        console.log("[Email Agent] - Attachments count:", parsed.attachments?.length || 0);
        
        // Use SendGrid's parsed from/to if available, otherwise extract from parsed email
        const parsedFrom = Array.isArray(parsed.from) ? parsed.from[0] : parsed.from;
        const parsedTo = Array.isArray(parsed.to) ? parsed.to[0] : parsed.to;
        from = req.body.from || (parsedFrom?.text || "");
        to = req.body.to || (parsedTo?.text || "");
        subject = parsed.subject || req.body.subject || "";
        text = parsed.text || "";
        html = typeof parsed.html === 'string' ? parsed.html : (parsed.html ? String(parsed.html) : "");
        
        // 📎 CRITICAL: Extract attachments from parsed email
        if (parsed.attachments && parsed.attachments.length > 0) {
          console.log(`[Email Agent] 📎 Found ${parsed.attachments.length} attachments in raw MIME`);
          parsedAttachments = parsed.attachments;
        }
        
        console.log("[Email Agent] Parsed email successfully:");
        // لا يُطبع العنوان ولا النص: فيهما رمز النشر ومحتوى لم يُنشر بعد.
        console.log("[Email Agent] - Text length:", text?.length || 0);
        console.log("[Email Agent] - HTML length:", html?.length || 0);
        console.log("[Email Agent] - Parsed attachments:", parsedAttachments.length);
      } catch (parseError) {
        console.error("[Email Agent] Error parsing raw email:", parseError);
        // Fallback to direct fields
        from = req.body.from || "";
        to = req.body.to || "";
        subject = req.body.subject || "";
      }
    } else {
      // SendGrid sent parsed fields (Inbound Parse Parsed mode)
      console.log("[Email Agent] Using parsed fields from SendGrid");
      from = req.body.from || req.body.sender || "";
      to = req.body.to || req.body.recipient || "";
      subject = req.body.subject || "";
      text = req.body.text || req.body.plain || req.body.body || "";
      html = req.body.html || req.body.html_body || "";
      // SendGrid provides headers as a string in parsed mode
      try {
        const headers = req.body.headers ? JSON.parse(req.body.headers) : {};
        messageId = headers['Message-ID'] || headers['message-id'] || '';
      } catch {
        messageId = '';
      }
    }
    
    // 🔒 DEDUPLICATION — Message-ID (SendGrid retries) + sender/subject window (resends)
    // Incident 2026-07-26: same story resent 6× with new Message-IDs → 5 published copies.
    const senderEmailEarly = extractEmailAddress(from);
    // إعادة المعالجة حجزت البصمة قبل الوصول إلى هنا.
    if (!reprocess) try {
      const claim = await claimEmailDedup({
        messageId,
        from,
        subject,
      });
      dedupKey = claim.messageKey;

      if (!claim.claimed) {
        console.log(
          `[Email Agent] 🔒 DUPLICATE DETECTED (${claim.reason}) — ${claim.messageKey.substring(0, 80)}`,
        );

        // Content resends should appear in the inbox as rejected so editors see the block.
        // Message-ID retries stay silent (SendGrid noise).
        if (claim.reason === "duplicate_content") {
          try {
            await storage.createEmailWebhookLog({
              fromEmail: senderEmailEarly,
              subject: redactEmailTokens(subject) || "(بدون موضوع)",
              bodyText: typeof text === "string" ? redactEmailTokens(text.substring(0, 2000)) : "",
              bodyHtml: typeof html === "string" ? redactEmailTokens(html.substring(0, 2000)) : "",
              status: "rejected",
              rejectionReason: "duplicate_content",
              senderVerified: false,
              tokenVerified: false,
              processingError: `حُظر كتكرار لنفس المرسل والموضوع خلال نافذة منع التكرار (${claim.contentKey})`,
            });
            await storage.updateEmailAgentStats(new Date(), {
              emailsReceived: 1,
              emailsRejected: 1,
            });
          } catch (logError) {
            console.error("[Email Agent] Failed to log content-duplicate rejection:", logError);
          }
        }

        return res.status(200).json({
          success: true,
          message:
            claim.reason === "duplicate_content"
              ? "Duplicate content ignored - same sender/subject recently processed"
              : "Duplicate webhook ignored - already processed this email",
          reason: claim.reason,
          dedupKey: claim.messageKey.substring(0, 50),
        });
      }

      console.log(
        `[Email Agent] 🔒 Dedup claimed message=${claim.messageKey.substring(0, 60)} content=${claim.contentKey}`,
      );

      // ACK SendGrid immediately after a successful claim — BEFORE AI / uploads.
      // Inbound Parse retries on timeout/slow 200s. Processing often takes >30s
      // (GPT + images), so without an early ACK the same MIME is POSTed again
      // while the first run is still publishing. Combined with the post-token
      // flood of previously-401'd mail, that looked like "news keeps repeating".
      // Dedup still blocks true duplicates; this stops the retry storm at the source.
      if (!res.headersSent) {
        res.status(200).json({
          success: true,
          message: "Email accepted for processing",
          accepted: true,
          dedupKey: claim.messageKey.substring(0, 50),
        });
      }
    } catch (dbError) {
      console.error(`[Email Agent] DB dedup check failed, using memory fallback:`, dbError);
      dedupKey = messageId || `${senderEmailEarly}_${subject}_${new Date().toISOString().substring(0, 16)}`;
      if (processedEmails.has(dedupKey)) {
        return res.status(200).json({
          success: true,
          message: "Duplicate webhook ignored - already processing",
          dedupKey: dedupKey.substring(0, 50),
        });
      }
      processedEmails.set(dedupKey, Date.now());
      if (!res.headersSent) {
        res.status(200).json({
          success: true,
          message: "Email accepted for processing",
          accepted: true,
          dedupKey: dedupKey.substring(0, 50),
        });
      }
    }
    
    // 📎 Process attachments from SendGrid (multer files OR parsed attachments from raw MIME)
    // Extended interface to preserve contentId for inline image deduplication
    interface ExtendedMulterFile extends Express.Multer.File {
      contentId?: string; // Preserve CID for inline attachment tracking
    }
    
    let attachments: ExtendedMulterFile[] = (req.files as ExtendedMulterFile[]) || [];
    
    // 🔧 Convert parsed attachments (from raw MIME) to Multer format
    // In "Post raw MIME" mode, req.files is always empty - we must use parsedAttachments
    if (parsedAttachments.length > 0) {
      console.log("[Email Agent] 📎 Converting parsed attachments to Multer format");
      attachments = parsedAttachments.map((att: any) => ({
        fieldname: 'attachment',
        originalname: att.filename || 'unnamed',
        encoding: '7bit',
        mimetype: att.contentType || 'application/octet-stream',
        buffer: att.content,
        size: att.content ? att.content.length : 0,
        contentId: att.contentId ? att.contentId.replace(/[<>]/g, '') : undefined, // Preserve CID for dedup
      } as ExtendedMulterFile));
      
      console.log(`[Email Agent] ✅ Converted ${attachments.length} attachments from raw MIME`);
    }
    
    // Log SendGrid attachment metadata (if available)
    if (req.body.attachments) {
      console.log("[Email Agent] 📎 SendGrid reported attachments count:", req.body.attachments);
    }
    
    if (req.body['attachment-info']) {
      try {
        const attachmentInfo = JSON.parse(req.body['attachment-info']);
        console.log("[Email Agent] 📎 SendGrid attachment-info:", JSON.stringify(attachmentInfo, null, 2));
      } catch (e) {
        console.log("[Email Agent] ⚠️ Could not parse attachment-info");
      }
    }

    console.log("[Email Agent] Final extracted values:");
    console.log("[Email Agent] - Text length:", text?.length || 0);
    console.log("[Email Agent] - HTML length:", html?.length || 0);
    console.log("[Email Agent] - Multer files received:", attachments.length);
    console.log("[Email Agent] - req.files keys:", req.files ? Object.keys(req.files) : 'none');
    
    // Enhanced attachment logging
    if (attachments.length > 0) {
      console.log("[Email Agent] 📎 ============ ATTACHMENTS DETAILS ============");
      attachments.forEach((att, idx) => {
        console.log(`[Email Agent] 📎 Attachment ${idx + 1}:`, {
          fieldname: att.fieldname,
          originalname: att.originalname,
          filename: att.filename,
          size: `${(att.size / 1024).toFixed(2)} KB`,
          mimetype: att.mimetype,
          buffer: att.buffer ? 'Present' : 'Missing',
        });
      });
      console.log("[Email Agent] 📎 ==========================================");
    } else {
      console.log("[Email Agent] ⚠️ No attachments found in req.files");
      console.log("[Email Agent] ⚠️ This could mean:");
      console.log("[Email Agent]    1. Email has no attachments");
      console.log("[Email Agent]    2. SendGrid Inbound Parse not configured to send attachments");
      console.log("[Email Agent]    3. Multer configuration issue");
    }

    // 📎 Process ALL attachments EARLY (BEFORE ANY VALIDATION)
    // SECURITY: Images are stored in memory (NOT uploaded) until after validation
    // Word docs and other files are uploaded to PRIVATE immediately for processing
    let extractedTextFromDocs = "";
    const allAttachmentsMetadata: Array<{ filename: string; contentType: string; size: number; url: string; type: 'image' | 'document' | 'other' }> = [];
    const cleanAttachmentsForLog = () => allAttachmentsMetadata.map(({ filename, contentType, size, url }) => ({ filename, contentType, size, url }));
    const uploadedImages: string[] = [];
    const pendingImageUploads: Array<{ buffer: Buffer; filename: string; contentType: string; size: number }> = [];
    
    // 🖼️ INLINE IMAGE EXTRACTION: Handle forwarded emails with embedded images
    // Build CID map from parsed attachments (for cid: reference resolution)
    const cidMap = new Map<string, { buffer: Buffer; contentType: string; filename: string }>();
    const inlineAttachmentFilenames = new Set<string>(); // Track inline attachments to avoid duplicates
    
    if (parsedAttachments.length > 0) {
      for (const att of parsedAttachments) {
        // Only treat as inline if contentDisposition is 'inline' (not 'attachment').
        // Gmail assigns Content-IDs to ALL attachments including pure file
        // attachments — without this check, attached images get added to
        // cidMap, skipped in the main loop, and never uploaded.
        const isInlineDisposition = att.contentDisposition === 'inline';
        if (att.contentId && isInlineDisposition) {
          const cid = att.contentId.replace(/[<>]/g, '');
          const filename = att.filename || `cid-image-${nanoid(8)}.jpg`;
          cidMap.set(cid, {
            buffer: att.content,
            contentType: att.contentType || 'image/jpeg',
            filename
          });
          inlineAttachmentFilenames.add(filename);
          if (att.filename) inlineAttachmentFilenames.add(att.filename);
          console.log(`[Email Agent] 🔗 CID map entry: ${cid} -> ${filename} (inline, will skip in main loop)`);
        } else if (att.contentId && !isInlineDisposition) {
          console.log(`[Email Agent] 📎 Attachment has CID but disposition='${att.contentDisposition}' — treating as regular attachment: ${att.filename}`);
        }
      }
    }
    
    // Extract inline images from HTML (base64 data URLs and CID references)
    // في إعادة المعالجة الصور المضمّنة محفوظة مع المرفقات: لا تُستخرج مرة ثانية.
    if (html && html.length > 0 && !reprocess) {
      try {
        const inlineImages = await extractInlineImagesFromHtml(html, cidMap);
        if (inlineImages.length > 0) {
          console.log(`[Email Agent] 🖼️ Found ${inlineImages.length} inline images in HTML - adding to pending uploads`);
          pendingImageUploads.push(...inlineImages);
        }
      } catch (inlineError) {
        console.error("[Email Agent] ⚠️ Error extracting inline images:", inlineError);
      }
    }
    
    // OCR واستخراج PDF مدفوعان (GPT-4o Vision): لا يُشغَّلان إلا لمرسل موثوق
    // نشط برمز صحيح. البريد غير الموثوق يُرفض لاحقًا وتُحفظ مرفقاته خاصةً كما كانت.
    const earlySender = attachments.length > 0 ? await storage.getTrustedSenderByEmail(senderEmailEarly) : null;
    const earlyTokenVerdict = earlySender
      ? evaluateSenderToken(extractTokenFromText(subject) || extractTokenFromText(text) || extractTokenFromText(html), earlySender)
      : "invalid";
    const allowPaidExtraction = !!earlySender && earlySender.status === "active" &&
      (!!reprocess || earlyTokenVerdict === "valid" || earlyTokenVerdict === "valid_previous");
    // الخبر المكتوب كاملًا صوره صور صحفية: لا تُقرأ. تُقرأ الصورة حين يكون النص قصيرًا فقط.
    const ocrAttachedImages = allowPaidExtraction &&
      shouldOcrAttachedImages(text || (html ? html.replace(/<[^>]*>/g, " ") : ""));

    if (attachments.length > 0) {
      console.log("[Email Agent] 📎 ============ PROCESSING ALL ATTACHMENTS (EARLY) ============");
      
      for (const attachment of attachments) {
        const isWordDoc = attachment.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                          attachment.originalname?.toLowerCase().endsWith('.docx');
        const isPdf = attachment.mimetype === 'application/pdf' ||
                      attachment.originalname?.toLowerCase().endsWith('.pdf');
        // صور آيفون (HEIC) وAVIF: تُحوَّل إلى WebP/JPEG لتدخل مسار الصور بدل أن تُحفظ ملفًا خاصًا وتضيع
        if (
          needsWebpTranscode(attachment.mimetype || "") ||
          /\.(heic|heif|avif)$/i.test(attachment.originalname || "")
        ) {
          try {
            const normalized = await normalizeImageForUpload(attachment.buffer);
            const baseName = (attachment.originalname || "image").replace(/\.[^.]+$/, "");
            const ext = normalized.mimeType === "image/jpeg" ? "jpg" : "webp";
            attachment.buffer = normalized.buffer;
            attachment.mimetype = normalized.mimeType;
            attachment.originalname = `${baseName}.${ext}`;
            attachment.size = normalized.buffer.length;
            console.log(`[Email Agent] 🔄 Converted ${baseName} to ${normalized.mimeType}`);
          } catch (convertError: any) {
            console.warn(`[Email Agent] ⚠️ Could not convert ${attachment.originalname}:`, convertError?.message);
          }
        }

        const isImage = /^image\/(jpeg|jpg|png|gif|webp)$/i.test(attachment.mimetype);
        
        try {
          if (isWordDoc) {
            // 📄 Process Word Document
            console.log(`[Email Agent] 📄 Found Word document: ${attachment.originalname}`);
            
            // Extract text for AI analysis
            try {
              const extractedText = await extractTextFromDocx(attachment.buffer);
              
              if (extractedText && extractedText.length > 0) {
                console.log(`[Email Agent] ✅ Extracted text from Word: ${extractedText.length} characters`);
                extractedTextFromDocs += extractedText + "\n\n";
              } else {
                console.log(`[Email Agent] ⚠️ No text extracted from Word document`);
              }
            } catch (extractError) {
              console.error(`[Email Agent] ⚠️ Failed to extract text from Word:`, extractError);
            }
            
            // Upload original Word file to PRIVATE immediately (needed for text extraction)
            const gcsPath = await uploadAttachmentToGCS(
              attachment.buffer,
              attachment.originalname,
              attachment.mimetype,
              false  // isPublic: false - Word docs go to PRIVATE
            );
            
            // Save complete metadata
            allAttachmentsMetadata.push({
              filename: attachment.originalname,
              contentType: attachment.mimetype,
              size: attachment.size,
              url: gcsPath,
              type: 'document'
            });
            
            console.log(`[Email Agent] ✅ Word document uploaded to PRIVATE: ${gcsPath}`);
            
          } else if (isPdf) {
            // 📄 Process PDF Document
            console.log(`[Email Agent] 📄 Found PDF document: ${attachment.originalname}, size: ${attachment.size} bytes`);
            
            // Extract text for AI analysis
            try {
              console.log(`[Email Agent] 📄 Starting PDF text extraction...`);
              const extractedText = allowPaidExtraction ? await extractTextFromPdf(attachment.buffer) : "";
              console.log(`[Email Agent] 📄 PDF extraction result: ${extractedText ? extractedText.length : 0} chars`);
              
              if (extractedText && extractedText.length > 0) {
                console.log(`[Email Agent] ✅ Extracted text from PDF: ${extractedText.length} characters`);
                extractedTextFromDocs += extractedText + "\n\n";
              } else {
                console.log(`[Email Agent] ⚠️ No text extracted from PDF document - might be scanned/image-based`);
                // For scanned PDFs, try OCR on each page (future enhancement)
              }
            } catch (extractError) {
              console.error(`[Email Agent] ⚠️ Failed to extract text from PDF:`, extractError);
            }
            
            // Upload original PDF file to PRIVATE
            const pdfGcsPath = await uploadAttachmentToGCS(
              attachment.buffer,
              attachment.originalname,
              attachment.mimetype,
              false  // isPublic: false - PDFs go to PRIVATE
            );
            
            // Save complete metadata
            allAttachmentsMetadata.push({
              filename: attachment.originalname,
              contentType: attachment.mimetype,
              size: attachment.size,
              url: pdfGcsPath,
              type: 'document'
            });
            
            console.log(`[Email Agent] ✅ PDF document uploaded to PRIVATE: ${pdfGcsPath}`);
            
          } else if (isImage) {
            // 📸 Process Image - STORE IN MEMORY (DO NOT UPLOAD YET)
            console.log(`[Email Agent] 📸 DETECTED IMAGE: ${attachment.originalname}, mimetype: ${attachment.mimetype}, size: ${attachment.size} bytes`);
            
            // 🔄 DEDUPLICATION: Skip inline attachments that were already extracted via CID/data URL
            // Check by contentId first (most reliable), then by filename as fallback
            if (attachment.contentId && cidMap.has(attachment.contentId)) {
              console.log(`[Email Agent] ⏭️ Skipping inline attachment (already extracted via CID: ${attachment.contentId})`);
              continue;
            }
            if (inlineAttachmentFilenames.has(attachment.originalname)) {
              console.log(`[Email Agent] ⏭️ Skipping inline attachment (matched by filename: ${attachment.originalname})`);
              continue;
            }
            
            // Validate image size (max 10MB)
            const maxSize = 10 * 1024 * 1024; // 10MB
            if (attachment.size > maxSize) {
              console.log(`[Email Agent] ⚠️ Image ${attachment.originalname} too large (${(attachment.size / 1024 / 1024).toFixed(2)}MB), skipping`);
              continue;
            }
            
            // 🔍 Run OCR on image to extract text (if any)
            try {
              console.log(`[Email Agent] 🔍 Starting OCR for image: ${attachment.originalname}`);
              const ocrText = ocrAttachedImages ? await extractTextFromImage(attachment.buffer, attachment.mimetype) : "";
              console.log(`[Email Agent] 🔍 OCR result: ${ocrText ? ocrText.length : 0} chars`);
              if (ocrText && ocrText.length > 20) {
                console.log(`[Email Agent] 🔍 OCR extracted text from image: ${ocrText.length} characters`);
                extractedTextFromDocs += `[نص مستخرج من صورة: ${attachment.originalname}]\n${ocrText}\n\n`;
              } else if (ocrText && ocrText.length > 0) {
                console.log(`[Email Agent] ⚠️ OCR text too short (${ocrText.length} chars): "${ocrText}"`);
              } else {
                console.log(`[Email Agent] ⚠️ OCR returned empty text`);
              }
            } catch (ocrError) {
              console.error(`[Email Agent] ⚠️ OCR failed for image:`, ocrError);
            }
            
            console.log(`[Email Agent] 📸 Storing image in memory (deferred upload): ${attachment.originalname} (${(attachment.size / 1024).toFixed(2)} KB)`);
            console.log(`[Email Agent] 📸 Buffer exists: ${!!attachment.buffer}, Buffer length: ${attachment.buffer?.length || 0}`);
            
            // SECURITY FIX: Store image in memory instead of uploading to PUBLIC
            pendingImageUploads.push({
              buffer: attachment.buffer,
              filename: attachment.originalname,
              contentType: attachment.mimetype,
              size: attachment.size
            });
            
            console.log(`[Email Agent] ✅ Image stored in memory (will upload after validation)`);
            console.log(`[Email Agent] 📸 pendingImageUploads count is now: ${pendingImageUploads.length}`);
            
          } else {
            // 📎 Process Other File Types - Upload to PRIVATE immediately
            console.log(`[Email Agent] 📎 Uploading other file to PRIVATE: ${attachment.originalname}`);
            
            const gcsPath = await uploadAttachmentToGCS(
              attachment.buffer,
              attachment.originalname,
              attachment.mimetype,
              false  // isPublic: false - Other files go to PRIVATE
            );
            
            // Save metadata
            allAttachmentsMetadata.push({
              filename: attachment.originalname,
              contentType: attachment.mimetype,
              size: attachment.size,
              url: gcsPath,
              type: 'other'
            });
            
            console.log(`[Email Agent] ✅ Other file uploaded to PRIVATE: ${gcsPath}`);
          }
        } catch (error) {
          console.error(`[Email Agent] ❌ Failed to process ${attachment.originalname}:`, error);
        }
      }
      
      console.log("[Email Agent] 📎 Early processing summary:");
      console.log("[Email Agent]    - Total attachments:", attachments.length);
      console.log("[Email Agent]    - Word documents (uploaded to PRIVATE):", allAttachmentsMetadata.filter(a => a.type === 'document').length);
      console.log("[Email Agent]    - Images (pending upload):", pendingImageUploads.length);
      console.log("[Email Agent]    - Other files (uploaded to PRIVATE):", allAttachmentsMetadata.filter(a => a.type === 'other').length);
      console.log("[Email Agent] 📎 ==========================================");
    }

    // Helper function to upload pending images to PUBLIC or PRIVATE
    const uploadPendingImages = async (isPublic: boolean): Promise<void> => {
      console.log(`[Email Agent] 📸 ========== uploadPendingImages called ==========`);
      console.log(`[Email Agent] 📸 isPublic: ${isPublic}`);
      console.log(`[Email Agent] 📸 pendingImageUploads.length: ${pendingImageUploads.length}`);
      
      if (pendingImageUploads.length === 0) {
        console.log(`[Email Agent] 📸 No pending images to upload - RETURNING EARLY`);
        return;
      }

      console.log(`[Email Agent] 📸 Uploading ${pendingImageUploads.length} pending images to ${isPublic ? 'PUBLIC' : 'PRIVATE'}...`);
      console.log(`[Email Agent] 📸 Images to upload:`, pendingImageUploads.map(img => ({
        filename: img.filename,
        contentType: img.contentType,
        size: img.size,
        hasBuffer: !!img.buffer
      })));
      
      for (let i = 0; i < pendingImageUploads.length; i++) {
        const image = pendingImageUploads[i];
        console.log(`[Email Agent] 📸 Processing image ${i + 1}/${pendingImageUploads.length}: ${image.filename}`);
        
        try {
          console.log(`[Email Agent] 📸 Calling uploadAttachmentToGCS for ${image.filename}...`);
          const gcsPath = await uploadAttachmentToGCS(
            image.buffer,
            image.filename,
            image.contentType,
            isPublic
          );
          console.log(`[Email Agent] 📸 uploadAttachmentToGCS returned: ${gcsPath}`);
          
          if (isPublic) {
            uploadedImages.push(gcsPath);
            console.log(`[Email Agent] 📸 Added to uploadedImages array. Total now: ${uploadedImages.length}`);
          }
          
          // Update or add metadata
          const existingMetadata = allAttachmentsMetadata.find(m => m.filename === image.filename);
          if (existingMetadata) {
            existingMetadata.url = gcsPath;
            console.log(`[Email Agent] 📸 Updated existing metadata for ${image.filename}`);
          } else {
            allAttachmentsMetadata.push({
              filename: image.filename,
              contentType: image.contentType,
              size: image.size,
              url: gcsPath,
              type: 'image'
            });
            console.log(`[Email Agent] 📸 Added new metadata for ${image.filename}`);
          }
          
          console.log(`[Email Agent] ✅ Image uploaded to ${isPublic ? 'PUBLIC' : 'PRIVATE'}: ${gcsPath}`);
        } catch (error) {
          console.error(`[Email Agent] ❌ Failed to upload image ${image.filename}:`, error);
          console.error(`[Email Agent] ❌ Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
        }
      }
      
      console.log(`[Email Agent] 📸 Finished uploading ${pendingImageUploads.length} images`);
      console.log(`[Email Agent] 📸 uploadedImages count: ${uploadedImages.length}`);
      console.log(`[Email Agent] 📸 uploadedImages:`, uploadedImages);
      console.log(`[Email Agent] 📸 ========== uploadPendingImages completed ==========`);
    };

    const senderEmail = extractEmailAddress(from);
    
    const logId = nanoid();
    // الرمز لا يُخزَّن في السجل: يقرؤه كل من يفتح صفحة قنوات الاتصال.
    webhookLog = reprocess ? reprocess.log : await storage.createEmailWebhookLog({
      fromEmail: senderEmail,
      subject: redactEmailTokens(subject),
      bodyText: redactEmailTokens(text),
      bodyHtml: redactEmailTokens(html),
      status: "received",
    });

    const trustedSender = await storage.getTrustedSenderByEmail(senderEmail);

    // SPF/DKIM من SendGrid: هل الرسالة صادرة فعلًا من نطاق المرسل؟
    const senderAuth = reprocess ? reprocess.senderAuth : evaluateSenderAuth({
      fromEmail: senderEmail,
      spf: req.body.SPF,
      dkim: req.body.dkim,
      envelope: req.body.envelope,
    });
    senderAuthVerdict = senderAuth;
    const senderAuthFailed = senderAuth === "fail" && senderAuthEnforced();
    console.log(`[Email Agent] Sender auth verdict: ${senderAuth}${senderAuthFailed ? " (auto-publish held for this message)" : ""}`);

    // الرفض والفشل يفكان بصمة التكرار ليُعاد الإرسال فورًا، والمرسل الموثوق يصله رد.
    // لا رد على عنوان لم يثبت أنه المرسل (فشل SPF/DKIM) حتى لا نراسل ضحية انتحال.
    replyToSender = (outcome: SenderReplyOutcome) => {
      if (!trustedSender || senderAuth === "fail" || !emailAgentRepliesEnabled()) return;
      const reply = buildSenderReply(subject, outcome);
      void sendEmailNotification({ to: senderEmail, ...reply }).catch(() => undefined);
    };
    dedupFrom = from;
    dedupSubject = subject;
    
    if (!trustedSender) {
      console.log("[Email Agent] Sender not trusted:", senderEmail);
      
      // SECURITY: Upload pending images to PRIVATE for editorial review
      await uploadPendingImages(false);
      
      await storage.updateEmailWebhookLog(webhookLog.id, {
        status: "rejected",
        rejectionReason: "sender_not_trusted",
        senderVerified: false,
        tokenVerified: false,
        // Save all attachments even if rejected early (for editorial review)
        attachmentsCount: allAttachmentsMetadata.length,
        attachmentsData: cleanAttachmentsForLog()
      });

      const today = new Date();
      await storage.updateEmailAgentStats(today, {
        emailsReceived: 1,
        emailsRejected: 1,
      });

      await releaseEmailContentDedup(from, subject);
      respondWebhook(res, {
        success: false,
        message: "Sender not authorized",
      });
      return;
    }

    if (trustedSender.status !== "active") {
      console.log("[Email Agent] Sender is inactive:", senderEmail);
      
      // SECURITY: Upload pending images to PRIVATE for editorial review
      await uploadPendingImages(false);
      
      await storage.updateEmailWebhookLog(webhookLog.id, {
        status: "rejected",
        rejectionReason: "sender_inactive",
        senderVerified: true,
        tokenVerified: false,
        trustedSenderId: trustedSender.id,
        // Save all attachments even if rejected early (for editorial review)
        attachmentsCount: allAttachmentsMetadata.length,
        attachmentsData: cleanAttachmentsForLog()
      });

      const today = new Date();
      await storage.updateEmailAgentStats(today, {
        emailsReceived: 1,
        emailsRejected: 1,
      });

      await releaseEmailContentDedup(from, subject);
      replyToSender({ kind: "rejected", reason: "sender_inactive" });
      respondWebhook(res, {
        success: false,
        message: "Sender account is inactive",
      });
      return;
    }

    const tokenInSubject = extractTokenFromText(subject);
    const tokenInBody = extractTokenFromText(text);
    const tokenInHtml = extractTokenFromText(html);
    const providedToken = tokenInSubject || tokenInBody || tokenInHtml;

    // لا تُسجَّل قيمة الرمز ولا جزء منها: الرمز سر نشر.
    console.log("[Email Agent] Token search results:", {
      subject: !!tokenInSubject,
      text: !!tokenInBody,
      html: !!tokenInHtml,
    });

    // إعادة المعالجة لرسالة سبق التحقق من رمزها (الرمز حُذف من السجل المحفوظ).
    const tokenVerdict = reprocess ? "valid" : evaluateSenderToken(providedToken, trustedSender);
    const isTokenValid = tokenVerdict === "valid" || tokenVerdict === "valid_previous";
    const tokenRejection = tokenVerdict === "expired" ? "token_expired" : "invalid_token";

    if (!isTokenValid) {
      console.log("[Email Agent] Token validation failed:", {
        trustedSenderId: trustedSender.id,
        tokenPresent: !!providedToken,
        providedLength: providedToken?.length || 0,
      });
      
      // SECURITY: Upload pending images to PRIVATE for editorial review
      await uploadPendingImages(false);
      
      await storage.updateEmailWebhookLog(webhookLog.id, {
        status: "rejected",
        rejectionReason: tokenRejection,
        senderVerified: true,
        tokenVerified: false,
        trustedSenderId: trustedSender.id,
        // Save all attachments even if rejected early (for editorial review)
        attachmentsCount: allAttachmentsMetadata.length,
        attachmentsData: cleanAttachmentsForLog()
      });

      const today = new Date();
      await storage.updateEmailAgentStats(today, {
        emailsReceived: 1,
        emailsRejected: 1,
      });

      await releaseEmailContentDedup(from, subject);
      replyToSender({ kind: "rejected", reason: tokenRejection });
      respondWebhook(res, {
        success: false,
        message: "Invalid token",
      });
      return;
    }

    console.log("[Email Agent] Sender verified successfully");
    tokenWasVerified = true;
    
    await storage.updateEmailWebhookLog(webhookLog.id, {
      senderVerified: true,
      tokenVerified: true,
      trustedSenderId: trustedSender.id,
    });

    // نقطة حفظ لـ«أعد المعالجة»: المرفقات تُحفظ خاصةً مع السجل قبل التحرير بالذكاء،
    // فانقطاع المعالجة (إعادة تشغيل الخادم) لا يضيّع الصور. فشلها لا يوقف النشر.
    if (!reprocess) {
      try {
        const saved = cleanAttachmentsForLog();
        for (const image of pendingImageUploads) {
          const url = await uploadAttachmentToGCS(image.buffer, image.filename, image.contentType, false);
          saved.push({ filename: image.filename, contentType: image.contentType, size: image.size, url });
        }
        await storage.updateEmailWebhookLog(webhookLog.id, {
          attachmentsCount: saved.length,
          attachmentsData: saved,
          aiAnalysis: { warnings: [`sender_auth:${senderAuth}`] },
        });
      } catch (checkpointError: any) {
        console.error("[Email Agent] تعذر حفظ مرفقات الرسالة قبل المعالجة:", checkpointError?.message);
      }
    }

    const systemUser = await storage.getOrCreateSystemUser();
    console.log("[Email Agent] Using system user ID:", systemUser.id);
    
    // 👤 Get assigned reporter user from trusted sender
    let reporterUser;
    if (trustedSender.reporterUserId) {
      console.log("[Email Agent] 👤 Fetching assigned reporter user:", trustedSender.reporterUserId);
      reporterUser = await storage.getUser(trustedSender.reporterUserId);
      if (!reporterUser) {
        console.log("[Email Agent] ⚠️ Assigned reporter not found, falling back to system user");
        reporterUser = systemUser;
      } else {
        console.log("[Email Agent] ✅ Reporter user found:", reporterUser.id, `-`, reporterUser.firstName, reporterUser.lastName);
      }
    } else {
      console.log("[Email Agent] ℹ️ No reporter assigned to this sender, using system user");
      reporterUser = systemUser;
    }

    // Extract content from text or HTML
    let emailContent = text || (html ? html.replace(/<[^>]*>/g, '') : '');
    
    console.log("[Email Agent] 📝 Initial emailContent length:", emailContent.length, "chars");
    console.log("[Email Agent] 📝 extractedTextFromDocs length:", extractedTextFromDocs.length, "chars");
    
    // Add extracted text from Word documents, PDFs, and OCR images
    if (extractedTextFromDocs) {
      console.log("[Email Agent] 📄 Adding extracted text from docs/images:", extractedTextFromDocs.length, "chars");
      emailContent = extractedTextFromDocs + "\n\n" + emailContent;
      console.log("[Email Agent] 📝 emailContent length after adding extracted text:", emailContent.length, "chars");
    }
    
    // Remove token from content (support all formats)
    emailContent = emailContent
      .replace(/\[TOKEN:\s*[A-F0-9]{64}\s*\]/gi, '')  // [TOKEN:xxx]
      .replace(/TOKEN:\s*[A-F0-9]{64}/gi, '')          // TOKEN:xxx or TOKEN: xxx
      .replace(/\b[A-Fa-f0-9]{64}\b/g, '')              // bare 64-hex (case-insensitive)
      .trim();
    
    console.log("[Email Agent] Content length after token removal:", emailContent.length);
    
    // 🔗 URL CONTENT EXTRACTION: Check if email contains a news URL to extract
    let urlExtractionResult: any = null;
    let extractedFromUrl = false;
    
    // 🔗 CRITICAL FIX: Extract URLs from HTML BEFORE stripping HTML
    // This ensures we don't lose URLs that are only in anchor tags or Apple Mail link previews
    let htmlUrls: string[] = [];
    if (html) {
      // 1. Standard href attributes
      const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
      let match;
      while ((match = hrefRegex.exec(html)) !== null) {
        const url = match[1];
        if (url && url.startsWith('http')) {
          htmlUrls.push(url);
        }
      }
      
      // 2. Apple Mail link preview: data-x-apple-url and similar data-* attributes containing URLs
      const dataUrlRegex = /data-[^=]*url[^=]*\s*=\s*["']([^"']+)["']/gi;
      while ((match = dataUrlRegex.exec(html)) !== null) {
        const url = match[1];
        if (url && url.startsWith('http')) {
          htmlUrls.push(url);
        }
      }
      
      // 3. og:url meta tags (sometimes present in forwarded emails)
      const ogUrlRegex = /property\s*=\s*["']og:url["'][^>]*content\s*=\s*["']([^"']+)["']/gi;
      while ((match = ogUrlRegex.exec(html)) !== null) {
        const url = match[1];
        if (url && url.startsWith('http')) {
          htmlUrls.push(url);
        }
      }
      
      // 4. Look for TRUSTED domain patterns without protocol (spa.gov.sa/..., reuters.com/..., etc.)
      // This handles Apple Mail link previews that show domain without protocol
      const trustedDomains = [
        'spa.gov.sa', 'reuters.com', 'aljazeera.net', 'alarabiya.net',
        'cnn.com', 'bbc.com', 'skynewsarabia.com', 'aawsat.com',
        'aleqt.com', 'okaz.com.sa', 'alriyadh.com', 'alwatan.com.sa',
        'ajel.sa', 'moi.gov.sa', 'moe.gov.sa', 'moh.gov.sa',
        'vision2030.gov.sa', 'argaam.com', 'tadawul.com.sa'
      ];
      
      for (const domain of trustedDomains) {
        // Match domain followed by path (e.g., spa.gov.sa/w/1234567)
        const domainPattern = new RegExp(`\\b(${domain.replace(/\./g, '\\.')})/([^\\s"'<>]+)`, 'gi');
        while ((match = domainPattern.exec(html)) !== null) {
          const fullMatch = match[0];
          // Construct full URL with https
          const fullUrl = `https://${fullMatch}`;
          console.log("[Email Agent] 🔗 Found trusted domain URL pattern:", fullUrl);
          htmlUrls.push(fullUrl);
        }
      }
      
      // 5. Also check plain text content for trusted domains without protocol
      for (const domain of trustedDomains) {
        const domainPattern = new RegExp(`\\b(${domain.replace(/\./g, '\\.')})/([^\\s"'<>]+)`, 'gi');
        while ((match = domainPattern.exec(emailContent)) !== null) {
          const fullMatch = match[0];
          const fullUrl = `https://${fullMatch}`;
          console.log("[Email Agent] 🔗 Found trusted domain in text:", fullUrl);
          htmlUrls.push(fullUrl);
        }
      }
      
      console.log("[Email Agent] 🔗 URLs extracted from HTML (all methods):", htmlUrls.length, htmlUrls);
      
    }
    
    // Combine URLs from both plain text content AND HTML hrefs
    const textUrls = detectUrls(emailContent);
    const combinedUrls = [...htmlUrls, ...textUrls];
    const detectedUrls = combinedUrls.filter((url, index) => combinedUrls.indexOf(url) === index); // Remove duplicates
    console.log("[Email Agent] 🔗 All detected URLs (HTML + text):", detectedUrls.length, detectedUrls);
    
    if (detectedUrls.length > 0) {
      console.log("[Email Agent] 🔗 Detected URLs in email:", detectedUrls);
      
      // Find the first news URL
      const newsUrl = detectedUrls.find(url => isNewsUrl(url));
      
      if (newsUrl) {
        console.log("[Email Agent] 🔗 Found news URL:", newsUrl);
        
        // Check if this is primarily a URL-only message
        // Cases to consider:
        // 1. Plain text content has URL only (less than 20 chars after removing URL)
        // 2. HTML has URL in href AND content is minimal (< 400 chars - e.g., headline + brief description)
        // 3. Plain text with URL AND minimal additional content (< 400 chars total) - e.g., headline + URL + source
        // 4. Any detected URL with short content (< 400 chars) - always try to extract
        const textIsUrlOnly = containsOnlyUrl(emailContent);
        const htmlHasUrlAndMinimalContent = htmlUrls.length > 0 && emailContent.length < 400;
        const hasUrlWithMinimalText = textUrls.length > 0 && emailContent.length < 400;
        const anyUrlWithShortContent = detectedUrls.length > 0 && emailContent.length < 400;
        const isUrlOnly = textIsUrlOnly || htmlHasUrlAndMinimalContent || hasUrlWithMinimalText || anyUrlWithShortContent;
        console.log("[Email Agent] 🔗 Is URL-only message:", isUrlOnly, 
          `(textUrlOnly: ${textIsUrlOnly}, htmlUrl+minimal: ${htmlHasUrlAndMinimalContent}, textUrl+minimal: ${hasUrlWithMinimalText}, anyUrl+short: ${anyUrlWithShortContent})`);
        
        if (isUrlOnly) {
          console.log("[Email Agent] 🌐 Extracting article content from URL...");
          
          try {
            urlExtractionResult = await extractArticleContent(newsUrl);
            
            if (urlExtractionResult.success && urlExtractionResult.article) {
              console.log("[Email Agent] ✅ URL extraction successful!");
              console.log("[Email Agent]    - Title:", urlExtractionResult.article.title);
              console.log("[Email Agent]    - Source:", urlExtractionResult.article.sourceNameAr);
              console.log("[Email Agent]    - Attribution:", urlExtractionResult.article.attribution);
              
              // Replace email content with extracted article
              emailContent = `${urlExtractionResult.article.title}\n\n${urlExtractionResult.article.content}`;
              extractedFromUrl = true;
              
              // If extracted article has an image and we don't have any uploaded images
              if (urlExtractionResult.article.imageUrl && uploadedImages.length === 0) {
                console.log("[Email Agent] 🖼️ Using image from source article:", urlExtractionResult.article.imageUrl);
                uploadedImages.push(urlExtractionResult.article.imageUrl);
              }
            } else {
              console.log("[Email Agent] ⚠️ URL extraction failed:", urlExtractionResult.error);
              // Continue with original content if extraction fails
            }
          } catch (extractError: any) {
            console.error("[Email Agent] ❌ URL extraction error:", extractError.message);
            // Continue with original content if extraction fails
          }
        } else {
          console.log("[Email Agent] 📝 Email has additional content besides URL, processing as normal");
        }
      }
    }
    
    // 🔗 SECOND PASS: Also check OCR text and extractedTextFromDocs for URLs (might contain URL from image/PDF)
    if (!extractedFromUrl && extractedTextFromDocs) {
      const ocrUrls = detectUrls(extractedTextFromDocs);
      if (ocrUrls.length > 0) {
        console.log("[Email Agent] 🔗 Found URLs in OCR/extracted text:", ocrUrls);
        const ocrNewsUrl = ocrUrls.find(url => isNewsUrl(url));
        if (ocrNewsUrl && emailContent.length < 400) {
          console.log("[Email Agent] 🔗 Extracting article from OCR-detected URL:", ocrNewsUrl);
          try {
            urlExtractionResult = await extractArticleContent(ocrNewsUrl);
            if (urlExtractionResult.success && urlExtractionResult.article) {
              console.log("[Email Agent] ✅ OCR URL extraction successful!");
              emailContent = `${urlExtractionResult.article.title}\n\n${urlExtractionResult.article.content}`;
              extractedFromUrl = true;
              if (urlExtractionResult.article.imageUrl && uploadedImages.length === 0) {
                uploadedImages.push(urlExtractionResult.article.imageUrl);
              }
            }
          } catch (e) {
            console.warn("[Email Agent] OCR URL extraction failed:", e);
          }
        }
      }
    }
    
    // 🎨 INFOGRAPHIC DETECTION: Check if email is an infographic (large image with minimal text)
    // Infographics typically have: large image attachment + minimal text (title only)
    const imageAttachmentMeta = allAttachmentsMetadata.filter(a => a.type === 'image');
    const hasLargeImage = pendingImageUploads.some(img => img.size > 100 * 1024); // > 100KB
    const hasMinimalText = (!emailContent || emailContent.length < 300) && (subject?.length > 5);
    let isInfographic = hasLargeImage && hasMinimalText && imageAttachmentMeta.length > 0;
    
    console.log("[Email Agent] 🎨 Infographic detection:", {
      hasLargeImage,
      hasMinimalText,
      imageCount: imageAttachmentMeta.length,
      textLength: emailContent?.length || 0,
      subjectLength: subject?.length || 0,
      isInfographic
    });
    
    // If detected as infographic with minimal text, use OCR to extract text from the image
    if (isInfographic && (!emailContent || emailContent.length < 50)) {
      console.log("[Email Agent] 🎨 Infographic detected with minimal text, running OCR on image...");
      
      const firstImage = pendingImageUploads[0];
      if (firstImage && firstImage.buffer) {
        try {
          const ocrText = await extractTextFromImage(firstImage.buffer, firstImage.contentType);
          if (ocrText && ocrText.length > 20) {
            console.log("[Email Agent] 🎨 OCR extracted text from infographic:", ocrText.length, "chars");
            console.log("[Email Agent] 🎨 OCR preview:", ocrText.substring(0, 200));
            // Use OCR text as content, with subject as title
            emailContent = `${subject}\n\n${ocrText}`;
          } else {
            console.log("[Email Agent] 🎨 OCR found minimal text, using subject as content");
            // For pure visual infographics, use subject as title and a placeholder content
            emailContent = `${subject}\n\nإنفوجرافيك توضيحي`;
          }
        } catch (ocrError) {
          console.warn("[Email Agent] 🎨 OCR failed, using subject as content:", ocrError);
          emailContent = `${subject}\n\nإنفوجرافيك توضيحي`;
        }
      } else {
        // Buffer not available (streamed storage), use subject-based content
        console.log("[Email Agent] 🎨 No buffer available for OCR, using subject as content");
        emailContent = `${subject}\n\nإنفوجرافيك توضيحي`;
      }
    }
    
    // Check if content is empty (after infographic processing)
    if (!emailContent || emailContent.length < 10) {
      console.log("[Email Agent] No content found after token removal");
      
      // SECURITY: Upload pending images to PRIVATE for editorial review
      await uploadPendingImages(false);
      
      await storage.updateEmailWebhookLog(webhookLog.id, {
        status: "rejected",
        rejectionReason: "no_content",
        trustedSenderId: trustedSender.id,
        // Save all attachments even if rejected (for editorial review)
        attachmentsCount: allAttachmentsMetadata.length,
        attachmentsData: cleanAttachmentsForLog()
      });

      const today = new Date();
      await storage.updateEmailAgentStats(today, {
        emailsReceived: 1,
        emailsRejected: 1,
      });

      await releaseEmailContentDedup(from, subject);
      replyToSender({ kind: "rejected", reason: "no_content" });
      respondWebhook(res, {
        success: false,
        message: "No content found in email",
      });
      return;
    }

    // 🌐 USE TRUSTED SENDER LANGUAGE PREFERENCE
    // Respect the language setting configured for this trusted sender (ar, en, ur)
    const language = (trustedSender.language || "ar") as "ar" | "en" | "ur";
    console.log("[Email Agent] 📝 Target language from sender settings:", language);
    // Detect language for logging only (with fallback to avoid blocking)
    let detectedLang = "ar";
    try {
      detectedLang = await detectLanguage(emailContent);
      console.log("[Email Agent] Detected language:", detectedLang);
    } catch (error) {
      console.warn("[Email Agent] Language detection failed, using fallback:", error);
    }
    
    console.log("[Email Agent] Target language (from sender):", language);
    
    // 🎯 Fetch available categories for AI to choose from
    const allCategories = await storage.getAllCategories();
    const activeCategories = selectEditorialCategories(allCategories);
    const categoriesForAI = activeCategories.map(c => ({ nameAr: c.nameAr, nameEn: c.nameEn }));
    
    console.log("[Email Agent] Fetched", categoriesForAI.length, "publishable categories for AI");
    console.log("[Email Agent] Analyzing and editing with Sabq editorial style...");
    const editorialResult = await analyzeAndEditWithSabqStyle(emailContent, language, categoriesForAI);
    
    console.log("[Email Agent] Quality score:", editorialResult.qualityScore);
    console.log("[Email Agent] Language:", editorialResult.language);
    console.log("[Email Agent] Category:", editorialResult.detectedCategory);
    console.log("[Email Agent] Has news value:", editorialResult.hasNewsValue);
    console.log("[Email Agent] Issues found:", editorialResult.issues.length);
    console.log("[Email Agent] Extracted from URL:", extractedFromUrl);

    // 🔗 Lower threshold for URL-extracted content from trusted sources (already vetted)
    // 🎨 Also lower threshold for infographic content (visual content with OCR text)
    let qualityThreshold = 30;
    if (extractedFromUrl) {
      qualityThreshold = 10;
      console.log("[Email Agent] Quality threshold: 10 (lower for trusted URL source)");
    } else if (isInfographic) {
      qualityThreshold = 5;
      console.log("[Email Agent] Quality threshold: 5 (lower for infographic content)");
    } else {
      console.log("[Email Agent] Quality threshold: 30 (standard)");
    }

    if (editorialResult.qualityScore < qualityThreshold) {
      console.log("[Email Agent] Content quality too low - rejected");
      console.log("[Email Agent] Rejection reasons:", editorialResult.issues);
      
      // SECURITY: Upload pending images to PRIVATE for editorial review
      await uploadPendingImages(false);
      
      await storage.updateEmailWebhookLog(webhookLog.id, {
        status: "rejected",
        rejectionReason: "quality_too_low",
        trustedSenderId: trustedSender.id,
        aiAnalysis: {
          contentQuality: editorialResult.qualityScore,
          languageDetected: editorialResult.language,
          categoryPredicted: editorialResult.detectedCategory,
          isNewsWorthy: editorialResult.hasNewsValue,
          errors: editorialResult.issues,
          warnings: editorialResult.suggestions,
        },
        // Save all attachments even if rejected (for editorial review)
        attachmentsCount: allAttachmentsMetadata.length,
        attachmentsData: cleanAttachmentsForLog()
      });

      const today = new Date();
      await storage.updateEmailAgentStats(today, {
        emailsReceived: 1,
        emailsRejected: 1,
      });

      await releaseEmailContentDedup(from, subject);
      replyToSender({ kind: "rejected", reason: "quality_too_low" });
      respondWebhook(res, {
        success: false,
        message: "Content quality below threshold (Sabq standards)",
        qualityScore: editorialResult.qualityScore,
        issues: editorialResult.issues,
        suggestions: editorialResult.suggestions,
      });
      return;
    }

    // 🎨 Bypass news value check for infographics (visual content is inherently valuable)
    if (!editorialResult.hasNewsValue && isInfographic) {
      console.log("[Email Agent] 🎨 Infographic bypassing news value check (visual content)");
    } else if (!editorialResult.hasNewsValue) {
      console.log("[Email Agent] Content has no news value - rejected");
      
      // SECURITY: Upload pending images to PRIVATE for editorial review
      await uploadPendingImages(false);
      
      await storage.updateEmailWebhookLog(webhookLog.id, {
        status: "rejected",
        rejectionReason: "no_news_value",
        trustedSenderId: trustedSender.id,
        aiAnalysis: {
          contentQuality: editorialResult.qualityScore,
          languageDetected: editorialResult.language,
          categoryPredicted: editorialResult.detectedCategory,
          isNewsWorthy: false,
          errors: editorialResult.issues,
          warnings: editorialResult.suggestions,
        },
        // Save all attachments even if rejected (for editorial review)
        attachmentsCount: allAttachmentsMetadata.length,
        attachmentsData: cleanAttachmentsForLog()
      });

      const today = new Date();
      await storage.updateEmailAgentStats(today, {
        emailsReceived: 1,
        emailsRejected: 1,
      });

      await releaseEmailContentDedup(from, subject);
      replyToSender({ kind: "rejected", reason: "no_news_value" });
      respondWebhook(res, {
        success: false,
        message: "Content has no news value",
        issues: editorialResult.issues,
      });
      return;
    }

    // 🛡️ SAFETY: Reject if AI returned empty content (truncated response, partial JSON, etc.)
    if (!editorialResult.optimized.content || editorialResult.optimized.content.trim().length < 20) {
      console.log("[Email Agent] AI returned empty/insufficient content - rejected (safety guard)");

      await uploadPendingImages(false);

      await storage.updateEmailWebhookLog(webhookLog.id, {
        status: "rejected",
        rejectionReason: "ai_content_empty",
        trustedSenderId: trustedSender.id,
        aiAnalysis: {
          contentQuality: editorialResult.qualityScore,
          languageDetected: editorialResult.language,
          categoryPredicted: editorialResult.detectedCategory,
          isNewsWorthy: editorialResult.hasNewsValue,
          errors: ["AI returned empty or insufficient optimized content"],
          warnings: editorialResult.suggestions,
        },
        attachmentsCount: allAttachmentsMetadata.length,
        attachmentsData: cleanAttachmentsForLog()
      });

      const today = new Date();
      await storage.updateEmailAgentStats(today, {
        emailsReceived: 1,
        emailsRejected: 1,
      });

      await releaseEmailContentDedup(from, subject);
      replyToSender({ kind: "rejected", reason: "ai_content_empty" });
      respondWebhook(res, {
        success: false,
        message: "AI processing returned empty content - article not published for safety",
      });
      return;
    }

    // ✅ SUCCESSFUL VALIDATION - Upload pending images to PUBLIC
    console.log("[Email Agent] ========================================");
    console.log("[Email Agent] ✅ Validation successful - uploading images to PUBLIC");
    console.log("[Email Agent] 📸 Pending images count BEFORE upload:", pendingImageUploads.length);
    console.log("[Email Agent] 📸 Uploaded images count BEFORE upload:", uploadedImages.length);
    console.log("[Email Agent] ========================================");
    
    try {
      await uploadPendingImages(true);
      console.log("[Email Agent] ✅ Images uploaded successfully");
      console.log("[Email Agent] 📸 Uploaded images count AFTER upload:", uploadedImages.length);
      console.log("[Email Agent] 📸 Uploaded images URLs:", uploadedImages);
    } catch (uploadError) {
      console.error("[Email Agent] ❌ Error uploading images:", uploadError);
      throw uploadError; // Re-throw to trigger catch block
    }
    
    // صورة الخبر المسحوب من رابط: تُنسخ إلى تخزين سبق بدل الاعتماد على خادم المصدر.
    if (extractedFromUrl && uploadedImages.length === 1 && urlExtractionResult?.article?.imageUrl === uploadedImages[0]) {
      const rehosted = await rehostSourceImage(uploadedImages[0]);
      if (rehosted) uploadedImages[0] = rehosted;
    }

    // 🎨 Select featured image from newly-uploaded images
    console.log("[Email Agent] 🎨 Selecting featured image from uploadedImages array...");
    console.log("[Email Agent] 🎨 uploadedImages[0]:", uploadedImages[0]);
    const featuredImage = uploadedImages[0] || null;
    
    if (featuredImage) {
      console.log("[Email Agent] 🎨 ✅ Featured image selected:", featuredImage);
    } else {
      console.log("[Email Agent] ℹ️ No featured image (uploadedImages array is empty)");
      console.log("[Email Agent] ℹ️ This could mean:");
      console.log("[Email Agent]    1. Email has no image attachments");
      console.log("[Email Agent]    2. Images failed to upload");
      console.log("[Email Agent]    3. pendingImageUploads was empty");
    }

    const articleTitle = editorialResult.optimized.title || subject.replace(/\[TOKEN:[A-F0-9]{64}\]/gi, '').trim();
    const articleSlug = generateSlug(articleTitle);
    const englishSlug = nanoid(7); // Short URL for social media sharing

    // 🎯 Smart Category Matching System
    console.log("[Email Agent] 🎯 Starting smart category matching...");
    console.log("[Email Agent] AI detected category:", editorialResult.detectedCategory);
    
    // Note: allCategories and activeCategories already fetched above for AI
    console.log("[Email Agent] Available categories:", activeCategories.length);
    
    const aiMatchedCategory = matchDetectedCategory(editorialResult.detectedCategory, activeCategories);
    if (aiMatchedCategory) {
      console.log("[Email Agent] ✅ Category match found:", aiMatchedCategory.nameAr, `(ID: ${aiMatchedCategory.id})`);
    } else {
      console.log("[Email Agent] ⚠️ No category match found for:", editorialResult.detectedCategory);
    }
    
    // Fallback chain: AI match → Trusted sender default → First active → First overall
    let finalCategoryId = aiMatchedCategory?.id;
    
    if (!finalCategoryId && trustedSender.defaultCategory) {
      console.log("[Email Agent] 🔄 Using trusted sender default category:", trustedSender.defaultCategory);
      finalCategoryId = trustedSender.defaultCategory;
    }
    
    if (!finalCategoryId && activeCategories.length > 0) {
      const fallbackCategory = pickFallbackCategory(activeCategories)!;
      console.log("[Email Agent] 🔄 Using fallback category:", fallbackCategory.nameAr);
      finalCategoryId = fallbackCategory.id;
    }
    
    if (!finalCategoryId && allCategories.length > 0) {
      console.log("[Email Agent] ⚠️ Using first available category (inactive):", allCategories[0].nameAr);
      finalCategoryId = allCategories[0].id;
    }
    
    if (!finalCategoryId) {
      console.error("[Email Agent] ❌ CRITICAL: No categories available in database!");
    } else {
      console.log("[Email Agent] ✅ Final category ID selected:", finalCategoryId);
    }

    console.log("[Email Agent] 📝 ========== PREPARING ARTICLE DATA ==========");
    console.log("[Email Agent] 📝 Featured image to be used:", featuredImage || "NULL - NO IMAGE");
    console.log("[Email Agent] 📝 Original submitter ID (reporter):", reporterUser.id);
    console.log("[Email Agent] 📝 Category ID:", finalCategoryId);
    
    
    // طلب صريح فقط (وسم أو سطر مستقل) — انظر wantsNewspaperByline.
    const publishAnonymously = wantsNewspaperByline(subject, text);
    // Newspaper account ID for anonymous publishing ("صحيفة سبق")
    const NEWSPAPER_ACCOUNT_ID = 'RnP7eDOAl5T5rGpib9_8d';
    
    // Determine authorId: newspaper account if anonymous, else reporter
    let articleAuthorId = reporterUser.id;
    if (publishAnonymously) {
      console.log("[Email Agent] 📰 Anonymous publishing detected (#صحيفة/#سبق) - using newspaper account");
      articleAuthorId = NEWSPAPER_ACCOUNT_ID;
    }
    console.log("[Email Agent] 📝 Final Author ID:", articleAuthorId, publishAnonymously ? "(newspaper account)" : "(reporter)");
    
    // 📰 Reporter ID: Always default to newspaper account ("صحيفة سبق") for email-sourced articles
    const articleReporterId = NEWSPAPER_ACCOUNT_ID;
    console.log("[Email Agent] 📰 Reporter ID: صحيفة سبق (default for email articles)");
    
    // 🔗 Prepare source info (for URL-extracted articles, include source attribution)
    const sourceInfo = extractedFromUrl && urlExtractionResult?.article ? {
      channel: "email",
      externalSource: urlExtractionResult.article.sourceNameAr,
      externalUrl: urlExtractionResult.article.sourceUrl,
      attribution: urlExtractionResult.article.attribution,
    } : {
      channel: "email",
    };
    
    // Embed additional images (beyond the featured one) as <img> tags in content
    // so they render on all clients (web, iOS, Android) without needing a separate API call
    let finalContent = editorialResult.optimized.content;
    if (uploadedImages.length > 1) {
      const extraImages = uploadedImages.slice(1);
      const imgTags = extraImages
        .map((url, i) => `<img src="${url}" alt="${articleTitle} - صورة ${i + 2}" />`)
        .join('\n');
      finalContent = finalContent + '\n' + imgTags;
      console.log(`[Email Agent] 🖼️ Embedded ${extraImages.length} additional images into article content`);
    }

    // قرار النشر المباشر: إعداد المرسل، ثم صحة مصدر الرسالة، ثم الكلمات المحظورة.
    // أي منع يحفظ الخبر مسودة ولا يضيعه.
    let publishNow = trustedSender.autoPublish === true;
    let heldReason: string | null = null;
    if (publishNow && senderAuthFailed) {
      publishNow = false;
      heldReason = "تعذّر التحقق من أن الرسالة صادرة من بريد المرسل (SPF/DKIM)، فحُفظت مسودة للمراجعة.";
    }
    if (publishNow) {
      const denial = await denyBannedWords({
        userId: null, // لا استثناء لحساب آلي: القرار للمحرر
        nextStatus: "published",
        content: {
          title: articleTitle,
          excerpt: editorialResult.optimized.lead,
          content: finalContent,
          keywords: editorialResult.optimized.seoKeywords,
        },
        actorLabel: `البريد الذكي — ${trustedSender.name}`,
        surface: "email",
      });
      if (denial) {
        publishNow = false;
        heldReason = denial.message;
      }
    }
    if (heldReason) console.log("[Email Agent] ⏸️ Auto-publish held → draft:", heldReason);

    const articleData: any = {
      id: nanoid(),
      title: articleTitle,
      slug: articleSlug,
      englishSlug,
      content: finalContent,
      excerpt: editorialResult.optimized.lead || "",
      authorId: articleAuthorId, // 👤 Newspaper account if anonymous, else reporter
      submitterId: reporterUser.id, // 📊 Always track original submitter for productivity
      reporterId: articleReporterId, // 📰 Default to صحيفة سبق for email articles
      status: publishNow ? "published" : "draft",
      imageUrl: featuredImage, // 🖼️ Featured image URL (first uploaded image)
      seo: {
        keywords: editorialResult.optimized.seoKeywords,
      },
      categoryId: finalCategoryId, // 🎯 Always has a valid category!
      createdAt: new Date(),
      publishedAt: publishNow ? new Date() : null,
      // 🔥 Essential fields for article visibility
      articleType: isInfographic ? "infographic" : "news", // 🎨 Set to infographic if detected
      newsType: "regular", // Default news type (not breaking/featured)
      hideFromHomepage: false, // Article must be visible on homepage
      displayOrder: Math.floor(Date.now() / 1000), // New articles appear at top (seconds for consistency)
      source: extractedFromUrl ? "url" : "email", // 📧 Mark source: email or url
      sourceInfo: sourceInfo, // 🔗 Additional source metadata (JSON)
      sourceMetadata: { 
        type: "email", 
        from: from || trustedSender?.email || "",
        senderName: trustedSender?.name || "", // 👤 Sender name from trusted email senders
        senderId: trustedSender?.id || ""
      }, // 📧 Track sender for dashboard display
      // 🎨 Infographic-specific fields
      ...(isInfographic && featuredImage ? {
        infographicBannerUrl: featuredImage,
        infographicType: "image",
      } : {}),
    };
    
    console.log("[Email Agent] 📝 Article type:", articleData.articleType);
    if (isInfographic) {
      console.log("[Email Agent] 🎨 Infographic banner URL:", articleData.infographicBannerUrl);
    }

    let article: any;
    
    console.log("[Email Agent] 📝 Creating article...");
    console.log("[Email Agent]    - Language:", editorialResult.language);
    console.log("[Email Agent]    - Status:", articleData.status);
    console.log("[Email Agent]    - Auto-publish:", trustedSender.autoPublish);
    console.log("[Email Agent]    - Image URL in articleData:", articleData.imageUrl || "NULL");
    
    try {
      // Use the correct table based on language
      if (editorialResult.language === "en") {
        // For English articles, insert directly into en_articles table
        // Note: categoryId must be null because en_articles references enCategories, not categories
        const enArticleData = {
          ...articleData,
          categoryId: null, // en_articles.categoryId references enCategories, not categories
          englishSlug: articleData.englishSlug || generateEnglishSlug(7),
        };
        const [newEnArticle] = await db
          .insert(enArticles)
          .values([enArticleData as any])
          .returning();
        article = newEnArticle;
        console.log("[Email Agent] ✅ English article inserted into en_articles table");
        
        // Invalidate English homepage cache
        memoryCache.invalidatePattern('^en:homepage');
        memoryCache.invalidatePattern('^en:articles:');
      } else if (editorialResult.language === "ur") {
        // For Urdu articles, use createUrArticle method
        article = await storage.createUrArticle(articleData);
      } else {
        // For Arabic (default) and any other language, use the main articles table
        article = await storage.createArticle(articleData);
      }

      // en/ur تُحفظ في جداولها، وعمود article_id في السجل يشير إلى جدول المقالات العربي فقط.
      const linkableArticleId = editorialResult.language === "en" || editorialResult.language === "ur" ? null : article?.id ?? null;
      createdArticle = { id: linkableArticleId, published: publishNow };
      // أثر دائم فور الإنشاء: لو أُعيد تشغيل الخادم قبل نهاية المعالجة لا يبقى السجل «واردًا»
      // فيُحسب منقطعًا وتُعرض إعادة معالجته (نشر مكرر).
      await storage.updateEmailWebhookLog(webhookLog.id, {
        status: publishNow ? "published" : "processed",
        ...(linkableArticleId ? { articleId: linkableArticleId } : {}),
      }).catch((linkError: any) => console.error("[Email Agent] ⚠️ تعذر ربط السجل بالمقال فور إنشائه:", linkError?.message));
      console.log("[Email Agent] ✅ Article created successfully:", article?.id);
      console.log("[Email Agent]    - Title:", articleData.title);
      console.log("[Email Agent]    - Status:", articleData.status);
      
      // 🖼️ Link ALL images to article (not just the featured image)
      const imageAttachments = allAttachmentsMetadata.filter(a => a.type === 'image');
      if (article && imageAttachments.length > 0) {
        console.log(`[Email Agent] 🖼️ Linking ${imageAttachments.length} images to article...`);
        
        for (let i = 0; i < imageAttachments.length; i++) {
          const img = imageAttachments[i];
          try {
            const titleWords = articleData.title.split(' ').slice(0, 8).join(' ');
            let altText = i === 0 
              ? `صورة ${titleWords}`
              : `${articleData.excerpt?.split(' ').slice(0, 5).join(' ') || titleWords} - صورة ${i + 1}`;
            
            if (altText.length > 125) {
              altText = altText.substring(0, 122) + "...";
            }
            
            await db.transaction(async (tx) => {
              const [mediaFile] = await tx.insert(mediaFiles).values({
                fileName: img.filename,
                originalName: img.filename,
                url: img.url,
                type: "image",
                mimeType: img.contentType,
                size: img.size,
                category: "articles",
                uploadedBy: reporterUser.id,
                title: `${titleWords} - صورة ${i + 1}`,
                keywords: ["email", "auto-upload"],
                altText: altText,
              }).returning();
              
              await tx.insert(articleMediaAssets).values({
                articleId: article.id,
                mediaFileId: mediaFile.id,
                locale: editorialResult.language || "ar",
                displayOrder: i,
                altText: altText,
                moderationStatus: "approved",
                sourceName: "Email Agent",
              });
              
              console.log(`[Email Agent] ✅ Linked image ${i + 1}/${imageAttachments.length}: ${img.filename}`);
            });
          } catch (linkError) {
            console.error(`[Email Agent] ⚠️ Failed to link image ${i + 1}:`, linkError);
          }
        }
        console.log(`[Email Agent] 🖼️ Finished linking ${imageAttachments.length} images`);
      }
      
      // 🔄 INVALIDATE HOMEPAGE CACHE - New article should appear immediately
      if (publishNow && article) {
        console.log(`[Email Agent] 🗑️ Invalidating homepage cache for immediate article visibility...`);
        invalidatePublishedContent({
          articleSlug: (article as any)?.slug,
          isBreaking: (article as any)?.newsType === 'breaking',
          reason: `email-agent-auto-publish:${article.id}`,
        });
        console.log(`[Email Agent] ✅ Homepage cache invalidated (cross-pod + Cloudflare)`);
        
        // 📢 Send editor-in-chief publish alert (fire-and-forget)
        (async () => {
          const publisherName = await getPublisherName(reporterUser.id);
          sendEditorPublishAlert({
            id: article.id,
            title: article.title,
            slug: article.slug,
            englishSlug: article.englishSlug,
            authorName: publisherName,
            publishedAt: article.publishedAt,
            language: editorialResult.language as 'ar' | 'en' | 'ur',
          });
        })().catch(err => console.error("[EditorAlerts] Error:", err));
      }
    } catch (createError) {
      console.error("[Email Agent] ❌ Error creating article:", createError);
      throw createError; // Re-throw to trigger catch block
    }

    // Broadcast notification to staff users about new published article
    if (publishNow && article) {
      try {
        console.log("[Email Agent] 📢 Broadcasting notification to staff about published article...");
        
        // Determine notification language based on detected language
        const detectedLanguage = editorialResult.language;
        let notificationTitle: string;
        let notificationBody: string;
        
        // Determine deeplink based on language
        let articleDeeplink: string;
        if (detectedLanguage === "en") {
          notificationTitle = "New Article Published";
          notificationBody = `A new article has been published via email: ${articleData.title}`;
          articleDeeplink = `/en/article/${articleData.englishSlug}`;
        } else if (detectedLanguage === "ur") {
          notificationTitle = "نیا مضمون شائع ہوا";
          notificationBody = `ای میل کے ذریعے نیا مضمون شائع کیا گیا: ${articleData.title}`;
          articleDeeplink = `/ur/article/${articleData.englishSlug}`;
        } else {
          // Default to Arabic
          notificationTitle = "مقال جديد";
          notificationBody = `تم نشر مقال جديد عبر البريد الإلكتروني: ${articleData.title}`;
          articleDeeplink = `/article/${articleData.englishSlug}`;
        }
        
        await storage.broadcastNotificationToStaff({
          type: "article_published",
          title: notificationTitle,
          body: notificationBody,
          deeplink: articleDeeplink,
          metadata: {
            articleId: article.id,
            articleSlug: articleDeeplink,
            language: detectedLanguage,
            articleTitle: articleData.title,
            publishedAt: new Date().toISOString(),
            reporter: {
              userId: reporterUser.id,
              name: reporterUser.firstName && reporterUser.lastName 
                ? `${reporterUser.firstName} ${reporterUser.lastName}`
                : reporterUser.email,
            },
            imageUrl: articleData.imageUrl || allAttachmentsMetadata.find(a => a.type === 'image')?.url || null,
          }
        });
        
        console.log("[Email Agent] ✅ Staff notification sent successfully");
      } catch (notificationError) {
        // Log error but don't fail the entire operation
        console.error("[Email Agent] ⚠️ Failed to send staff notification:", notificationError);
        console.error("[Email Agent] ⚠️ Article was published successfully, but notification failed");
      }
    } else {
      console.log("[Email Agent] ℹ️ Skipping staff notification (auto-publish disabled or article not created)");
    }

    // Update webhook log — wrapped in try/catch so a log-update failure
    // doesn't mask the fact that the article was already published.
    const webhookStatus = publishNow ? "published" : "processed";
    try {
      await storage.updateEmailWebhookLog(webhookLog.id, {
        status: webhookStatus,
        trustedSenderId: trustedSender.id,
        ...(createdArticle?.id ? { articleId: createdArticle.id } : {}),
        attachmentsCount: allAttachmentsMetadata.length,
        attachmentsData: cleanAttachmentsForLog(),
        ...(heldReason ? { processingError: heldReason } : {}),
        aiAnalysis: {
          contentQuality: editorialResult.qualityScore,
          languageDetected: editorialResult.language,
          categoryPredicted: editorialResult.detectedCategory,
          isNewsWorthy: editorialResult.hasNewsValue,
          warnings: [`sender_auth:${senderAuth}`],
        },
      });
      console.log("[Email Agent] 📊 Webhook log updated — attachments:", allAttachmentsMetadata.length);
    } catch (logUpdateError: any) {
      console.error("[Email Agent] ⚠️ Failed to update webhook log (article was published):", logUpdateError?.cause || logUpdateError);
    }

    const today = new Date();
    await storage.updateEmailAgentStats(today, {
      emailsReceived: 1,
      ...(publishNow ? { emailsPublished: 1 } : { emailsDrafted: 1 }),
    }).catch((err: any) => console.error("[Email Agent] تعذر تحديث الإحصاءات (المقال أُنشئ):", err?.message));

    // مسودة محجوزة عن النشر المباشر: ينبَّه فريق التحرير لأن المرسل اعتاد النشر الفوري.
    if (heldReason && article) {
      storage.broadcastNotificationToStaff({
        type: "article_draft_held",
        title: "خبر بريد بانتظار المراجعة",
        body: `${articleData.title} — ${heldReason}`.slice(0, 400),
        deeplink: `/dashboard/articles/${article.id}/edit`,
        metadata: { articleId: article.id, channel: "email", senderName: trustedSender.name },
      }).catch((err) => console.error("[Email Agent] تعذر تنبيه التحرير بالمسودة المحجوزة:", err?.message));
    }

    const publicPath = editorialResult.language === "en" ? "/en/article/" : editorialResult.language === "ur" ? "/ur/article/" : "/article/";
    replyToSender(
      publishNow
        ? { kind: "published", title: articleData.title, url: `https://sabq.org${publicPath}${articleData.englishSlug}` }
        : { kind: "draft", title: articleData.title, ...(heldReason ? { note: heldReason } : {}) },
    );

    // Early ACK already returned 200 after dedup claim.
    if (res.headersSent) {
      console.log("[Email Agent] ✅ Processing finished (already ACKed to SendGrid)");
      return;
    }
    respondWebhook(res, {
      success: true,
      message: publishNow 
        ? "Article published successfully (edited with Sabq style)" 
        : "Article saved as draft (edited with Sabq style)",
      article: {
        id: article?.id,
        title: articleData.title,
        status: articleData.status,
        qualityScore: editorialResult.qualityScore,
        language: editorialResult.language,
        category: editorialResult.detectedCategory,
      },
      editorial: {
        qualityScore: editorialResult.qualityScore,
        issues: editorialResult.issues,
        suggestions: editorialResult.suggestions,
      },
    });
    return;

  } catch (error: any) {
    console.error("[Email Agent] ❌ Error processing webhook:", error);
    console.error("[Email Agent] ❌ Error stack:", error.stack);
    
    // المقال أُنشئ ثم تعثرت خطوة لاحقة: السجل يشير إلى المقال ولا يُعرض كفاشل قابل للإعادة.
    if (webhookLog?.id && createdArticle) {
      await storage.updateEmailWebhookLog(webhookLog.id, {
        status: createdArticle.published ? "published" : "processed",
        ...(createdArticle.id ? { articleId: createdArticle.id } : {}),
        processingError: "أُنشئ الخبر ثم تعثرت خطوة لاحقة. راجعه من لوحة الأخبار.",
      }).catch((updateError: any) => console.error("[Email Agent] ⚠️ Failed to update webhook log status:", updateError?.message));
    } else if (webhookLog?.id) {
      try {
        await storage.updateEmailWebhookLog(webhookLog.id, {
          status: "failed",
          rejectionReason: "processing_error",
          aiAnalysis: {
            errors: [error.message],
            warnings: [
              ...(senderAuthVerdict ? [`sender_auth:${senderAuthVerdict}`] : []),
              ...(error.stack ? [error.stack.substring(0, 500)] : []), // First 500 chars of stack trace
            ],
          },
        });
        console.log("[Email Agent] ✅ Webhook log updated to 'failed' status");
      } catch (updateError) {
        console.error("[Email Agent] ⚠️ Failed to update webhook log status:", updateError);
      }
    } else {
      console.log("[Email Agent] ⚠️ Webhook log not created yet - error occurred during email parsing");
    }
    
    // الفشل لا يحبس الخبر: تُفك بصمة التكرار ويُبلَّغ المرسل الموثوق ليعيد الإرسال.
    if (!createdArticle) {
      if (dedupFrom) await releaseEmailContentDedup(dedupFrom, dedupSubject).catch(() => undefined);
      if (tokenWasVerified) replyToSender({ kind: "failed" });
    }

    const today = new Date();
    await storage.updateEmailAgentStats(today, {
      emailsReceived: 1,
      emailsFailed: 1,
    }).catch(() => undefined);

    // Early ACK may already have been sent after dedup claim — don't double-send.
    respondWebhook(res, {
      success: false,
      message: "Internal processing error",
      error: error.message,
    });
  }
}

router.post("/webhook", requireInboundWebhookSecret, upload.any(), (req: Request, res: Response) => {
  void processInboundEmail(req, res);
});

/**
 * يقرأ مرفقات السجل المحفوظة خاصةً ليعاد تمريرها للمعالجة كأنها وصلت الآن.
 * تعذّر قراءة أي مرفق يرمي خطأ: لا يُنشر الخبر ناقصًا بصمت، والرسالة تبقى قابلة للإعادة.
 */
async function loadStoredAttachments(log: any): Promise<Express.Multer.File[]> {
  const files: Express.Multer.File[] = [];
  const stored = Array.isArray(log.attachmentsData) ? log.attachmentsData : [];
  for (const item of stored) {
    // المسارات الخاصة فقط (ما حفظته نقطة الحفظ). لا يُجلب أي رابط خارجي.
    if (!item?.url || /^https?:\/\//i.test(item.url) || !item.url.includes("email-attachments/")) continue;
    const buffer = await readStoredAttachment(item.url);
    files.push({
      fieldname: "attachment",
      originalname: item.filename || "attachment",
      encoding: "7bit",
      mimetype: item.contentType || "application/octet-stream",
      buffer,
      size: buffer.length,
    } as Express.Multer.File);
  }
  return files;
}

function storedSenderAuth(log: any): SenderAuthVerdict {
  const warnings: unknown[] = Array.isArray(log?.aiAnalysis?.warnings) ? log.aiAnalysis.warnings : [];
  const entry = warnings.find((w) => typeof w === "string" && w.startsWith("sender_auth:"));
  const verdict = typeof entry === "string" ? entry.slice("sender_auth:".length) : "";
  return verdict === "pass" || verdict === "fail" ? verdict : "unknown";
}

// POST /api/email-agent/logs/:id/reprocess — «أعد المعالجة» لرسالة فشلت بعد التحقق منها
router.post("/logs/:id/reprocess", isAuthenticated, requirePermission('admin.manage_settings'), async (req: Request, res: Response) => {
  try {
    const existing = await getEmailWebhookLogById(req.params.id);
    if (!existing) return res.status(404).json({ message: "الرسالة غير موجودة" });
    if (!isReprocessableLog(existing)) {
      return res.status(409).json({ message: "هذه الرسالة لا تُعاد معالجتها. المرفوضة يعيد المرسل إرسالها." });
    }
    const sender = existing.trustedSenderId ? await storage.getTrustedSenderById(existing.trustedSenderId) : null;
    if (!sender || sender.status !== "active") {
      return res.status(409).json({ message: "المرسل لم يعد نشطًا. فعّله أولًا ثم أعد المعالجة." });
    }

    const log = await claimLogForReprocess(existing.id);
    if (!log) return res.status(409).json({ message: "الرسالة تُعالج الآن أو عولجت." });

    let files: Express.Multer.File[];
    try {
      files = await loadStoredAttachments(log);
    } catch (attachmentError: any) {
      console.error("[Email Agent] تعذر قراءة مرفق محفوظ لإعادة المعالجة:", attachmentError?.message);
      await releaseReprocessClaim(log.id, "processing_interrupted", "تعذّرت قراءة مرفق محفوظ. أعد المحاولة بعد قليل.");
      return res.status(503).json({ message: "تعذّرت قراءة مرفقات الرسالة الآن. أعد المحاولة بعد قليل." });
    }

    // المرسل ربما أعاد إرسال الخبر نفسه بعد الفشل: لا ننشره مرتين.
    const claim = await claimEmailDedup({
      messageId: `reprocess:${log.id}:${Date.now()}`,
      from: log.fromEmail,
      subject: log.subject,
    });
    if (!claim.claimed) {
      await releaseReprocessClaim(log.id, "duplicate_content", "أعاد المرسل إرسال الخبر نفسه وعولجت رسالته الجديدة.");
      return res.status(409).json({ message: "أعاد المرسل إرسال الخبر نفسه وعولجت رسالته الجديدة." });
    }

    const strip = (value: string | null) => (value || "").replace(/\[TOKEN\]/g, " ");
    const syntheticReq = {
      body: { from: log.fromEmail, subject: strip(log.subject).replace(/\s+/g, " ").trim(), text: strip(log.bodyText), html: strip(log.bodyHtml) },
      files,
    } as unknown as Request;
    const syntheticRes = { headersSent: true, status() { return this; }, json() { return this; } } as unknown as Response;

    // المعالجة تأخذ حتى دقيقة: تجري في الخلفية والصفحة تحدّث السجل.
    void processInboundEmail(syntheticReq, syntheticRes, { log, senderAuth: storedSenderAuth(existing) });
    return res.status(202).json({ message: "بدأت إعادة المعالجة", attachments: files.length });
  } catch (error: any) {
    console.error("[Email Agent] Error reprocessing log:", error);
    return res.status(500).json({ message: "تعذّرت إعادة المعالجة" });
  }
});

// POST /api/email-agent/senders/:id/rotate-token — رمز جديد من الخادم، والقديم يعمل 48 ساعة
router.post("/senders/:id/rotate-token", isAuthenticated, requirePermission('admin.manage_settings'), async (req: Request, res: Response) => {
  try {
    const expiry = req.body?.expiry ?? "1y";
    if (!isTokenExpiryOption(expiry)) return res.status(400).json({ message: "مدة انتهاء غير صالحة" });
    const sender = await rotateSenderToken(req.params.id, expiry);
    if (!sender) return res.status(404).json({ message: "المرسل غير موجود" });
    return res.json(sender);
  } catch (error: any) {
    console.error("[Email Agent] Error rotating token:", error?.message);
    return res.status(500).json({ message: "تعذّر تدوير الرمز" });
  }
});

// POST /api/email-agent/senders/:id/revoke-previous-token — «أوقف القديم الآن»
router.post("/senders/:id/revoke-previous-token", isAuthenticated, requirePermission('admin.manage_settings'), async (req: Request, res: Response) => {
  try {
    const sender = await revokePreviousSenderToken(req.params.id);
    if (!sender) return res.status(404).json({ message: "المرسل غير موجود" });
    return res.json(sender);
  } catch (error: any) {
    console.error("[Email Agent] Error revoking previous token:", error?.message);
    return res.status(500).json({ message: "تعذّر إيقاف الرمز القديم" });
  }
});

// المسار يكتب "processed" للرسالة التي حُفظت مسودة (مرسل بلا نشر تلقائي)؛
// "drafted" قيمة تاريخية بقيت في صفوف قديمة.
const DRAFTED_STATUSES = new Set(["processed", "drafted"]);

function isDraftedStatus(status?: string | null): boolean {
  return !!status && DRAFTED_STATUSES.has(status);
}

// الرسائل العالقة تُكشف عند فتح الصفحة (لا مهمة مجدولة): UPDATE واحد رخيص،
// ومرة كل دقيقتين لكل نسخة خادم على الأكثر.
let lastStuckSweepAt = 0;
function sweepStuckEmailsInBackground(): void {
  if (Date.now() - lastStuckSweepAt < 2 * 60 * 1000) return;
  lastStuckSweepAt = Date.now();
  void (async () => {
    const stuck = await sweepStuckEmailLogs();
    if (stuck.length === 0) return;
    console.warn(`[Email Agent] ${stuck.length} stuck message(s) marked failed`);
    await storage.updateEmailAgentStats(new Date(), { emailsFailed: stuck.length });
    if (!emailAgentRepliesEnabled()) return;
    for (const row of stuck) {
      // الرد للمرسل الذي ثبت رمزه فقط.
      if (!row.tokenVerified) continue;
      const reply = buildSenderReply(row.subject, { kind: "failed" });
      await sendEmailNotification({ to: row.fromEmail, ...reply });
    }
  })().catch((error) => console.error("[Email Agent] stuck sweep failed:", error?.message));
}

// حقول المرسل الموثوق المسموح تعديلها من الواجهة — لا يُمرَّر جسم الطلب كما هو.
const senderInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(120),
  language: z.enum(["ar", "en", "ur"]),
  autoPublish: z.boolean(),
  defaultCategory: z.preprocess((v) => (v === "" || v === "none" ? null : v), z.string().nullable().optional()),
  reporterUserId: z.preprocess((v) => (v === "" || v === "none" ? null : v), z.string().nullable().optional()),
  status: z.enum(["active", "suspended", "revoked"]),
});

// GET /api/email-agent/stats - Get email agent statistics (admin only)
router.get("/stats", isAuthenticated, requirePermission('admin.manage_settings'), async (req: Request, res: Response) => {
  try {
    const { start, end } = riyadhDayRange();
    
    // Get all webhook logs for today using date range query
    const todayLogs = await storage.getEmailWebhookLogsByDateRange(start, end);
    
    // Calculate stats from actual logs (already filtered by DB)
    const stats = {
      emailsReceived: todayLogs.length,
      emailsPublished: todayLogs.filter((log: any) => log.status === 'published').length,
      emailsDrafted: todayLogs.filter((log: any) => isDraftedStatus(log.status)).length,
      emailsRejected: todayLogs.filter((log: any) => log.status === 'rejected').length,
      emailsFailed: todayLogs.filter((log: any) => log.status === 'failed').length,
    };
    
    // Get language counts from AI analysis in webhook logs
    const languageCounts = {
      arabicCount: todayLogs.filter((log: any) => log.aiAnalysis?.languageDetected === 'ar').length,
      englishCount: todayLogs.filter((log: any) => log.aiAnalysis?.languageDetected === 'en').length,
      urduCount: todayLogs.filter((log: any) => log.aiAnalysis?.languageDetected === 'ur').length,
    };
    
    // Return combined stats
    return res.json({
      ...stats,
      ...languageCounts,
    });
  } catch (error: any) {
    console.error("[Email Agent] Error fetching stats:", error);
    return res.status(500).json({
      message: "Failed to fetch statistics",
      error: error.message,
    });
  }
});

// GET /api/email-agent/badge-stats - Get badge notification statistics (admin only)
router.get("/badge-stats", isAuthenticated, requirePermission('admin.manage_settings'), async (req: Request, res: Response) => {
  try {
    sweepStuckEmailsInBackground();
    const { start, end } = riyadhDayRange();
    
    // Get all webhook logs for today using date range query
    const todayLogs = await storage.getEmailWebhookLogsByDateRange(start, end);
    
    // Calculate badge stats
    const newMessages = todayLogs.filter((log: any) => log.status === 'received').length;
    const publishedToday = todayLogs.filter((log: any) => log.status === 'published').length;
    const draftedToday = todayLogs.filter((log: any) => isDraftedStatus(log.status)).length;
    const rejectedToday = todayLogs.filter((log: any) => log.status === 'rejected').length;
    
    return res.json({
      newMessages,
      publishedToday,
      draftedToday,
      rejectedToday,
    });
  } catch (error: any) {
    console.error('[Email Badge Stats] Error:', error);
    return res.status(500).json({ message: 'فشل في تحميل إحصائيات البادج' });
  }
});

// GET /api/email-agent/logs - Get email webhook logs with pagination (admin only)
router.get("/logs", isAuthenticated, requirePermission('admin.manage_settings'), async (req: Request, res: Response) => {
  try {
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit, 50, 200);
    const status = req.query.status as string;
    const offset = (page - 1) * limit;
    
    // Build filters with pagination
    const filters: { status?: string; trustedSenderId?: string; limit?: number; offset?: number } = {
      limit,
      offset,
    };
    if (status && status !== 'all') {
      filters.status = status;
    }
    
    // Get logs with filters (returns { logs, total })
    const result = await storage.getEmailWebhookLogs(filters);
    
    return res.json({
      logs: result.logs,
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    });
  } catch (error: any) {
    console.error("[Email Agent] Error fetching logs:", error);
    return res.status(500).json({
      message: "Failed to fetch email logs",
      error: error.message,
    });
  }
});

// POST /api/email-agent/logs/bulk-delete - Delete several webhook logs (admin only)
router.post("/logs/bulk-delete", isAuthenticated, requirePermission('admin.manage_settings'), async (req: Request, res: Response) => {
  try {
    const { ids } = req.body ?? {};
    
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
      return res.status(400).json({ message: "قائمة المعرفات مطلوبة" });
    }
    
    await storage.deleteEmailWebhookLogs(ids);
    return res.json({ message: "Logs deleted successfully", deleted: ids.length });
  } catch (error: any) {
    console.error("[Email Agent] Error bulk deleting logs:", error);
    return res.status(500).json({
      message: "Failed to delete logs",
      error: error.message,
    });
  }
});

// GET /api/email-agent/logs/:id - Get a specific webhook log (admin only)
// GET /api/email-agent/logs/:id/attachments/:index — «عرض» مرفق خاص برابط موقّع قصير العمر
router.get("/logs/:id/attachments/:index", isAuthenticated, requirePermission('admin.manage_settings'), async (req: Request, res: Response) => {
  try {
    const log = await getEmailWebhookLogById(req.params.id);
    const items: any[] = Array.isArray(log?.attachmentsData) ? (log!.attachmentsData as any[]) : [];
    const item = items[Number.parseInt(req.params.index, 10)];
    const url = typeof item?.url === "string" ? item.url : "";
    if (!url) return res.status(404).json({ message: "المرفق غير موجود" });
    if (/^https:\/\//i.test(url)) return res.redirect(302, url);
    if (!isProviderPrivateKey(url)) return res.status(404).json({ message: "المرفق محفوظ في تخزين قديم" });
    const signed = await new ObjectStorageService().getPrivateFileDownloadURL(url, 300);
    res.setHeader("Cache-Control", "private, no-store");
    return res.redirect(302, signed);
  } catch (error: any) {
    console.error("[Email Agent] attachment view failed:", error?.message);
    return res.status(500).json({ message: "تعذر فتح المرفق" });
  }
});

router.get("/logs/:id", isAuthenticated, requirePermission('admin.manage_settings'), async (req: Request, res: Response) => {
  try {
    const result = await storage.getEmailWebhookLogs();
    const log = result.logs.find((l: any) => l.id === req.params.id);
    
    if (!log) {
      return res.status(404).json({ message: "Log not found" });
    }
    
    return res.json(log);
  } catch (error: any) {
    console.error("[Email Agent] Error fetching log:", error);
    return res.status(500).json({
      message: "Failed to fetch log",
      error: error.message,
    });
  }
});

// DELETE /api/email-agent/logs/:id - Delete a webhook log (admin only)
router.delete("/logs/:id", isAuthenticated, requirePermission('admin.manage_settings'), async (req: Request, res: Response) => {
  try {
    await storage.deleteEmailWebhookLog(req.params.id);
    return res.json({ message: "Log deleted successfully" });
  } catch (error: any) {
    console.error("[Email Agent] Error deleting log:", error);
    return res.status(500).json({
      message: "Failed to delete log",
      error: error.message,
    });
  }
});

// GET /api/email-agent/senders - Get all trusted senders (admin only)
router.get("/senders", isAuthenticated, requirePermission('admin.manage_settings'), async (req: Request, res: Response) => {
  try {
    const senders = await storage.getTrustedSenders();
    return res.json(senders);
  } catch (error: any) {
    console.error("[Email Agent] Error fetching senders:", error);
    return res.status(500).json({
      message: "Failed to fetch trusted senders",
      error: error.message,
    });
  }
});

// GET /api/email-agent/senders/:id - Get a specific trusted sender (admin only)
router.get("/senders/:id", isAuthenticated, requirePermission('admin.manage_settings'), async (req: Request, res: Response) => {
  try {
    const sender = await storage.getTrustedSenderById(req.params.id);
    if (!sender) {
      return res.status(404).json({ message: "Sender not found" });
    }
    return res.json(sender);
  } catch (error: any) {
    console.error("[Email Agent] Error fetching sender:", error);
    return res.status(500).json({
      message: "Failed to fetch sender",
      error: error.message,
    });
  }
});

// POST /api/email-agent/senders - Create a new trusted sender (admin only)
router.post("/senders", isAuthenticated, requirePermission('admin.manage_settings'), async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const parsed = senderInputSchema.partial({ language: true, autoPublish: true, status: true }).safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "بيانات المرسل غير صالحة", issues: parsed.error.issues });
    }
    // رمز الواجهة يُقبل بصيغته الكاملة فقط (64 خانة)، وإلا يولّده الخادم.
    const sender = await storage.createTrustedSender(
      { ...parsed.data, token: resolveSenderToken(req.body?.token), tokenCreatedAt: new Date() } as any,
      userId,
    );
    return res.status(201).json(sender);
  } catch (error: any) {
    console.error("[Email Agent] Error creating sender:", error);
    return res.status(500).json({
      message: "Failed to create trusted sender",
      error: error.message,
    });
  }
});

// PUT /api/email-agent/senders/:id - Update a trusted sender (admin only)
router.put("/senders/:id", isAuthenticated, requirePermission('admin.manage_settings'), async (req: Request, res: Response) => {
  try {
    const parsed = senderInputSchema.partial().safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "بيانات المرسل غير صالحة", issues: parsed.error.issues });
    }
    // الرمز لا يتغير من هذا المسار.
    const sender = await storage.updateTrustedSender(req.params.id, parsed.data as any);
    if (!sender) return res.status(404).json({ message: "Sender not found" });
    return res.json(sender);
  } catch (error: any) {
    console.error("[Email Agent] Error updating sender:", error);
    return res.status(500).json({
      message: "Failed to update trusted sender",
      error: error.message,
    });
  }
});

// DELETE /api/email-agent/senders/:id - Delete a trusted sender (admin only)
router.delete("/senders/:id", isAuthenticated, requirePermission('admin.manage_settings'), async (req: Request, res: Response) => {
  try {
    await storage.deleteTrustedSender(req.params.id);
    return res.json({ message: "Trusted sender deleted successfully" });
  } catch (error: any) {
    console.error("[Email Agent] Error deleting sender:", error);
    return res.status(500).json({
      message: "Failed to delete trusted sender",
      error: error.message,
    });
  }
});

// 🔍 Diagnostic endpoint - Test if webhooks can reach the server (development only)
router.post("/webhook-test", async (req: Request, res: Response) => {
  // Only allow in development environment to prevent abuse in production
  if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_WEBHOOK_TEST) {
    return res.status(404).json({ error: "Not found" });
  }
  
  console.log("🔍 [WEBHOOK TEST] ==================== START ====================");
  console.log("🔍 [WEBHOOK TEST] Received request!");
  console.log("🔍 [WEBHOOK TEST] Method:", req.method);
  console.log("🔍 [WEBHOOK TEST] Headers:", JSON.stringify(req.headers, null, 2));
  console.log("🔍 [WEBHOOK TEST] Body keys:", Object.keys(req.body));
  console.log("🔍 [WEBHOOK TEST] Body:", JSON.stringify(req.body, null, 2).substring(0, 500));
  console.log("🔍 [WEBHOOK TEST] ==================== END ====================");
  
  res.status(200).json({
    success: true,
    message: "Webhook test received successfully!",
    timestamp: new Date().toISOString(),
    bodyKeys: Object.keys(req.body),
    hasEmail: !!req.body.email,
    hasFrom: !!req.body.from,
    hasSubject: !!req.body.subject,
  });
});

export default router;
