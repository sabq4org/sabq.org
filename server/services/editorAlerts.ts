/**
 * Editor-in-Chief Alerts Service
 * Sends notifications to the Editor-in-Chief when articles are published
 * via Email and WhatsApp
 */
import { log } from "../utils/logger";

import { sendEmailNotification } from "./email";
import { sendWhatsAppMessage } from "./whatsapp";
import { sendArticlePublishedEmail, sendArticleRejectedEmail } from "./employeeNotifications";
import { db } from "../db";
import { systemSettings, users, articles } from "@shared/schema";
import { eq, and } from "drizzle-orm";

/**
 * Get publisher name from user ID
 */
export async function getPublisherName(userId: string | number | undefined): Promise<string> {
  if (!userId) return "غير معروف";
  
  try {
    const userIdStr = String(userId);
    const user = await db.query.users.findFirst({
      where: eq(users.id, userIdStr),
      columns: { firstName: true, lastName: true, email: true },
    });
    
    if (user?.firstName || user?.lastName) {
      return [user.firstName, user.lastName].filter(Boolean).join(" ");
    }
    return user?.email?.split("@")[0] || "غير معروف";
  } catch (error) {
    console.error("[EditorAlerts] Error getting publisher name:", error);
    return "غير معروف";
  }
}

interface ArticlePublishData {
  id: string;
  title: string;
  slug: string;
  englishSlug?: string;
  authorName: string;
  categoryName?: string;
  publishedAt?: Date;
  language?: 'ar' | 'en' | 'ur'; // Language of the article for correct URL path
}

interface EditorAlertSettings {
  enabled: boolean;
  email?: string;
  whatsappNumber?: string;
  whatsappNumbers?: string[];
  emailEnabled: boolean;
  whatsappEnabled: boolean;
}

const DEFAULT_SETTINGS: EditorAlertSettings = {
  enabled: false,
  emailEnabled: true,
  whatsappEnabled: true,
};

/**
 * Get editor alert settings from database or environment
 */
async function getEditorAlertSettings(): Promise<EditorAlertSettings> {
  try {
    const settings = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.key, "editor_alerts"),
    });

    if (settings?.value) {
      const value = settings.value as EditorAlertSettings;
      log.info("[EditorAlerts] Using database settings:", JSON.stringify(value));
      return {
        ...DEFAULT_SETTINGS,
        ...value,
      };
    }

    // Fallback to environment variables
    const email = process.env.EDITOR_ALERTS_EMAIL;
    const whatsappNumber = process.env.EDITOR_ALERTS_WHATSAPP;
    const enabled = process.env.EDITOR_ALERTS_ENABLED === "true";

    const envSettings = {
      enabled: enabled && !!(email || whatsappNumber),
      email,
      whatsappNumber,
      emailEnabled: !!email,
      whatsappEnabled: !!whatsappNumber,
    };
    
    log.info("[EditorAlerts] Using env settings:", {
      enabled: envSettings.enabled,
      hasEmail: !!email,
      hasWhatsApp: !!whatsappNumber,
      whatsappNumber: whatsappNumber?.substring(0, 8) + "...",
    });

    return envSettings;
  } catch (error) {
    console.error("[EditorAlerts] Error fetching settings:", error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Get the frontend URL for article links
 */
function getFrontendUrl(): string {
  return process.env.FRONTEND_URL || process.env.REPLIT_DOMAINS?.split(",")[0] || "https://sabq.org";
}

/**
 * Format timestamp to Arabic locale
 */
function formatArabicDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Riyadh",
  }).format(date);
}

/**
 * Get article URL based on language
 */
function getArticleUrl(frontendUrl: string, article: ArticlePublishData): string {
  const slug = article.englishSlug || article.slug;
  switch (article.language) {
    case 'en':
      return `${frontendUrl}/en/article/${slug}`;
    case 'ur':
      return `${frontendUrl}/ur/article/${slug}`;
    default:
      return `${frontendUrl}/article/${slug}`;
  }
}

/**
 * Generate HTML email template for article published alert
 */
function generateEmailTemplate(article: ArticlePublishData): { html: string; text: string } {
  const frontendUrl = getFrontendUrl();
  const articleUrl = getArticleUrl(frontendUrl, article);
  const publishTime = article.publishedAt ? formatArabicDateTime(article.publishedAt) : formatArabicDateTime(new Date());

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { 
      font-family: 'Tajawal', Arial, sans-serif; 
      background-color: #f8fafc; 
      margin: 0; 
      padding: 20px; 
      direction: rtl; 
    }
    .container { 
      max-width: 600px; 
      margin: 0 auto; 
      background: #ffffff; 
      border-radius: 12px; 
      overflow: hidden; 
      box-shadow: 0 2px 8px rgba(0,0,0,0.06); 
      border: 1px solid #e5e7eb;
    }
    .header { 
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); 
      padding: 24px; 
      text-align: center; 
      border-bottom: 1px solid #bae6fd;
    }
    .header h1 { 
      color: #0369a1; 
      font-size: 18px; 
      margin: 0; 
      font-weight: 600; 
    }
    .alert-badge {
      display: inline-block;
      background: #0ea5e9;
      color: white;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .content { 
      padding: 32px 24px; 
      text-align: right; 
      background: #ffffff;
    }
    .article-title { 
      color: #1e293b; 
      font-size: 20px; 
      font-weight: bold;
      line-height: 1.6; 
      margin: 0 0 20px 0;
      border-right: 4px solid #0ea5e9;
      padding-right: 12px;
      background: #f8fafc;
      padding: 12px;
      padding-right: 16px;
      border-radius: 0 8px 8px 0;
    }
    .meta-section {
      background: #fafafa;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .meta-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      color: #475569;
      font-size: 14px;
    }
    .meta-row:last-child {
      margin-bottom: 0;
    }
    .meta-label {
      color: #64748b;
      min-width: 80px;
    }
    .meta-value {
      color: #1e293b;
      font-weight: 500;
    }
    .button { 
      display: inline-block; 
      background: #0ea5e9; 
      color: white !important; 
      text-decoration: none; 
      padding: 14px 36px; 
      border-radius: 8px; 
      font-size: 16px; 
      font-weight: 600;
      margin-top: 8px;
      transition: background 0.3s; 
    }
    .button:hover { 
      background: #0284c7; 
    }
    .footer { 
      background: #f8fafc; 
      padding: 16px 24px; 
      text-align: center; 
      color: #94a3b8; 
      font-size: 12px; 
      border-top: 1px solid #e5e7eb; 
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="alert-badge">🔔 تنبيه نشر جديد</div>
      <h1>صحيفة سبق الإلكترونية</h1>
    </div>
    
    <div class="content">
      <h2 class="article-title">${article.title}</h2>
      
      <div class="meta-section">
        <div class="meta-row">
          <span class="meta-label">👤 الناشر:</span>
          <span class="meta-value">${article.authorName}</span>
        </div>
        
        ${article.categoryName ? `
        <div class="meta-row">
          <span class="meta-label">📁 القسم:</span>
          <span class="meta-value">${article.categoryName}</span>
        </div>
        ` : ""}
        
        <div class="meta-row">
          <span class="meta-label">🕐 وقت النشر:</span>
          <span class="meta-value">${publishTime}</span>
        </div>
      </div>
      
      <div style="text-align: center;">
        <a href="${articleUrl}" class="button" data-testid="view-article-button">
          📰 عرض الخبر
        </a>
      </div>
    </div>
    
    <div class="footer">
      هذا تنبيه تلقائي من نظام إدارة المحتوى<br>
      © ${new Date().getFullYear()} صحيفة سبق الإلكترونية
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
🔔 تنبيه نشر جديد - صحيفة سبق

📰 العنوان: ${article.title}

👤 الناشر: ${article.authorName}
${article.categoryName ? `📁 القسم: ${article.categoryName}` : ""}
🕐 وقت النشر: ${publishTime}

🔗 رابط الخبر:
${articleUrl}

---
نظام إدارة المحتوى - صحيفة سبق الإلكترونية
  `.trim();

  return { html, text };
}

/**
 * Generate WhatsApp message for article published alert
 */
function generateWhatsAppMessage(article: ArticlePublishData): string {
  const frontendUrl = getFrontendUrl();
  const articleUrl = getArticleUrl(frontendUrl, article);
  const publishTime = article.publishedAt ? formatArabicDateTime(article.publishedAt) : formatArabicDateTime(new Date());

  return `📢 *نشرنا للتو:*

「 *${article.title}* 」

👤 ${article.authorName}
${article.categoryName ? `🗂️ ${article.categoryName}\n` : ""}🕐 ${publishTime}

▶️ ${articleUrl}

_صحيفة سبق الإلكترونية_`;
}

/**
 * Send editor alerts for a published article
 * This is the main function to call when an article is published
 */
export async function sendEditorPublishAlert(article: ArticlePublishData): Promise<{
  emailSent: boolean;
  whatsappSent: boolean;
  whatsappSentCount: number;
  errors: string[];
}> {
  const result = {
    emailSent: false,
    whatsappSent: false,
    whatsappSentCount: 0,
    errors: [] as string[],
  };

  try {
    const settings = await getEditorAlertSettings();

    if (!settings.enabled) {
      log.info("[EditorAlerts] Alerts are disabled");
      return result;
    }

    log.info(`[EditorAlerts] 📢 Sending publish alert for article: ${article.title}`);

    // Send email alert
    if (settings.emailEnabled && settings.email) {
      try {
        const { html, text } = generateEmailTemplate(article);
        const emailResult = await sendEmailNotification({
          to: settings.email,
          subject: `🔔 تم نشر خبر جديد: ${article.title.substring(0, 50)}...`,
          html,
          text,
        });

        if (emailResult.success) {
          result.emailSent = true;
          log.info(`[EditorAlerts] ✅ Email sent to ${settings.email}`);
        } else {
          result.errors.push(`Email failed: ${emailResult.error}`);
          console.error(`[EditorAlerts] ❌ Email failed:`, emailResult.error);
        }
      } catch (emailError) {
        const errorMsg = emailError instanceof Error ? emailError.message : "Unknown email error";
        result.errors.push(`Email error: ${errorMsg}`);
        console.error(`[EditorAlerts] ❌ Email error:`, emailError);
      }
    }

    // Send WhatsApp alerts to multiple numbers
    const whatsappNumbers = settings.whatsappNumbers || 
      (settings.whatsappNumber ? [settings.whatsappNumber] : []);
    
    if (settings.whatsappEnabled && whatsappNumbers.length > 0) {
      const whatsappMessage = generateWhatsAppMessage(article);
      
      for (const phoneNumber of whatsappNumbers) {
        try {
          const whatsappResult = await sendWhatsAppMessage({
            to: phoneNumber,
            body: whatsappMessage,
          });

          if (whatsappResult) {
            result.whatsappSentCount++;
            result.whatsappSent = true;
            log.info(`[EditorAlerts] ✅ WhatsApp sent to ${phoneNumber.substring(0, 8)}...`);
          } else {
            result.errors.push(`WhatsApp failed for ${phoneNumber.substring(0, 8)}...`);
            console.error(`[EditorAlerts] ❌ WhatsApp failed for ${phoneNumber.substring(0, 8)}...`);
          }
        } catch (whatsappError) {
          const errorMsg = whatsappError instanceof Error ? whatsappError.message : "Unknown WhatsApp error";
          result.errors.push(`WhatsApp error for ${phoneNumber.substring(0, 8)}...: ${errorMsg}`);
          console.error(`[EditorAlerts] ❌ WhatsApp error for ${phoneNumber.substring(0, 8)}...:`, whatsappError);
        }
      }
    }

    log.info(`[EditorAlerts] 📊 Result: Email=${result.emailSent}, WhatsApp=${result.whatsappSentCount}/${whatsappNumbers.length}`);
    return result;
  } catch (error) {
    console.error("[EditorAlerts] ❌ Unexpected error:", error);
    result.errors.push(error instanceof Error ? error.message : "Unexpected error");
    return result;
  }
}

/**
 * Update editor alert settings
 */
export async function updateEditorAlertSettings(settings: Partial<EditorAlertSettings>): Promise<EditorAlertSettings> {
  try {
    const currentSettings = await getEditorAlertSettings();
    
    // Normalize WhatsApp numbers: if whatsappNumbers array is provided, use it and clear legacy field
    let normalizedSettings = { ...settings };
    if (normalizedSettings.whatsappNumbers !== undefined) {
      // Remove duplicates and empty values
      const filtered = normalizedSettings.whatsappNumbers.filter(n => n && n.trim());
      normalizedSettings.whatsappNumbers = Array.from(new Set(filtered));
      // Clear legacy single number field when using array
      normalizedSettings.whatsappNumber = undefined;
    }
    
    const newSettings: EditorAlertSettings = {
      ...currentSettings,
      ...normalizedSettings,
    };
    
    // Ensure we don't have both whatsappNumber and whatsappNumbers
    if (newSettings.whatsappNumbers && newSettings.whatsappNumbers.length > 0) {
      delete (newSettings as any).whatsappNumber;
    }

    // Upsert to database
    await db
      .insert(systemSettings)
      .values({
        key: "editor_alerts",
        value: newSettings as any,
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: newSettings as any,
          updatedAt: new Date(),
        },
      });

    log.info("[EditorAlerts] ✅ Settings updated:", newSettings);
    return newSettings;
  } catch (error) {
    console.error("[EditorAlerts] ❌ Error updating settings:", error);
    throw error;
  }
}

/**
 * Get current editor alert settings (for admin UI)
 */
export async function getEditorAlertSettingsPublic(): Promise<EditorAlertSettings> {
  return getEditorAlertSettings();
}

/**
 * Reporter Article Published Email
 * Sends an email notification to the reporter when their article is published
 */
interface ReporterEmailData {
  articleId: string;
  articleTitle: string;
  articleSlug: string;
  reporterEmail: string;
  reporterName: string;
  publishedAt?: Date;
}

/**
 * Generate HTML email template for reporter article published alert
 */
function generateReporterEmailTemplate(data: ReporterEmailData): { html: string; text: string } {
  const frontendUrl = getFrontendUrl();
  const articleUrl = `${frontendUrl}/article/${data.articleSlug}`;
  const publishTime = data.publishedAt ? formatArabicDateTime(data.publishedAt) : formatArabicDateTime(new Date());

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { 
      font-family: 'Tajawal', Arial, sans-serif; 
      background-color: #f0fdf4; 
      margin: 0; 
      padding: 20px; 
      direction: rtl; 
    }
    .container { 
      max-width: 600px; 
      margin: 0 auto; 
      background: #ffffff; 
      border-radius: 12px; 
      overflow: hidden; 
      box-shadow: 0 2px 8px rgba(0,0,0,0.06); 
      border: 1px solid #bbf7d0;
    }
    .header { 
      background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); 
      padding: 24px; 
      text-align: center; 
      border-bottom: 1px solid #86efac;
    }
    .header h1 { 
      color: #166534; 
      font-size: 18px; 
      margin: 0; 
      font-weight: 600; 
    }
    .success-badge {
      display: inline-block;
      background: #22c55e;
      color: white;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .content { 
      padding: 32px 24px; 
      text-align: right; 
      background: #ffffff;
    }
    .greeting {
      color: #166534;
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 16px;
    }
    .article-title { 
      color: #1e293b; 
      font-size: 20px; 
      font-weight: bold;
      line-height: 1.6; 
      margin: 0 0 20px 0;
      border-right: 4px solid #22c55e;
      padding-right: 12px;
      background: #f0fdf4;
      padding: 12px;
      padding-right: 16px;
      border-radius: 0 8px 8px 0;
    }
    .meta-section {
      background: #fafafa;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .meta-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      color: #475569;
      font-size: 14px;
    }
    .meta-row:last-child {
      margin-bottom: 0;
    }
    .button { 
      display: inline-block; 
      background: #22c55e; 
      color: white !important; 
      text-decoration: none; 
      padding: 14px 36px; 
      border-radius: 8px; 
      font-size: 16px; 
      font-weight: 600;
      margin-top: 8px;
    }
    .footer { 
      background: #f0fdf4; 
      padding: 16px 24px; 
      text-align: center; 
      color: #94a3b8; 
      font-size: 12px; 
      border-top: 1px solid #bbf7d0; 
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="success-badge">تم نشر خبرك بنجاح</div>
      <h1>صحيفة سبق الإلكترونية</h1>
    </div>
    
    <div class="content">
      <p class="greeting">مرحباً ${data.reporterName}،</p>
      
      <p style="color: #475569; margin-bottom: 20px;">
        نسعد بإبلاغك أنه تم نشر خبرك على صحيفة سبق الإلكترونية:
      </p>
      
      <h2 class="article-title">${data.articleTitle}</h2>
      
      <div class="meta-section">
        <div class="meta-row">
          <span>🕐 وقت النشر: ${publishTime}</span>
        </div>
      </div>
      
      <div style="text-align: center;">
        <a href="${articleUrl}" class="button" data-testid="view-article-button">
          📰 مشاهدة الخبر
        </a>
      </div>
      
      <p style="color: #64748b; font-size: 14px; margin-top: 24px; text-align: center;">
        شكراً لمساهمتك في إثراء المحتوى الإخباري
      </p>
    </div>
    
    <div class="footer">
      هذا إشعار تلقائي من نظام إدارة المحتوى<br>
      © ${new Date().getFullYear()} صحيفة سبق الإلكترونية
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
مرحباً ${data.reporterName}،

تم نشر خبرك بنجاح على صحيفة سبق الإلكترونية!

📰 العنوان: ${data.articleTitle}
🕐 وقت النشر: ${publishTime}

🔗 رابط الخبر:
${articleUrl}

شكراً لمساهمتك في إثراء المحتوى الإخباري.

---
صحيفة سبق الإلكترونية
  `.trim();

  return { html, text };
}

/**
 * Send email notification to reporter when their article is published
 */
export async function sendReporterPublishEmail(articleId: string): Promise<{
  sent: boolean;
  error?: string;
}> {
  try {
    // Get article with reporter info
    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        reporterId: articles.reporterId,
        publishedAt: articles.publishedAt,
      })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!article) {
      log.info(`[ReporterEmail] Article not found: ${articleId}`);
      return { sent: false, error: "Article not found" };
    }

    if (!article.reporterId) {
      log.info(`[ReporterEmail] No reporter assigned to article: ${articleId}`);
      return { sent: false, error: "No reporter assigned" };
    }

    // Get reporter info
    const [reporter] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        notifyOnPublish: users.notifyOnPublish,
      })
      .from(users)
      .where(eq(users.id, article.reporterId))
      .limit(1);

    if (!reporter) {
      log.info(`[ReporterEmail] Reporter not found: ${article.reporterId}`);
      return { sent: false, error: "Reporter not found" };
    }

    // Check if reporter has email notifications enabled
    if (reporter.notifyOnPublish === false) {
      log.info(`[ReporterEmail] Reporter ${reporter.email} has disabled publish notifications`);
      return { sent: false, error: "Reporter disabled notifications" };
    }

    if (!reporter.email) {
      log.info(`[ReporterEmail] Reporter has no email address`);
      return { sent: false, error: "No email address" };
    }

    const reporterName = [reporter.firstName, reporter.lastName].filter(Boolean).join(" ") || reporter.email.split("@")[0];

    log.info(`[ReporterEmail] 📧 Sending email to reporter: ${reporter.email}`);

    const { html, text } = generateReporterEmailTemplate({
      articleId: article.id,
      articleTitle: article.title,
      articleSlug: article.slug,
      reporterEmail: reporter.email,
      reporterName,
      publishedAt: article.publishedAt || undefined,
    });

    const result = await sendEmailNotification({
      to: reporter.email,
      subject: `✅ تم نشر خبرك: ${article.title.substring(0, 50)}...`,
      html,
      text,
    });

    if (result.success) {
      log.info(`[ReporterEmail] ✅ Email sent successfully to ${reporter.email}`);
      return { sent: true };
    } else {
      console.error(`[ReporterEmail] ❌ Failed to send email:`, result.error);
      return { sent: false, error: result.error };
    }
  } catch (error) {
    console.error("[ReporterEmail] ❌ Error:", error);
    return { sent: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Generate rejection email template for reporter
 */
function generateReporterRejectionEmailTemplate(data: {
  articleTitle: string;
  reporterName: string;
  rejectionReason?: string;
}): { html: string; text: string } {
  const reason = data.rejectionReason || "لم يستوفِ الخبر معايير النشر المطلوبة";
  
  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #dc2626, #b91c1c); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 32px; }
    .article-title { font-size: 18px; color: #1f2937; margin: 20px 0; padding: 16px; background: #fef2f2; border-radius: 8px; border-right: 4px solid #dc2626; }
    .reason-box { background: #fff7ed; border-radius: 8px; padding: 16px; margin: 20px 0; border-right: 4px solid #f97316; }
    .reason-box h3 { margin: 0 0 8px 0; color: #9a3412; font-size: 14px; }
    .reason-box p { margin: 0; color: #c2410c; font-size: 14px; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>❌ لم يتم نشر الخبر</h1>
    </div>
    
    <div class="content">
      <p style="font-size: 16px; color: #374151;">مرحباً <strong>${data.reporterName}</strong>،</p>
      
      <p style="color: #4b5563; line-height: 1.8;">
        نأسف لإبلاغك بأن الخبر الذي أرسلته لم يتم نشره على صحيفة سبق الإلكترونية.
      </p>
      
      <div class="article-title">
        <strong>📰 عنوان الخبر:</strong><br>
        ${data.articleTitle}
      </div>
      
      <div class="reason-box">
        <h3>📋 السبب:</h3>
        <p>${reason}</p>
      </div>
      
      <p style="color: #64748b; font-size: 14px; margin-top: 24px;">
        يمكنك مراجعة المحتوى وإعادة إرساله مع الأخذ بعين الاعتبار الملاحظات المذكورة.
      </p>
      
      <p style="color: #64748b; font-size: 14px; margin-top: 24px; text-align: center;">
        شكراً لتفهمك ومساهمتك
      </p>
    </div>
    
    <div class="footer">
      هذا إشعار تلقائي من نظام إدارة المحتوى<br>
      © ${new Date().getFullYear()} صحيفة سبق الإلكترونية
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
مرحباً ${data.reporterName}،

نأسف لإبلاغك بأن الخبر الذي أرسلته لم يتم نشره على صحيفة سبق الإلكترونية.

📰 العنوان: ${data.articleTitle}

📋 السبب: ${reason}

يمكنك مراجعة المحتوى وإعادة إرساله مع الأخذ بعين الاعتبار الملاحظات المذكورة.

شكراً لتفهمك ومساهمتك.

---
صحيفة سبق الإلكترونية
  `.trim();

  return { html, text };
}

/**
 * Send email notification to reporter when their article is rejected/archived
 */
export async function sendReporterRejectionEmail(articleId: string, rejectionReason?: string): Promise<{
  sent: boolean;
  error?: string;
}> {
  try {
    // Get article with reporter info
    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        reporterId: articles.reporterId,
      })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!article) {
      log.info(`[ReporterRejectionEmail] Article not found: ${articleId}`);
      return { sent: false, error: "Article not found" };
    }

    if (!article.reporterId) {
      log.info(`[ReporterRejectionEmail] No reporter assigned to article: ${articleId}`);
      return { sent: false, error: "No reporter assigned" };
    }

    // Get reporter info
    const [reporter] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        notifyOnPublish: users.notifyOnPublish,
      })
      .from(users)
      .where(eq(users.id, article.reporterId))
      .limit(1);

    if (!reporter) {
      log.info(`[ReporterRejectionEmail] Reporter not found: ${article.reporterId}`);
      return { sent: false, error: "Reporter not found" };
    }

    // Check if reporter has email notifications enabled
    if (reporter.notifyOnPublish === false) {
      log.info(`[ReporterRejectionEmail] Reporter ${reporter.email} has disabled notifications`);
      return { sent: false, error: "Reporter disabled notifications" };
    }

    if (!reporter.email) {
      log.info(`[ReporterRejectionEmail] Reporter has no email address`);
      return { sent: false, error: "No email address" };
    }

    const reporterName = [reporter.firstName, reporter.lastName].filter(Boolean).join(" ") || reporter.email.split("@")[0];

    log.info(`[ReporterRejectionEmail] 📧 Sending rejection email to reporter: ${reporter.email}`);

    const { html, text } = generateReporterRejectionEmailTemplate({
      articleTitle: article.title,
      reporterName,
      rejectionReason,
    });

    const result = await sendEmailNotification({
      to: reporter.email,
      subject: `❌ لم يتم نشر خبرك: ${article.title.substring(0, 50)}...`,
      html,
      text,
    });

    if (result.success) {
      log.info(`[ReporterRejectionEmail] ✅ Rejection email sent successfully to ${reporter.email}`);
      return { sent: true };
    } else {
      console.error(`[ReporterRejectionEmail] ❌ Failed to send rejection email:`, result.error);
      return { sent: false, error: result.error };
    }
  } catch (error) {
    console.error("[ReporterRejectionEmail] ❌ Error:", error);
    return { sent: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Reporter News Archive Email Template (خبر)
 * Neutral, professional tone — used when an article is moved to the archive,
 * regardless of whether it was previously published or not.
 */
function generateReporterArchiveEmailTemplate(data: {
  articleTitle: string;
  reporterName: string;
  archiveReason?: string;
  articleUrl?: string;
  archivedAt?: Date;
}): { html: string; text: string } {
  const reason = data.archiveReason?.trim() || "لم يتم تحديد سبب";
  const archivedAt = data.archivedAt ? formatArabicDateTime(data.archivedAt) : formatArabicDateTime(new Date());
  const articleLinkBlock = data.articleUrl
    ? `
      <div style="text-align: center; margin: 28px 0;">
        <a href="${data.articleUrl}"
           style="display: inline-block; padding: 12px 28px; background: #1f2937; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
          📄 عرض الخبر المؤرشف
        </a>
      </div>`
    : "";

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #d97706, #b45309); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; }
    .content { padding: 32px; }
    .article-title { font-size: 18px; color: #1f2937; margin: 20px 0; padding: 16px; background: #fffbeb; border-radius: 8px; border-right: 4px solid #d97706; }
    .reason-box { background: #fff7ed; border-radius: 8px; padding: 16px; margin: 20px 0; border-right: 4px solid #f97316; }
    .reason-box h3 { margin: 0 0 8px 0; color: #9a3412; font-size: 14px; }
    .reason-box p { margin: 0; color: #c2410c; font-size: 14px; line-height: 1.7; }
    .meta { color: #6b7280; font-size: 13px; margin-top: 16px; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📦 تم نقل الخبر إلى الأرشيف</h1>
      <p>إشعار من فريق التحرير</p>
    </div>

    <div class="content">
      <p style="font-size: 16px; color: #374151;">مرحباً <strong>${data.reporterName}</strong>،</p>

      <p style="color: #4b5563; line-height: 1.8;">
        نودّ إعلامك بأنه تم نقل الخبر التالي إلى الأرشيف من قِبَل فريق التحرير.
        الخبر لم يُحذف، ويمكن للمحرّرين الرجوع إليه أو إعادة نشره لاحقاً عند الحاجة.
      </p>

      <div class="article-title">
        <strong>📰 عنوان الخبر:</strong><br>
        ${data.articleTitle}
      </div>

      <div class="reason-box">
        <h3>📋 سبب الأرشفة:</h3>
        <p>${reason}</p>
      </div>

      <div class="meta">
        🕒 وقت الأرشفة: ${archivedAt}
      </div>
${articleLinkBlock}

      <p style="color: #64748b; font-size: 14px; margin-top: 24px;">
        إن كانت لديك أي ملاحظات أو ترغب في إعادة معالجة الخبر، يُرجى التواصل مع رئيس التحرير.
      </p>

      <p style="color: #64748b; font-size: 14px; margin-top: 24px; text-align: center;">
        شكراً لتعاونك ومساهمتك في تغطية الأخبار
      </p>
    </div>

    <div class="footer">
      هذا إشعار تلقائي من نظام إدارة المحتوى<br>
      © ${new Date().getFullYear()} صحيفة سبق الإلكترونية
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
مرحباً ${data.reporterName}،

تم نقل الخبر التالي إلى الأرشيف من قِبَل فريق التحرير.
الخبر لم يُحذف ويمكن إعادة نشره لاحقاً عند الحاجة.

📰 عنوان الخبر: ${data.articleTitle}

📋 سبب الأرشفة: ${reason}

🕒 وقت الأرشفة: ${archivedAt}
${data.articleUrl ? `\n📄 رابط الخبر: ${data.articleUrl}\n` : ""}
إن كانت لديك أي ملاحظات يُرجى التواصل مع رئيس التحرير.

---
صحيفة سبق الإلكترونية
  `.trim();

  return { html, text };
}

/**
 * Reporter News PERMANENT-DELETE Email Template (خبر)
 * Apologetic, final tone — sent when an article is permanently removed
 * from the database. There is no recovery path, so the copy emphasises
 * permanence and gives the editorial reason.
 *
 * No article link is rendered: the row is gone by the time this fires.
 */
function generateReporterDeletionEmailTemplate(data: {
  articleTitle: string;
  reporterName: string;
  deletionReason?: string;
  deletedAt?: Date;
}): { html: string; text: string } {
  const reason = data.deletionReason?.trim() || "لم يتم تحديد سبب";
  const deletedAt = data.deletedAt ? formatArabicDateTime(data.deletedAt) : formatArabicDateTime(new Date());

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #dc2626, #991b1b); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; }
    .content { padding: 32px; }
    .article-title { font-size: 18px; color: #1f2937; margin: 20px 0; padding: 16px; background: #fef2f2; border-radius: 8px; border-right: 4px solid #dc2626; }
    .reason-box { background: #fff7ed; border-radius: 8px; padding: 16px; margin: 20px 0; border-right: 4px solid #f97316; }
    .reason-box h3 { margin: 0 0 8px 0; color: #9a3412; font-size: 14px; }
    .reason-box p { margin: 0; color: #c2410c; font-size: 14px; line-height: 1.7; }
    .warning { background: #fef2f2; border-radius: 8px; padding: 14px 16px; margin: 20px 0; border-right: 4px solid #dc2626; color: #991b1b; font-size: 13px; line-height: 1.7; }
    .meta { color: #6b7280; font-size: 13px; margin-top: 16px; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>❌ تم حذف الخبر نهائياً</h1>
      <p>إشعار من فريق التحرير</p>
    </div>

    <div class="content">
      <p style="font-size: 16px; color: #374151;">مرحباً <strong>${data.reporterName}</strong>،</p>

      <p style="color: #4b5563; line-height: 1.8;">
        نُؤسفنا إبلاغك بأنه تم حذف الخبر التالي نهائياً من قِبَل فريق التحرير.
      </p>

      <div class="article-title">
        <strong>📰 عنوان الخبر:</strong><br>
        ${data.articleTitle}
      </div>

      <div class="reason-box">
        <h3>📋 سبب الحذف:</h3>
        <p>${reason}</p>
      </div>

      <div class="warning">
        ⚠️ <strong>تنبيه:</strong> هذا الإجراء نهائي ولا يمكن التراجع عنه.
        لم يعد المحتوى متاحاً في النظام أو على المنصة.
      </div>

      <div class="meta">
        🕒 وقت الحذف: ${deletedAt}
      </div>

      <p style="color: #64748b; font-size: 14px; margin-top: 24px;">
        إن كانت لديك أي استفسارات أو ترغب بمناقشة هذا الإجراء، يُرجى التواصل مع رئيس التحرير.
      </p>

      <p style="color: #64748b; font-size: 14px; margin-top: 24px; text-align: center;">
        نشكر لك تفهمك وتعاونك
      </p>
    </div>

    <div class="footer">
      هذا إشعار تلقائي من نظام إدارة المحتوى<br>
      © ${new Date().getFullYear()} صحيفة سبق الإلكترونية
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
مرحباً ${data.reporterName}،

نُؤسفنا إبلاغك بأنه تم حذف الخبر التالي نهائياً من قِبَل فريق التحرير.

📰 عنوان الخبر: ${data.articleTitle}

📋 سبب الحذف: ${reason}

⚠️ تنبيه: هذا الإجراء نهائي ولا يمكن التراجع عنه. لم يعد المحتوى متاحاً.

🕒 وقت الحذف: ${deletedAt}

إن كانت لديك أي استفسارات يُرجى التواصل مع رئيس التحرير.

---
صحيفة سبق الإلكترونية
  `.trim();

  return { html, text };
}

/**
 * Send permanent-deletion email to news reporter (خبر only).
 *
 * Takes a pre-fetched article snapshot (not just id) because the
 * row no longer exists in the DB by the time this is called.
 * Caller MUST capture article fields BEFORE running `db.delete(...)`.
 */
export async function sendReporterDeletionEmail(
  article: {
    id: string;
    title: string;
    reporterId: string | null;
  },
  deletionReason?: string,
): Promise<{ sent: boolean; error?: string }> {
  try {
    if (!article.reporterId) {
      log.info(`[ReporterDeletionEmail] No reporter assigned to article: ${article.id}`);
      return { sent: false, error: "No reporter assigned" };
    }

    const [reporter] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        notifyOnPublish: users.notifyOnPublish,
      })
      .from(users)
      .where(eq(users.id, article.reporterId))
      .limit(1);

    if (!reporter) {
      log.info(`[ReporterDeletionEmail] Reporter not found: ${article.reporterId}`);
      return { sent: false, error: "Reporter not found" };
    }

    if (reporter.notifyOnPublish === false) {
      log.info(`[ReporterDeletionEmail] Reporter ${reporter.email} has disabled notifications`);
      return { sent: false, error: "Reporter disabled notifications" };
    }

    if (!reporter.email) {
      log.info(`[ReporterDeletionEmail] Reporter has no email address`);
      return { sent: false, error: "No email address" };
    }

    const reporterName =
      [reporter.firstName, reporter.lastName].filter(Boolean).join(" ") ||
      reporter.email.split("@")[0];

    log.info(`[ReporterDeletionEmail] 📧 Sending deletion email to reporter: ${reporter.email}`);

    const { html, text } = generateReporterDeletionEmailTemplate({
      articleTitle: article.title,
      reporterName,
      deletionReason,
      deletedAt: new Date(),
    });

    const result = await sendEmailNotification({
      to: reporter.email,
      subject: `❌ تم حذف خبرك نهائياً: ${article.title.substring(0, 50)}${article.title.length > 50 ? "..." : ""}`,
      html,
      text,
    });

    if (result.success) {
      log.info(`[ReporterDeletionEmail] ✅ Deletion email sent successfully to ${reporter.email}`);
      return { sent: true };
    } else {
      console.error(`[ReporterDeletionEmail] ❌ Failed to send deletion email:`, result.error);
      return { sent: false, error: result.error };
    }
  } catch (error) {
    console.error("[ReporterDeletionEmail] ❌ Error:", error);
    return { sent: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Send archive email to news reporter (خبر only)
 */
export async function sendReporterArchiveEmail(
  articleId: string,
  archiveReason?: string,
): Promise<{ sent: boolean; error?: string }> {
  try {
    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        englishSlug: articles.englishSlug,
        reporterId: articles.reporterId,
      })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!article) {
      log.info(`[ReporterArchiveEmail] Article not found: ${articleId}`);
      return { sent: false, error: "Article not found" };
    }

    if (!article.reporterId) {
      log.info(`[ReporterArchiveEmail] No reporter assigned to article: ${articleId}`);
      return { sent: false, error: "No reporter assigned" };
    }

    const [reporter] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        notifyOnPublish: users.notifyOnPublish,
      })
      .from(users)
      .where(eq(users.id, article.reporterId))
      .limit(1);

    if (!reporter) {
      log.info(`[ReporterArchiveEmail] Reporter not found: ${article.reporterId}`);
      return { sent: false, error: "Reporter not found" };
    }

    if (reporter.notifyOnPublish === false) {
      log.info(`[ReporterArchiveEmail] Reporter ${reporter.email} has disabled notifications`);
      return { sent: false, error: "Reporter disabled notifications" };
    }

    if (!reporter.email) {
      log.info(`[ReporterArchiveEmail] Reporter has no email address`);
      return { sent: false, error: "No email address" };
    }

    const reporterName =
      [reporter.firstName, reporter.lastName].filter(Boolean).join(" ") ||
      reporter.email.split("@")[0];

    const frontendUrl = getFrontendUrl();
    const slug = article.englishSlug || article.slug;
    const articleUrl = slug ? `${frontendUrl}/article/${slug}` : undefined;

    log.info(`[ReporterArchiveEmail] 📧 Sending archive email to reporter: ${reporter.email}`);

    const { html, text } = generateReporterArchiveEmailTemplate({
      articleTitle: article.title,
      reporterName,
      archiveReason,
      articleUrl,
      archivedAt: new Date(),
    });

    const result = await sendEmailNotification({
      to: reporter.email,
      subject: `📦 تم أرشفة خبرك: ${article.title.substring(0, 50)}${article.title.length > 50 ? "..." : ""}`,
      html,
      text,
    });

    if (result.success) {
      log.info(`[ReporterArchiveEmail] ✅ Archive email sent successfully to ${reporter.email}`);
      return { sent: true };
    } else {
      console.error(`[ReporterArchiveEmail] ❌ Failed to send archive email:`, result.error);
      return { sent: false, error: result.error };
    }
  } catch (error) {
    console.error("[ReporterArchiveEmail] ❌ Error:", error);
    return { sent: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Opinion Author Article Published Email Template
 * Uses the same design as reporter publish email
 */
interface OpinionAuthorEmailData {
  articleTitle: string;
  articleSlug: string;
  authorName: string;
  publishedAt?: Date;
}

function generateOpinionAuthorPublishEmailTemplate(data: OpinionAuthorEmailData): { html: string; text: string } {
  const frontendUrl = getFrontendUrl();
  const articleUrl = `${frontendUrl}/article/${data.articleSlug}`;
  const publishTime = data.publishedAt ? formatArabicDateTime(data.publishedAt) : formatArabicDateTime(new Date());

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { 
      font-family: 'Tajawal', Arial, sans-serif; 
      background-color: #f0fdf4; 
      margin: 0; 
      padding: 20px; 
      direction: rtl; 
    }
    .container { 
      max-width: 600px; 
      margin: 0 auto; 
      background: #ffffff; 
      border-radius: 12px; 
      overflow: hidden; 
      box-shadow: 0 2px 8px rgba(0,0,0,0.06); 
      border: 1px solid #bbf7d0;
    }
    .header { 
      background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); 
      padding: 24px; 
      text-align: center; 
      border-bottom: 1px solid #86efac;
    }
    .header h1 { 
      color: #166534; 
      font-size: 18px; 
      margin: 0; 
      font-weight: 600; 
    }
    .success-badge {
      display: inline-block;
      background: #22c55e;
      color: white;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .content { 
      padding: 32px 24px; 
      text-align: right; 
      background: #ffffff;
    }
    .greeting {
      color: #166534;
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 16px;
    }
    .article-title { 
      color: #1e293b; 
      font-size: 20px; 
      font-weight: bold;
      line-height: 1.6; 
      margin: 0 0 20px 0;
      border-right: 4px solid #22c55e;
      padding-right: 12px;
      background: #f0fdf4;
      padding: 12px;
      padding-right: 16px;
      border-radius: 0 8px 8px 0;
    }
    .meta-section {
      background: #fafafa;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .meta-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      color: #475569;
      font-size: 14px;
    }
    .meta-row:last-child {
      margin-bottom: 0;
    }
    .button { 
      display: inline-block; 
      background: #22c55e; 
      color: white !important; 
      text-decoration: none; 
      padding: 14px 36px; 
      border-radius: 8px; 
      font-size: 16px; 
      font-weight: 600;
      margin-top: 8px;
    }
    .footer { 
      background: #f0fdf4; 
      padding: 16px 24px; 
      text-align: center; 
      color: #94a3b8; 
      font-size: 12px; 
      border-top: 1px solid #bbf7d0; 
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="success-badge">تم نشر مقالك بنجاح</div>
      <h1>صحيفة سبق الإلكترونية</h1>
    </div>
    
    <div class="content">
      <p class="greeting">مرحباً ${data.authorName}،</p>
      
      <p style="color: #475569; margin-bottom: 20px;">
        نسعد بإبلاغك أنه تم نشر مقالك على صحيفة سبق الإلكترونية:
      </p>
      
      <h2 class="article-title">${data.articleTitle}</h2>
      
      <div class="meta-section">
        <div class="meta-row">
          <span>🕐 وقت النشر: ${publishTime}</span>
        </div>
      </div>
      
      <div style="text-align: center;">
        <a href="${articleUrl}" class="button" data-testid="view-article-button">
          📰 مشاهدة المقال
        </a>
      </div>
      
      <p style="color: #64748b; font-size: 14px; margin-top: 24px; text-align: center;">
        شكراً لمساهمتك في إثراء المحتوى
      </p>
    </div>
    
    <div class="footer">
      هذا إشعار تلقائي من نظام إدارة المحتوى<br>
      © ${new Date().getFullYear()} صحيفة سبق الإلكترونية
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
مرحباً ${data.authorName}،

تم نشر مقالك بنجاح على صحيفة سبق الإلكترونية!

📰 العنوان: ${data.articleTitle}
🕐 وقت النشر: ${publishTime}

🔗 رابط المقال:
${articleUrl}

شكراً لمساهمتك في إثراء المحتوى.

---
صحيفة سبق الإلكترونية
  `.trim();

  return { html, text };
}

/**
 * Opinion Author Article Rejection Email Template
 * Uses the same design as reporter rejection email
 */
function generateOpinionAuthorRejectionEmailTemplate(data: {
  articleTitle: string;
  authorName: string;
  rejectionReason?: string;
}): { html: string; text: string } {
  const reason = data.rejectionReason || "لم يستوفِ المقال معايير النشر المطلوبة";
  
  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #dc2626, #b91c1c); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 32px; }
    .article-title { font-size: 18px; color: #1f2937; margin: 20px 0; padding: 16px; background: #fef2f2; border-radius: 8px; border-right: 4px solid #dc2626; }
    .reason-box { background: #fff7ed; border-radius: 8px; padding: 16px; margin: 20px 0; border-right: 4px solid #f97316; }
    .reason-box h3 { margin: 0 0 8px 0; color: #9a3412; font-size: 14px; }
    .reason-box p { margin: 0; color: #c2410c; font-size: 14px; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>❌ لم يتم نشر المقال</h1>
    </div>
    
    <div class="content">
      <p style="font-size: 16px; color: #374151;">مرحباً <strong>${data.authorName}</strong>،</p>
      
      <p style="color: #4b5563; line-height: 1.8;">
        نأسف لإبلاغك بأن المقال الذي أرسلته لم يتم نشره على صحيفة سبق الإلكترونية.
      </p>
      
      <div class="article-title">
        <strong>📰 عنوان المقال:</strong><br>
        ${data.articleTitle}
      </div>
      
      <div class="reason-box">
        <h3>📋 السبب:</h3>
        <p>${reason}</p>
      </div>
      
      <p style="color: #64748b; font-size: 14px; margin-top: 24px;">
        يمكنك مراجعة المحتوى وإعادة إرساله مع الأخذ بعين الاعتبار الملاحظات المذكورة.
      </p>
      
      <p style="color: #64748b; font-size: 14px; margin-top: 24px; text-align: center;">
        شكراً لتفهمك ومساهمتك
      </p>
    </div>
    
    <div class="footer">
      هذا إشعار تلقائي من نظام إدارة المحتوى<br>
      © ${new Date().getFullYear()} صحيفة سبق الإلكترونية
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
مرحباً ${data.authorName}،

نأسف لإبلاغك بأن المقال الذي أرسلته لم يتم نشره على صحيفة سبق الإلكترونية.

📰 العنوان: ${data.articleTitle}

📋 السبب: ${reason}

يمكنك مراجعة المحتوى وإعادة إرساله مع الأخذ بعين الاعتبار الملاحظات المذكورة.

شكراً لتفهمك ومساهمتك.

---
صحيفة سبق الإلكترونية
  `.trim();

  return { html, text };
}

/**
 * Send email notification to opinion author when their article is published
 */
export async function sendOpinionAuthorPublishEmail(articleId: string): Promise<{
  sent: boolean;
  error?: string;
}> {
  try {
    // Get article with author info - must be opinion type
    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        authorId: articles.authorId,
        articleType: articles.articleType,
        publishedAt: articles.publishedAt,
      })
      .from(articles)
      .where(
        and(
          eq(articles.id, articleId),
          eq(articles.articleType, "opinion")
        )
      )
      .limit(1);

    if (!article) {
      log.info(`[OpinionAuthorEmail] Article not found or not an opinion article: ${articleId}`);
      return { sent: false, error: "Opinion article not found" };
    }

    if (!article.authorId) {
      log.info(`[OpinionAuthorEmail] No author assigned to article: ${articleId}`);
      return { sent: false, error: "No author assigned" };
    }

    // Get author info
    const [author] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        notifyOnPublish: users.notifyOnPublish,
      })
      .from(users)
      .where(eq(users.id, article.authorId))
      .limit(1);

    if (!author) {
      log.info(`[OpinionAuthorEmail] Author not found: ${article.authorId}`);
      return { sent: false, error: "Author not found" };
    }

    // Check if author has email notifications enabled
    if (author.notifyOnPublish === false) {
      log.info(`[OpinionAuthorEmail] Author ${author.email} has disabled publish notifications`);
      return { sent: false, error: "Author disabled notifications" };
    }

    if (!author.email) {
      log.info(`[OpinionAuthorEmail] Author has no email address`);
      return { sent: false, error: "No email address" };
    }

    const authorName = [author.firstName, author.lastName].filter(Boolean).join(" ") || author.email.split("@")[0];

    log.info(`[OpinionAuthorEmail] 📧 Sending email to opinion author: ${author.email}`);

    const { html, text } = generateOpinionAuthorPublishEmailTemplate({
      articleTitle: article.title,
      articleSlug: article.slug,
      authorName,
      publishedAt: article.publishedAt || undefined,
    });

    const result = await sendEmailNotification({
      to: author.email,
      subject: `✅ تم نشر مقالك: ${article.title.substring(0, 50)}...`,
      html,
      text,
    });

    if (result.success) {
      log.info(`[OpinionAuthorEmail] ✅ Email sent successfully to ${author.email}`);
      return { sent: true };
    } else {
      console.error(`[OpinionAuthorEmail] ❌ Failed to send email:`, result.error);
      return { sent: false, error: result.error };
    }
  } catch (error) {
    console.error("[OpinionAuthorEmail] ❌ Error:", error);
    return { sent: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Send email notification to opinion author when their article is rejected
 */
export async function sendOpinionAuthorRejectionEmail(articleId: string, rejectionReason?: string): Promise<{
  sent: boolean;
  error?: string;
}> {
  try {
    // Get article with author info - must be opinion type
    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        authorId: articles.authorId,
        articleType: articles.articleType,
      })
      .from(articles)
      .where(
        and(
          eq(articles.id, articleId),
          eq(articles.articleType, "opinion")
        )
      )
      .limit(1);

    if (!article) {
      log.info(`[OpinionAuthorRejectionEmail] Article not found or not an opinion article: ${articleId}`);
      return { sent: false, error: "Opinion article not found" };
    }

    if (!article.authorId) {
      log.info(`[OpinionAuthorRejectionEmail] No author assigned to article: ${articleId}`);
      return { sent: false, error: "No author assigned" };
    }

    // Get author info
    const [author] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        notifyOnPublish: users.notifyOnPublish,
      })
      .from(users)
      .where(eq(users.id, article.authorId))
      .limit(1);

    if (!author) {
      log.info(`[OpinionAuthorRejectionEmail] Author not found: ${article.authorId}`);
      return { sent: false, error: "Author not found" };
    }

    // Check if author has email notifications enabled
    if (author.notifyOnPublish === false) {
      log.info(`[OpinionAuthorRejectionEmail] Author ${author.email} has disabled notifications`);
      return { sent: false, error: "Author disabled notifications" };
    }

    if (!author.email) {
      log.info(`[OpinionAuthorRejectionEmail] Author has no email address`);
      return { sent: false, error: "No email address" };
    }

    const authorName = [author.firstName, author.lastName].filter(Boolean).join(" ") || author.email.split("@")[0];

    log.info(`[OpinionAuthorRejectionEmail] 📧 Sending rejection email to opinion author: ${author.email}`);

    const { html, text } = generateOpinionAuthorRejectionEmailTemplate({
      articleTitle: article.title,
      authorName,
      rejectionReason,
    });

    const result = await sendEmailNotification({
      to: author.email,
      subject: `❌ لم يتم نشر مقالك: ${article.title.substring(0, 50)}...`,
      html,
      text,
    });

    if (result.success) {
      log.info(`[OpinionAuthorRejectionEmail] ✅ Rejection email sent successfully to ${author.email}`);
      return { sent: true };
    } else {
      console.error(`[OpinionAuthorRejectionEmail] ❌ Failed to send rejection email:`, result.error);
      return { sent: false, error: result.error };
    }
  } catch (error) {
    console.error("[OpinionAuthorRejectionEmail] ❌ Error:", error);
    return { sent: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Opinion Author Article Archive Email Template (مقال)
 * Respectful, professional tone aimed at columnists/opinion writers
 * (separate from the news/reporter version because columnists expect a different register).
 */
function generateOpinionAuthorArchiveEmailTemplate(data: {
  articleTitle: string;
  authorName: string;
  archiveReason?: string;
  articleUrl?: string;
  archivedAt?: Date;
}): { html: string; text: string } {
  const reason = data.archiveReason?.trim() || "لم يتم تحديد سبب";
  const archivedAt = data.archivedAt ? formatArabicDateTime(data.archivedAt) : formatArabicDateTime(new Date());
  const articleLinkBlock = data.articleUrl
    ? `
      <div style="text-align: center; margin: 28px 0;">
        <a href="${data.articleUrl}"
           style="display: inline-block; padding: 12px 28px; background: #1f2937; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
          ✍️ عرض المقال المؤرشف
        </a>
      </div>`
    : "";

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #7c3aed, #5b21b6); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; }
    .content { padding: 32px; }
    .article-title { font-size: 18px; color: #1f2937; margin: 20px 0; padding: 16px; background: #f5f3ff; border-radius: 8px; border-right: 4px solid #7c3aed; }
    .reason-box { background: #fff7ed; border-radius: 8px; padding: 16px; margin: 20px 0; border-right: 4px solid #f97316; }
    .reason-box h3 { margin: 0 0 8px 0; color: #9a3412; font-size: 14px; }
    .reason-box p { margin: 0; color: #c2410c; font-size: 14px; line-height: 1.7; }
    .meta { color: #6b7280; font-size: 13px; margin-top: 16px; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📦 تم نقل المقال إلى الأرشيف</h1>
      <p>إشعار من هيئة التحرير</p>
    </div>

    <div class="content">
      <p style="font-size: 16px; color: #374151;">الأستاذ/ة <strong>${data.authorName}</strong> المحترم/ة،</p>

      <p style="color: #4b5563; line-height: 1.8;">
        نُحيطكم علماً بأنه تم نقل المقال التالي إلى الأرشيف.
        المقال لا يزال محفوظاً في النظام، ويسعدنا تواصلكم مع هيئة التحرير
        في حال رغبتم بإعادة نشره أو إجراء أي تعديلات.
      </p>

      <div class="article-title">
        <strong>✍️ عنوان المقال:</strong><br>
        ${data.articleTitle}
      </div>

      <div class="reason-box">
        <h3>📋 سبب الأرشفة:</h3>
        <p>${reason}</p>
      </div>

      <div class="meta">
        🕒 وقت الأرشفة: ${archivedAt}
      </div>
${articleLinkBlock}

      <p style="color: #64748b; font-size: 14px; margin-top: 24px;">
        نشكر لكم قلمكم القيّم ومساهماتكم المستمرة على صفحات صحيفة سبق.
      </p>

      <p style="color: #64748b; font-size: 14px; margin-top: 24px; text-align: center;">
        مع خالص التقدير،<br>
        هيئة التحرير
      </p>
    </div>

    <div class="footer">
      هذا إشعار تلقائي من نظام إدارة المحتوى<br>
      © ${new Date().getFullYear()} صحيفة سبق الإلكترونية
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
الأستاذ/ة ${data.authorName} المحترم/ة،

نُحيطكم علماً بأنه تم نقل المقال التالي إلى الأرشيف.
المقال لا يزال محفوظاً في النظام، ويسعدنا تواصلكم مع هيئة التحرير
في حال رغبتم بإعادة نشره أو إجراء أي تعديلات.

✍️ عنوان المقال: ${data.articleTitle}

📋 سبب الأرشفة: ${reason}

🕒 وقت الأرشفة: ${archivedAt}
${data.articleUrl ? `\n✍️ رابط المقال: ${data.articleUrl}\n` : ""}
نشكر لكم قلمكم القيّم ومساهماتكم المستمرة على صفحات صحيفة سبق.

مع خالص التقدير،
هيئة التحرير

---
صحيفة سبق الإلكترونية
  `.trim();

  return { html, text };
}

/**
 * Opinion Author PERMANENT-DELETE Email Template (مقال)
 * Respectful, apologetic tone for columnists/opinion writers.
 * Like the news version, conveys finality and gives the reason.
 *
 * No article link is rendered: the row is gone by the time this fires.
 */
function generateOpinionAuthorDeletionEmailTemplate(data: {
  articleTitle: string;
  authorName: string;
  deletionReason?: string;
  deletedAt?: Date;
}): { html: string; text: string } {
  const reason = data.deletionReason?.trim() || "لم يتم تحديد سبب";
  const deletedAt = data.deletedAt ? formatArabicDateTime(data.deletedAt) : formatArabicDateTime(new Date());

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #dc2626, #991b1b); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; }
    .content { padding: 32px; }
    .article-title { font-size: 18px; color: #1f2937; margin: 20px 0; padding: 16px; background: #f5f3ff; border-radius: 8px; border-right: 4px solid #7c3aed; }
    .reason-box { background: #fff7ed; border-radius: 8px; padding: 16px; margin: 20px 0; border-right: 4px solid #f97316; }
    .reason-box h3 { margin: 0 0 8px 0; color: #9a3412; font-size: 14px; }
    .reason-box p { margin: 0; color: #c2410c; font-size: 14px; line-height: 1.7; }
    .warning { background: #fef2f2; border-radius: 8px; padding: 14px 16px; margin: 20px 0; border-right: 4px solid #dc2626; color: #991b1b; font-size: 13px; line-height: 1.7; }
    .meta { color: #6b7280; font-size: 13px; margin-top: 16px; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>❌ تم حذف المقال نهائياً</h1>
      <p>إشعار من هيئة التحرير</p>
    </div>

    <div class="content">
      <p style="font-size: 16px; color: #374151;">الأستاذ/ة <strong>${data.authorName}</strong> المحترم/ة،</p>

      <p style="color: #4b5563; line-height: 1.8;">
        يؤسفنا إبلاغكم بأنه تم حذف المقال التالي نهائياً من قِبَل هيئة التحرير.
        نتفهّم أن هذا الإجراء قد لا يكون متوقعاً، ونعتذر عن أي إزعاج قد يسببه.
      </p>

      <div class="article-title">
        <strong>✍️ عنوان المقال:</strong><br>
        ${data.articleTitle}
      </div>

      <div class="reason-box">
        <h3>📋 سبب الحذف:</h3>
        <p>${reason}</p>
      </div>

      <div class="warning">
        ⚠️ <strong>تنبيه:</strong> هذا الإجراء نهائي ولا يمكن التراجع عنه.
        لم يعد المقال متاحاً في النظام أو على المنصة.
      </div>

      <div class="meta">
        🕒 وقت الحذف: ${deletedAt}
      </div>

      <p style="color: #64748b; font-size: 14px; margin-top: 24px;">
        يسعدنا تواصلكم مع هيئة التحرير لمناقشة هذا الإجراء أو لأي استفسار حوله.
        كما نرحب بأي مساهمات جديدة منكم على صفحات سبق.
      </p>

      <p style="color: #64748b; font-size: 14px; margin-top: 24px; text-align: center;">
        مع خالص التقدير،<br>
        هيئة التحرير
      </p>
    </div>

    <div class="footer">
      هذا إشعار تلقائي من نظام إدارة المحتوى<br>
      © ${new Date().getFullYear()} صحيفة سبق الإلكترونية
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
الأستاذ/ة ${data.authorName} المحترم/ة،

يؤسفنا إبلاغكم بأنه تم حذف المقال التالي نهائياً من قِبَل هيئة التحرير.
نتفهّم أن هذا الإجراء قد لا يكون متوقعاً، ونعتذر عن أي إزعاج قد يسببه.

✍️ عنوان المقال: ${data.articleTitle}

📋 سبب الحذف: ${reason}

⚠️ تنبيه: هذا الإجراء نهائي ولا يمكن التراجع عنه. لم يعد المقال متاحاً.

🕒 وقت الحذف: ${deletedAt}

يسعدنا تواصلكم مع هيئة التحرير لمناقشة هذا الإجراء.
كما نرحب بأي مساهمات جديدة منكم.

مع خالص التقدير،
هيئة التحرير

---
صحيفة سبق الإلكترونية
  `.trim();

  return { html, text };
}

/**
 * Send permanent-deletion email to opinion author (مقال only).
 *
 * Takes a pre-fetched article snapshot (not just id) because the
 * row no longer exists in the DB by the time this is called.
 * Caller MUST capture article fields BEFORE running `db.delete(...)`,
 * and MUST verify the article was an opinion article (articleType==='opinion').
 */
export async function sendOpinionAuthorDeletionEmail(
  article: {
    id: string;
    title: string;
    authorId: string | null;
  },
  deletionReason?: string,
): Promise<{ sent: boolean; error?: string }> {
  try {
    if (!article.authorId) {
      log.info(`[OpinionAuthorDeletionEmail] No author assigned to article: ${article.id}`);
      return { sent: false, error: "No author assigned" };
    }

    const [author] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        notifyOnPublish: users.notifyOnPublish,
      })
      .from(users)
      .where(eq(users.id, article.authorId))
      .limit(1);

    if (!author) {
      log.info(`[OpinionAuthorDeletionEmail] Author not found: ${article.authorId}`);
      return { sent: false, error: "Author not found" };
    }

    if (author.notifyOnPublish === false) {
      log.info(`[OpinionAuthorDeletionEmail] Author ${author.email} has disabled notifications`);
      return { sent: false, error: "Author disabled notifications" };
    }

    if (!author.email) {
      log.info(`[OpinionAuthorDeletionEmail] Author has no email address`);
      return { sent: false, error: "No email address" };
    }

    const authorName =
      [author.firstName, author.lastName].filter(Boolean).join(" ") ||
      author.email.split("@")[0];

    log.info(`[OpinionAuthorDeletionEmail] 📧 Sending deletion email to opinion author: ${author.email}`);

    const { html, text } = generateOpinionAuthorDeletionEmailTemplate({
      articleTitle: article.title,
      authorName,
      deletionReason,
      deletedAt: new Date(),
    });

    const result = await sendEmailNotification({
      to: author.email,
      subject: `❌ تم حذف مقالك نهائياً: ${article.title.substring(0, 50)}${article.title.length > 50 ? "..." : ""}`,
      html,
      text,
    });

    if (result.success) {
      log.info(`[OpinionAuthorDeletionEmail] ✅ Deletion email sent successfully to ${author.email}`);
      return { sent: true };
    } else {
      console.error(`[OpinionAuthorDeletionEmail] ❌ Failed to send deletion email:`, result.error);
      return { sent: false, error: result.error };
    }
  } catch (error) {
    console.error("[OpinionAuthorDeletionEmail] ❌ Error:", error);
    return { sent: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Send archive email to opinion article author (مقال only)
 */
export async function sendOpinionAuthorArchiveEmail(
  articleId: string,
  archiveReason?: string,
): Promise<{ sent: boolean; error?: string }> {
  try {
    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        englishSlug: articles.englishSlug,
        authorId: articles.authorId,
        articleType: articles.articleType,
      })
      .from(articles)
      .where(
        and(
          eq(articles.id, articleId),
          eq(articles.articleType, "opinion"),
        ),
      )
      .limit(1);

    if (!article) {
      log.info(`[OpinionAuthorArchiveEmail] Article not found or not an opinion article: ${articleId}`);
      return { sent: false, error: "Opinion article not found" };
    }

    if (!article.authorId) {
      log.info(`[OpinionAuthorArchiveEmail] No author assigned to article: ${articleId}`);
      return { sent: false, error: "No author assigned" };
    }

    const [author] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        notifyOnPublish: users.notifyOnPublish,
      })
      .from(users)
      .where(eq(users.id, article.authorId))
      .limit(1);

    if (!author) {
      log.info(`[OpinionAuthorArchiveEmail] Author not found: ${article.authorId}`);
      return { sent: false, error: "Author not found" };
    }

    if (author.notifyOnPublish === false) {
      log.info(`[OpinionAuthorArchiveEmail] Author ${author.email} has disabled notifications`);
      return { sent: false, error: "Author disabled notifications" };
    }

    if (!author.email) {
      log.info(`[OpinionAuthorArchiveEmail] Author has no email address`);
      return { sent: false, error: "No email address" };
    }

    const authorName =
      [author.firstName, author.lastName].filter(Boolean).join(" ") ||
      author.email.split("@")[0];

    const frontendUrl = getFrontendUrl();
    const slug = article.englishSlug || article.slug;
    const articleUrl = slug ? `${frontendUrl}/article/${slug}` : undefined;

    log.info(`[OpinionAuthorArchiveEmail] 📧 Sending archive email to opinion author: ${author.email}`);

    const { html, text } = generateOpinionAuthorArchiveEmailTemplate({
      articleTitle: article.title,
      authorName,
      archiveReason,
      articleUrl,
      archivedAt: new Date(),
    });

    const result = await sendEmailNotification({
      to: author.email,
      subject: `📦 تم أرشفة مقالك: ${article.title.substring(0, 50)}${article.title.length > 50 ? "..." : ""}`,
      html,
      text,
    });

    if (result.success) {
      log.info(`[OpinionAuthorArchiveEmail] ✅ Archive email sent successfully to ${author.email}`);
      return { sent: true };
    } else {
      console.error(`[OpinionAuthorArchiveEmail] ❌ Failed to send archive email:`, result.error);
      return { sent: false, error: result.error };
    }
  } catch (error) {
    console.error("[OpinionAuthorArchiveEmail] ❌ Error:", error);
    return { sent: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Generate schedule email template for reporter
 */
function generateReporterScheduleEmailTemplate(data: {
  articleTitle: string;
  reporterName: string;
  scheduledAt: Date;
  articleId: string;
}): { html: string; text: string } {
  const frontendUrl = process.env.FRONTEND_URL || "https://sabq.org";
  const editUrl = `${frontendUrl}/dashboard/articles/${data.articleId}/edit`;
  
  // Pin to Asia/Riyadh — the Railway server runs in UTC, so omitting the
  // timezone caused scheduled-publish emails to display "4:25 ص" for an
  // article actually scheduled at 7:25 AM Saudi time.
  const scheduledDateStr = data.scheduledAt.toLocaleDateString('ar-SA-u-ca-gregory', {
    timeZone: 'Asia/Riyadh',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const scheduledTimeStr = data.scheduledAt.toLocaleTimeString('ar-SA', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
  });
  
  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
    .schedule-badge { background: rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 20px; display: inline-block; margin-bottom: 12px; font-size: 14px; }
    .content { padding: 32px 24px; }
    .greeting { font-size: 18px; color: #1e293b; margin-bottom: 16px; }
    .article-title { font-size: 20px; color: #1e40af; margin: 16px 0; line-height: 1.6; font-weight: 600; }
    .schedule-info { background: #eff6ff; border-radius: 8px; padding: 20px; margin: 20px 0; border-right: 4px solid #3b82f6; }
    .schedule-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: #1e40af; font-size: 16px; }
    .schedule-row:last-child { margin-bottom: 0; }
    .button { display: inline-block; background: #3b82f6; color: white !important; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 16px; font-weight: 600; margin-top: 8px; }
    .footer { background: #eff6ff; padding: 16px 24px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #bfdbfe; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="schedule-badge">📅 تمت جدولة خبرك</div>
      <h1>صحيفة سبق الإلكترونية</h1>
    </div>
    
    <div class="content">
      <p class="greeting">مرحباً ${data.reporterName}،</p>
      
      <p style="color: #475569; margin-bottom: 20px;">
        نسعد بإبلاغك أنه تمت جدولة خبرك للنشر على صحيفة سبق الإلكترونية:
      </p>
      
      <h2 class="article-title">${data.articleTitle}</h2>
      
      <div class="schedule-info">
        <div class="schedule-row">
          <span>📅 تاريخ النشر: ${scheduledDateStr}</span>
        </div>
        <div class="schedule-row">
          <span>🕐 وقت النشر: ${scheduledTimeStr}</span>
        </div>
      </div>
      
      <p style="color: #64748b; font-size: 14px; margin-top: 24px; text-align: center;">
        سيتم نشر الخبر تلقائياً في الموعد المحدد
      </p>
    </div>
    
    <div class="footer">
      هذا إشعار تلقائي من نظام إدارة المحتوى<br>
      © ${new Date().getFullYear()} صحيفة سبق الإلكترونية
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
مرحباً ${data.reporterName}،

تمت جدولة خبرك للنشر على صحيفة سبق الإلكترونية!

📰 العنوان: ${data.articleTitle}
📅 تاريخ النشر: ${scheduledDateStr}
🕐 وقت النشر: ${scheduledTimeStr}

سيتم نشر الخبر تلقائياً في الموعد المحدد.

---
صحيفة سبق الإلكترونية
  `.trim();

  return { html, text };
}

/**
 * Send email notification to reporter when their article is scheduled
 */
export async function sendReporterScheduleEmail(articleId: string, scheduledAt: Date): Promise<{
  sent: boolean;
  error?: string;
}> {
  try {
    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        reporterId: articles.reporterId,
        authorId: articles.authorId,
        articleType: articles.articleType,
      })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!article) {
      log.info(`[ReporterScheduleEmail] Article not found: ${articleId}`);
      return { sent: false, error: "Article not found" };
    }

    if (article.articleType === 'opinion') {
      log.info(`[ReporterScheduleEmail] Skipping opinion article: ${articleId}`);
      return { sent: false, error: "Opinion article - use sendOpinionAuthorScheduleEmail" };
    }

    const reporterId = article.reporterId || article.authorId;
    if (!reporterId) {
      log.info(`[ReporterScheduleEmail] No reporter assigned to article: ${articleId}`);
      return { sent: false, error: "No reporter assigned" };
    }

    const [reporter] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        notifyOnPublish: users.notifyOnPublish,
      })
      .from(users)
      .where(eq(users.id, reporterId))
      .limit(1);

    if (!reporter) {
      log.info(`[ReporterScheduleEmail] Reporter not found: ${reporterId}`);
      return { sent: false, error: "Reporter not found" };
    }

    if (reporter.notifyOnPublish === false) {
      log.info(`[ReporterScheduleEmail] Reporter ${reporter.email} has disabled notifications`);
      return { sent: false, error: "Reporter disabled notifications" };
    }

    if (!reporter.email) {
      log.info(`[ReporterScheduleEmail] Reporter has no email address`);
      return { sent: false, error: "No email address" };
    }

    const reporterName = [reporter.firstName, reporter.lastName].filter(Boolean).join(" ") || reporter.email.split("@")[0];

    log.info(`[ReporterScheduleEmail] 📧 Sending schedule email to reporter: ${reporter.email}`);

    const { html, text } = generateReporterScheduleEmailTemplate({
      articleTitle: article.title,
      reporterName,
      scheduledAt,
      articleId: article.id,
    });

    const result = await sendEmailNotification({
      to: reporter.email,
      subject: `📅 تمت جدولة خبرك: ${article.title.substring(0, 50)}...`,
      html,
      text,
    });

    if (result.success) {
      log.info(`[ReporterScheduleEmail] ✅ Email sent successfully to ${reporter.email}`);
      return { sent: true };
    } else {
      console.error(`[ReporterScheduleEmail] ❌ Failed to send email:`, result.error);
      return { sent: false, error: result.error };
    }
  } catch (error) {
    console.error("[ReporterScheduleEmail] ❌ Error:", error);
    return { sent: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Generate schedule email template for opinion author
 */
function generateOpinionAuthorScheduleEmailTemplate(data: {
  articleTitle: string;
  authorName: string;
  scheduledAt: Date;
  articleId: string;
}): { html: string; text: string } {
  const frontendUrl = process.env.FRONTEND_URL || "https://sabq.org";
  const editUrl = `${frontendUrl}/dashboard/articles/${data.articleId}/edit`;
  
  // Pin to Asia/Riyadh — the Railway server runs in UTC, so omitting the
  // timezone caused scheduled-publish emails to display "4:25 ص" for an
  // article actually scheduled at 7:25 AM Saudi time.
  const scheduledDateStr = data.scheduledAt.toLocaleDateString('ar-SA-u-ca-gregory', {
    timeZone: 'Asia/Riyadh',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const scheduledTimeStr = data.scheduledAt.toLocaleTimeString('ar-SA', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
  });
  
  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #8b5cf6, #6d28d9); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
    .schedule-badge { background: rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 20px; display: inline-block; margin-bottom: 12px; font-size: 14px; }
    .content { padding: 32px 24px; }
    .greeting { font-size: 18px; color: #1e293b; margin-bottom: 16px; }
    .article-title { font-size: 20px; color: #6d28d9; margin: 16px 0; line-height: 1.6; font-weight: 600; }
    .schedule-info { background: #f5f3ff; border-radius: 8px; padding: 20px; margin: 20px 0; border-right: 4px solid #8b5cf6; }
    .schedule-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: #6d28d9; font-size: 16px; }
    .schedule-row:last-child { margin-bottom: 0; }
    .button { display: inline-block; background: #8b5cf6; color: white !important; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 16px; font-weight: 600; margin-top: 8px; }
    .footer { background: #f5f3ff; padding: 16px 24px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #ddd6fe; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="schedule-badge">📅 تمت جدولة مقالك</div>
      <h1>صحيفة سبق الإلكترونية</h1>
    </div>
    
    <div class="content">
      <p class="greeting">مرحباً ${data.authorName}،</p>
      
      <p style="color: #475569; margin-bottom: 20px;">
        نسعد بإبلاغك أنه تمت جدولة مقال الرأي الخاص بك للنشر على صحيفة سبق الإلكترونية:
      </p>
      
      <h2 class="article-title">${data.articleTitle}</h2>
      
      <div class="schedule-info">
        <div class="schedule-row">
          <span>📅 تاريخ النشر: ${scheduledDateStr}</span>
        </div>
        <div class="schedule-row">
          <span>🕐 وقت النشر: ${scheduledTimeStr}</span>
        </div>
      </div>
      
      <p style="color: #64748b; font-size: 14px; margin-top: 24px; text-align: center;">
        سيتم نشر المقال تلقائياً في الموعد المحدد
      </p>
    </div>
    
    <div class="footer">
      هذا إشعار تلقائي من نظام إدارة المحتوى<br>
      © ${new Date().getFullYear()} صحيفة سبق الإلكترونية
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
مرحباً ${data.authorName}،

تمت جدولة مقال الرأي الخاص بك للنشر على صحيفة سبق الإلكترونية!

📰 العنوان: ${data.articleTitle}
📅 تاريخ النشر: ${scheduledDateStr}
🕐 وقت النشر: ${scheduledTimeStr}

سيتم نشر المقال تلقائياً في الموعد المحدد.

---
صحيفة سبق الإلكترونية
  `.trim();

  return { html, text };
}

/**
 * Send email notification to opinion author when their article is scheduled
 */
export async function sendOpinionAuthorScheduleEmail(articleId: string, scheduledAt: Date): Promise<{
  sent: boolean;
  error?: string;
}> {
  try {
    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        authorId: articles.authorId,
        articleType: articles.articleType,
      })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!article) {
      log.info(`[OpinionAuthorScheduleEmail] Article not found: ${articleId}`);
      return { sent: false, error: "Article not found" };
    }

    if (article.articleType !== 'opinion') {
      log.info(`[OpinionAuthorScheduleEmail] Not an opinion article: ${articleId}`);
      return { sent: false, error: "Not an opinion article" };
    }

    if (!article.authorId) {
      log.info(`[OpinionAuthorScheduleEmail] No author assigned to article: ${articleId}`);
      return { sent: false, error: "No author assigned" };
    }

    const [author] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        notifyOnPublish: users.notifyOnPublish,
      })
      .from(users)
      .where(eq(users.id, article.authorId))
      .limit(1);

    if (!author) {
      log.info(`[OpinionAuthorScheduleEmail] Author not found: ${article.authorId}`);
      return { sent: false, error: "Author not found" };
    }

    if (author.notifyOnPublish === false) {
      log.info(`[OpinionAuthorScheduleEmail] Author ${author.email} has disabled notifications`);
      return { sent: false, error: "Author disabled notifications" };
    }

    if (!author.email) {
      log.info(`[OpinionAuthorScheduleEmail] Author has no email address`);
      return { sent: false, error: "No email address" };
    }

    const authorName = [author.firstName, author.lastName].filter(Boolean).join(" ") || author.email.split("@")[0];

    log.info(`[OpinionAuthorScheduleEmail] 📧 Sending schedule email to opinion author: ${author.email}`);

    const { html, text } = generateOpinionAuthorScheduleEmailTemplate({
      articleTitle: article.title,
      authorName,
      scheduledAt,
      articleId: article.id,
    });

    const result = await sendEmailNotification({
      to: author.email,
      subject: `📅 تمت جدولة مقالك: ${article.title.substring(0, 50)}...`,
      html,
      text,
    });

    if (result.success) {
      log.info(`[OpinionAuthorScheduleEmail] ✅ Email sent successfully to ${author.email}`);
      return { sent: true };
    } else {
      console.error(`[OpinionAuthorScheduleEmail] ❌ Failed to send email:`, result.error);
      return { sent: false, error: result.error };
    }
  } catch (error) {
    console.error("[OpinionAuthorScheduleEmail] ❌ Error:", error);
    return { sent: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
