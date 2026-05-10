import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import crypto from 'crypto';
import { db } from '../db';
import { emailVerificationTokens, users } from '@shared/schema';
import { eq } from 'drizzle-orm';

const MAILERSEND_API_KEY = process.env.MAILERSEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@sabq.sa';
const FROM_NAME = 'صحيفة سبق الإلكترونية';

// Get frontend URL from environment or detect from Replit domains
function getFrontendUrl(): string {
  // 1. Use explicit FRONTEND_URL if provided
  if (process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL;
  }
  
  // 2. Use REPLIT_DOMAINS if available (production)
  if (process.env.REPLIT_DOMAINS) {
    const domains = process.env.REPLIT_DOMAINS.split(',');
    const primaryDomain = domains[0]?.trim();
    if (primaryDomain) {
      return `https://${primaryDomain}`;
    }
  }
  
  // 3. Fallback to localhost for local development
  return 'http://localhost:5000';
}

const FRONTEND_URL = getFrontendUrl();

// Initialize MailerSend
let mailerSend: MailerSend | null = null;

if (!MAILERSEND_API_KEY) {
  console.warn('⚠️  MAILERSEND_API_KEY not set. Email functionality will be disabled.');
} else {
  mailerSend = new MailerSend({
    apiKey: MAILERSEND_API_KEY,
  });
  console.log('✅ MailerSend email service initialized');
  console.log(`🔗 Frontend URL for email links: ${FRONTEND_URL}`);
  console.log(`📧 Sending from: ${FROM_EMAIL}`);
}

/**
 * Generate a random verification token
 */
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Send a generic email notification
 */
export async function sendEmailNotification(options: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (!mailerSend || !MAILERSEND_API_KEY) {
      console.warn('Email not sent - MailerSend not configured');
      return { success: false, error: 'MailerSend API key not configured' };
    }

    const sentFrom = new Sender(FROM_EMAIL, FROM_NAME);
    const recipients = [new Recipient(options.to)];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject(options.subject)
      .setHtml(options.html || options.text || '')
      .setText(options.text || '');

    await mailerSend.email.send(emailParams);
    console.log(`✅ Email sent to ${options.to}: ${options.subject}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to send email' 
    };
  }
}

/**
 * Send email verification to user
 */
export async function sendVerificationEmail(userId: string, email: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!mailerSend || !MAILERSEND_API_KEY) {
      return { success: false, error: 'MailerSend API key not configured' };
    }

    // Generate token
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Token valid for 24 hours

    // Save token to database
    await db.insert(emailVerificationTokens).values({
      userId,
      token,
      expiresAt,
      used: false,
    });

    // Create verification link
    const verificationLink = `${FRONTEND_URL}/verify-email?token=${token}`;

    // Email content
    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
          .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%); padding: 40px 20px; text-align: center; }
          .header h1 { color: white; font-size: 28px; margin: 0; font-weight: bold; }
          .content { padding: 40px 30px; text-align: right; }
          .content h2 { color: #333; font-size: 22px; margin-bottom: 16px; }
          .content p { color: #666; font-size: 16px; line-height: 1.8; margin-bottom: 16px; }
          .button { display: inline-block; background: #0066cc; color: white !important; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 18px; font-weight: bold; margin: 20px 0; transition: background 0.3s; }
          .button:hover { background: #0052a3; }
          .footer { background: #f9f9f9; padding: 24px 30px; text-align: center; color: #999; font-size: 14px; border-top: 1px solid #eee; }
          .divider { border: 0; height: 1px; background: #eee; margin: 24px 0; }
          .en-section { direction: ltr; text-align: left; margin-top: 24px; padding-top: 24px; border-top: 2px solid #eee; }
          .en-section h2 { font-size: 20px; color: #333; margin-bottom: 12px; }
          .en-section p { color: #666; font-size: 15px; line-height: 1.6; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🧠 صحيفة سبق الإلكترونية</h1>
          </div>
          
          <div class="content">
            <h2>مرحباً بك في سبق!</h2>
            <p>شكراً لتسجيلك في صحيفة سبق الإلكترونية. لتفعيل حسابك والاستمتاع بجميع المزايا، يرجى تأكيد بريدك الإلكتروني.</p>
            
            <p style="text-align: center;">
              <a href="${verificationLink}" class="button" data-testid="verify-button">
                ✓ تفعيل الحساب
              </a>
            </p>
            
            <p style="color: #999; font-size: 14px;">
              أو انسخ الرابط التالي والصقه في المتصفح:<br>
              <span style="color: #0066cc; word-break: break-all;">${verificationLink}</span>
            </p>
            
            <p style="font-size: 14px; color: #999; margin-top: 24px;">
              ⏰ هذا الرابط صالح لمدة 24 ساعة فقط
            </p>

            <div class="en-section">
              <h2>Welcome to Sabq!</h2>
              <p>Thank you for registering with Sabq News. To activate your account and enjoy all features, please confirm your email address.</p>
              <p style="color: #999; font-size: 13px;">
                Or copy and paste this link into your browser:<br>
                <span style="color: #0066cc; word-break: break-all;">${verificationLink}</span>
              </p>
              <p style="font-size: 13px; color: #999; margin-top: 16px;">
                ⏰ This link is valid for 24 hours only
              </p>
            </div>
          </div>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} صحيفة سبق الإلكترونية - Sabq News</p>
            <p style="font-size: 12px; margin-top: 8px;">إذا لم تقم بالتسجيل، يرجى تجاهل هذه الرسالة</p>
            <p style="font-size: 12px; margin-top: 4px;">If you didn't sign up, please ignore this email</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
مرحباً بك في صحيفة سبق!

لتفعيل حسابك، يرجى النقر على الرابط التالي:
${verificationLink}

هذا الرابط صالح لمدة 24 ساعة فقط.

إذا لم تقم بالتسجيل، يرجى تجاهل هذه الرسالة.

---
Welcome to Sabq News!

To activate your account, please click the following link:
${verificationLink}

This link is valid for 24 hours only.

If you didn't sign up, please ignore this email.
    `.trim();

    const sentFrom = new Sender(FROM_EMAIL, FROM_NAME);
    const recipients = [new Recipient(email)];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject('تفعيل حسابك في صحيفة سبق - Activate Your Sabq Account')
      .setHtml(htmlContent)
      .setText(textContent);

    await mailerSend.email.send(emailParams);
    console.log(`✅ Verification email sent to ${email}`);
    
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to send verification email:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to send email' 
    };
  }
}

/**
 * Verify email token
 */
export async function verifyEmailToken(token: string): Promise<{ success: boolean; userId?: string; error?: string }> {
  try {
    // Find token in database
    const [verificationToken] = await db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.token, token))
      .limit(1);

    if (!verificationToken) {
      return { success: false, error: 'Invalid verification token' };
    }

    // Check if token is already used
    if (verificationToken.used) {
      return { success: false, error: 'Verification token already used' };
    }

    // Check if token is expired
    if (new Date() > verificationToken.expiresAt) {
      return { success: false, error: 'Verification token expired' };
    }

    // Mark token as used
    await db
      .update(emailVerificationTokens)
      .set({ used: true })
      .where(eq(emailVerificationTokens.token, token));

    // Update user email verification status
    await db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, verificationToken.userId));

    console.log(`✅ Email verified for user ${verificationToken.userId}`);
    
    return { success: true, userId: verificationToken.userId };
  } catch (error) {
    console.error('❌ Failed to verify email token:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to verify email' 
    };
  }
}

/**
 * Resend verification email
 */
export async function resendVerificationEmail(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Get user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    if (user.emailVerified) {
      return { success: false, error: 'Email already verified' };
    }

    // Send new verification email
    return await sendVerificationEmail(userId, user.email);
  } catch (error) {
    console.error('❌ Failed to resend verification email:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to resend email' 
    };
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email: string, resetToken: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!mailerSend || !MAILERSEND_API_KEY) {
      console.warn('Password reset email not sent - MailerSend not configured');
      return { success: false, error: 'MailerSend API key not configured' };
    }

    // Create reset link
    const resetLink = `${FRONTEND_URL}/reset-password?token=${resetToken}`;

    // Email content
    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
          .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 40px 20px; text-align: center; }
          .header h1 { color: white; font-size: 28px; margin: 0; font-weight: bold; }
          .content { padding: 40px 30px; text-align: right; }
          .content h2 { color: #333; font-size: 22px; margin-bottom: 16px; }
          .content p { color: #666; font-size: 16px; line-height: 1.8; margin-bottom: 16px; }
          .button { display: inline-block; background: #dc2626; color: white !important; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 18px; font-weight: bold; margin: 20px 0; transition: background 0.3s; }
          .button:hover { background: #b91c1c; }
          .footer { background: #f9f9f9; padding: 24px 30px; text-align: center; color: #999; font-size: 14px; border-top: 1px solid #eee; }
          .warning { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0; color: #92400e; }
          .en-section { direction: ltr; text-align: left; margin-top: 24px; padding-top: 24px; border-top: 2px solid #eee; }
          .en-section h2 { font-size: 20px; color: #333; margin-bottom: 12px; }
          .en-section p { color: #666; font-size: 15px; line-height: 1.6; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 إعادة تعيين كلمة المرور</h1>
          </div>
          
          <div class="content">
            <h2>طلب إعادة تعيين كلمة المرور</h2>
            <p>تلقينا طلباً لإعادة تعيين كلمة المرور لحسابك في صحيفة سبق الإلكترونية.</p>
            
            <p style="text-align: center;">
              <a href="${resetLink}" class="button" data-testid="reset-password-button">
                🔑 إعادة تعيين كلمة المرور
              </a>
            </p>
            
            <p style="color: #999; font-size: 14px;">
              أو انسخ الرابط التالي والصقه في المتصفح:<br>
              <span style="color: #dc2626; word-break: break-all;">${resetLink}</span>
            </p>
            
            <div class="warning">
              ⚠️ هذا الرابط صالح لمدة ساعة واحدة فقط. إذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذه الرسالة.
            </div>

            <div class="en-section">
              <h2>Password Reset Request</h2>
              <p>We received a request to reset the password for your Sabq News account.</p>
              <p style="color: #999; font-size: 13px;">
                Or copy and paste this link into your browser:<br>
                <span style="color: #dc2626; word-break: break-all;">${resetLink}</span>
              </p>
              <p style="font-size: 13px; color: #92400e; background: #fef3c7; padding: 12px; border-radius: 6px; margin-top: 16px;">
                ⚠️ This link is valid for 1 hour only. If you didn't request a password reset, please ignore this email.
              </p>
            </div>
          </div>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} صحيفة سبق الإلكترونية - Sabq News</p>
            <p style="font-size: 12px; margin-top: 8px;">لأسباب أمنية، لا نشارك كلمات المرور عبر البريد الإلكتروني</p>
            <p style="font-size: 12px; margin-top: 4px;">For security reasons, we never share passwords via email</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
إعادة تعيين كلمة المرور - صحيفة سبق

تلقينا طلباً لإعادة تعيين كلمة المرور لحسابك.

لإعادة تعيين كلمة المرور، انقر على الرابط التالي:
${resetLink}

⚠️ هذا الرابط صالح لمدة ساعة واحدة فقط.

إذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذه الرسالة.

---
Password Reset - Sabq News

We received a request to reset your password.

To reset your password, click the following link:
${resetLink}

⚠️ This link is valid for 1 hour only.

If you didn't request a password reset, please ignore this email.
    `.trim();

    const sentFrom = new Sender(FROM_EMAIL, FROM_NAME);
    const recipients = [new Recipient(email)];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject('إعادة تعيين كلمة المرور - Password Reset | سبق')
      .setHtml(htmlContent)
      .setText(textContent);

    await mailerSend.email.send(emailParams);
    console.log(`✅ Password reset email sent to ${email}`);
    
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to send password reset email:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to send email' 
    };
  }
}

/**
 * Send welcome email when user subscribes to newsletter
 */
export async function sendNewsletterWelcomeEmail(options: {
  to: string;
  firstName?: string;
  language?: 'ar' | 'en' | 'ur';
  interests?: string[];
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (!mailerSend || !MAILERSEND_API_KEY) {
      console.warn('Newsletter welcome email not sent - MailerSend not configured');
      return { success: false, error: 'MailerSend API key not configured' };
    }

    const { to, firstName, language = 'ar', interests = [] } = options;
    const greeting = firstName ? `مرحباً ${firstName}` : 'مرحباً بك';
    const interestsList = interests.length > 0 ? interests.join('، ') : 'جميع الأخبار';

    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
          .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #10b981, #059669); padding: 40px 20px; text-align: center; }
          .header h1 { color: white; font-size: 28px; margin: 0; font-weight: bold; }
          .content { padding: 40px 30px; text-align: right; }
          .content h2 { color: #1f2937; font-size: 22px; margin-bottom: 16px; }
          .content p { color: #4b5563; font-size: 16px; line-height: 1.8; margin-bottom: 16px; }
          .highlight-box { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .highlight-box h3 { color: #166534; margin: 0 0 12px 0; font-size: 16px; }
          .highlight-box p { color: #15803d; margin: 0; font-size: 14px; }
          .schedule-item { display: flex; align-items: center; margin-bottom: 12px; padding: 12px; background: #f9fafb; border-radius: 8px; }
          .schedule-icon { font-size: 24px; margin-left: 12px; }
          .schedule-text { flex: 1; }
          .schedule-text strong { color: #1f2937; display: block; }
          .schedule-text span { color: #6b7280; font-size: 14px; }
          .footer { background: #f9f9f9; padding: 24px 30px; text-align: center; color: #999; font-size: 14px; border-top: 1px solid #eee; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <p style="font-size: 48px; margin-bottom: 8px;">✅</p>
            <h1>تم الاشتراك بنجاح!</h1>
          </div>
          
          <div class="content">
            <h2>${greeting} في النشرة الذكية!</h2>
            <p>شكراً لاشتراكك في النشرة الإخبارية الذكية من صحيفة سبق. ستصلك أهم الأخبار والتحليلات مباشرة إلى بريدك الإلكتروني.</p>
            
            <div class="highlight-box">
              <h3>📌 اهتماماتك المختارة:</h3>
              <p>${interestsList}</p>
            </div>
            
            <h3 style="color: #1f2937; margin-bottom: 16px;">📅 مواعيد النشرات:</h3>
            
            <div class="schedule-item">
              <span class="schedule-icon">☀️</span>
              <div class="schedule-text">
                <strong>النشرة الصباحية</strong>
                <span>كل يوم الساعة 6:00 صباحاً</span>
              </div>
            </div>
            
            <div class="schedule-item">
              <span class="schedule-icon">🌙</span>
              <div class="schedule-text">
                <strong>النشرة المسائية</strong>
                <span>كل يوم الساعة 8:00 مساءً</span>
              </div>
            </div>
            
            <div class="schedule-item">
              <span class="schedule-icon">📊</span>
              <div class="schedule-text">
                <strong>النشرة الأسبوعية</strong>
                <span>كل أحد الساعة 10:00 صباحاً</span>
              </div>
            </div>
            
            <p style="text-align: center; margin-top: 30px;">
              <a href="${FRONTEND_URL}" style="background: #10b981; color: white !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; display: inline-block;">
                تصفح آخر الأخبار
              </a>
            </p>
          </div>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} صحيفة سبق الإلكترونية</p>
            <p style="margin-top: 8px; font-size: 12px; color: #9ca3af;">
              يمكنك إلغاء الاشتراك في أي وقت من خلال الرابط في أسفل كل نشرة
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
${greeting} في النشرة الذكية!

شكراً لاشتراكك في النشرة الإخبارية الذكية من صحيفة سبق.

اهتماماتك المختارة: ${interestsList}

مواعيد النشرات:
- النشرة الصباحية: كل يوم الساعة 6:00 صباحاً
- النشرة المسائية: كل يوم الساعة 8:00 مساءً
- النشرة الأسبوعية: كل أحد الساعة 10:00 صباحاً

تصفح آخر الأخبار: ${FRONTEND_URL}

---
© ${new Date().getFullYear()} صحيفة سبق الإلكترونية
    `.trim();

    const sentFrom = new Sender(FROM_EMAIL, FROM_NAME);
    const recipients = [new Recipient(to)];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject('✅ تم اشتراكك في النشرة الذكية | سبق')
      .setHtml(htmlContent)
      .setText(textContent);

    await mailerSend.email.send(emailParams);
    console.log(`✅ Newsletter welcome email sent to ${to}`);
    
    return { success: true };
  } catch (error) {
    console.error(`❌ Failed to send newsletter welcome email to ${options.to}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to send email' 
    };
  }
}

/**
 * Send newsletter email to a subscriber
 */
export async function sendNewsletterEmail(options: {
  to: string;
  newsletterTitle: string;
  newsletterDescription: string;
  audioUrl?: string;
  articleSummaries?: { 
    title: string; 
    excerpt: string; 
    url?: string;
    curiosityHook?: string;
    keyTakeaway?: string;
    engagementScore?: number;
  }[];
  newsletterType: 'morning_brief' | 'evening_digest' | 'weekly_roundup';
  unsubscribeToken?: string;
  personalizedIntro?: string;
  dailyQuestion?: {
    question: string;
    options?: string[];
    context?: string;
    engagementType?: 'poll' | 'opinion' | 'quiz' | 'discussion';
  };
  aiSubject?: string;
  aiPreheader?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (!mailerSend || !MAILERSEND_API_KEY) {
      console.warn('Newsletter email not sent - MailerSend not configured');
      return { success: false, error: 'MailerSend API key not configured' };
    }

    const { to, newsletterTitle, newsletterDescription, audioUrl, articleSummaries, newsletterType, unsubscribeToken, personalizedIntro, dailyQuestion, aiSubject, aiPreheader } = options;

    // Type-specific styling
    const typeStyles = {
      morning_brief: { gradient: '#f97316, #ea580c', icon: '☀️', label: 'النشرة الصباحية' },
      evening_digest: { gradient: '#8b5cf6, #7c3aed', icon: '🌙', label: 'النشرة المسائية' },
      weekly_roundup: { gradient: '#0ea5e9, #0284c7', icon: '📊', label: 'النشرة الأسبوعية' }
    };
    
    const style = typeStyles[newsletterType];
    const unsubscribeUrl = unsubscribeToken 
      ? `${FRONTEND_URL}/unsubscribe?token=${unsubscribeToken}`
      : `${FRONTEND_URL}/unsubscribe`;

    // Build article list HTML with enhanced content
    const articlesHtml = articleSummaries?.map((article, index) => `
      <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
        <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #1f2937;">${index + 1}. ${article.title}</h3>
        ${article.curiosityHook ? `<p style="margin: 0 0 8px 0; color: #0066cc; font-size: 14px; font-weight: 500;">${article.curiosityHook}</p>` : ''}
        <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">${article.excerpt}</p>
        ${article.keyTakeaway ? `<p style="margin: 8px 0 0 0; color: #059669; font-size: 13px; font-style: italic;">💡 ${article.keyTakeaway}</p>` : ''}
        ${article.url ? `<a href="${article.url}" style="color: #0066cc; font-size: 13px; text-decoration: none; display: inline-block; margin-top: 8px;">اقرأ المزيد ←</a>` : ''}
      </div>
    `).join('') || '';

    // Build daily question HTML
    const dailyQuestionHtml = dailyQuestion ? `
      <div style="background: linear-gradient(135deg, #fef3c7, #fcd34d); border-radius: 12px; padding: 20px; margin: 24px 0; border-right: 4px solid #f59e0b;">
        <h3 style="margin: 0 0 12px 0; color: #92400e; font-size: 16px;">❓ سؤال اليوم</h3>
        <p style="margin: 0 0 12px 0; color: #78350f; font-size: 15px; font-weight: 500;">${dailyQuestion.question}</p>
        ${dailyQuestion.options ? `
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${dailyQuestion.options.map(option => `
              <span style="background: white; color: #92400e; padding: 6px 12px; border-radius: 20px; font-size: 13px; display: inline-block;">${option}</span>
            `).join('')}
          </div>
        ` : ''}
        <p style="margin: 12px 0 0 0; color: #92400e; font-size: 12px;">شاركنا رأيك على وسائل التواصل الاجتماعي!</p>
      </div>
    ` : '';

    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
          .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, ${style.gradient}); padding: 40px 20px; text-align: center; }
          .header h1 { color: white; font-size: 24px; margin: 0 0 8px 0; font-weight: bold; }
          .header p { color: rgba(255,255,255,0.9); font-size: 14px; margin: 0; }
          .content { padding: 30px; text-align: right; }
          .audio-section { background: linear-gradient(135deg, #1e293b, #334155); border-radius: 12px; padding: 24px; margin-bottom: 24px; text-align: center; }
          .audio-section h3 { color: white; margin: 0 0 12px 0; font-size: 18px; }
          .audio-button { display: inline-block; background: white; color: #1e293b !important; text-decoration: none; padding: 14px 32px; border-radius: 50px; font-size: 16px; font-weight: bold; }
          .articles-section h2 { font-size: 18px; color: #1f2937; margin-bottom: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
          .footer { background: #f9f9f9; padding: 20px 30px; text-align: center; color: #999; font-size: 12px; border-top: 1px solid #eee; }
          .footer a { color: #6b7280; text-decoration: underline; }
        </style>
      </head>
      <body>
        ${aiPreheader ? `<div style="display:none;font-size:1px;color:#f5f5f5;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${aiPreheader}</div>` : ''}
        <div class="container">
          <div class="header">
            <p style="font-size: 28px; margin-bottom: 8px;">${style.icon}</p>
            <h1>${newsletterTitle}</h1>
            <p>${newsletterDescription}</p>
          </div>
          
          <div class="content">
            ${personalizedIntro ? `
              <div style="background: linear-gradient(135deg, #f0fdf4, #dcfce7); border-radius: 12px; padding: 20px; margin-bottom: 24px; border-right: 4px solid #22c55e;">
                <p style="margin: 0; color: #166534; font-size: 16px; line-height: 1.8;">${personalizedIntro}</p>
              </div>
            ` : ''}
            
            ${audioUrl ? `
              <div class="audio-section">
                <h3>🎧 استمع للنشرة الصوتية</h3>
                <p style="color: rgba(255,255,255,0.7); font-size: 13px; margin-bottom: 16px;">استمع أثناء تنقلك أو عملك</p>
                <a href="${audioUrl}" class="audio-button">▶ تشغيل النشرة</a>
              </div>
            ` : ''}
            
            ${articlesHtml ? `
              <div class="articles-section">
                <h2>📰 أبرز الأخبار</h2>
                ${articlesHtml}
              </div>
            ` : ''}
            
            ${dailyQuestionHtml}
            
            <p style="text-align: center; margin-top: 24px;">
              <a href="${FRONTEND_URL}" style="background: #0066cc; color: white !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; display: inline-block;">
                زيارة سبق للمزيد
              </a>
            </p>
          </div>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} صحيفة سبق الإلكترونية</p>
            <p style="margin-top: 8px;">
              <a href="${unsubscribeUrl}">إلغاء الاشتراك</a> | 
              <a href="${FRONTEND_URL}/newsletter/preferences">تعديل التفضيلات</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
${style.label} - ${newsletterTitle}

${newsletterDescription}

${personalizedIntro ? `${personalizedIntro}\n\n` : ''}${audioUrl ? `🎧 استمع للنشرة: ${audioUrl}\n` : ''}
${articleSummaries?.map((a, i) => `${i + 1}. ${a.title}${a.curiosityHook ? `\n${a.curiosityHook}` : ''}\n${a.excerpt}${a.keyTakeaway ? `\n💡 ${a.keyTakeaway}` : ''}${a.url ? `\n${a.url}` : ''}`).join('\n\n') || ''}

${dailyQuestion ? `❓ سؤال اليوم: ${dailyQuestion.question}${dailyQuestion.options ? `\n${dailyQuestion.options.join(' | ')}` : ''}` : ''}

---
زيارة سبق: ${FRONTEND_URL}
إلغاء الاشتراك: ${unsubscribeUrl}
    `.trim();

    const sentFrom = new Sender(FROM_EMAIL, FROM_NAME);
    const recipients = [new Recipient(to)];

    // Use AI-generated subject if provided, otherwise fall back to default
    const emailSubject = aiSubject || `${style.icon} ${newsletterTitle}`;
    
    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject(emailSubject)
      .setHtml(htmlContent)
      .setText(textContent);

    await mailerSend.email.send(emailParams);
    console.log(`✅ Newsletter email sent to ${to}`);
    
    return { success: true };
  } catch (error) {
    console.error(`❌ Failed to send newsletter email to ${options.to}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to send email' 
    };
  }
}

/**
 * Send unsubscribe confirmation email
 */
export async function sendNewsletterUnsubscribeEmail(options: {
  to: string;
  firstName?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (!mailerSend || !MAILERSEND_API_KEY) {
      console.warn('Unsubscribe email not sent - MailerSend not configured');
      return { success: false, error: 'MailerSend API key not configured' };
    }

    const { to, firstName } = options;
    const greeting = firstName ? `${firstName} العزيز` : 'عزيزي المشترك';

    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
          .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #6b7280, #4b5563); padding: 40px 20px; text-align: center; }
          .header h1 { color: white; font-size: 24px; margin: 0; font-weight: bold; }
          .content { padding: 40px 30px; text-align: right; }
          .content h2 { color: #1f2937; font-size: 20px; margin-bottom: 16px; }
          .content p { color: #4b5563; font-size: 16px; line-height: 1.8; margin-bottom: 16px; }
          .info-box { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin: 20px 0; }
          .info-box p { color: #92400e; margin: 0; font-size: 14px; }
          .resubscribe-button { display: inline-block; background: #10b981; color: white !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: bold; margin-top: 20px; }
          .footer { background: #f9f9f9; padding: 24px 30px; text-align: center; color: #999; font-size: 14px; border-top: 1px solid #eee; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <p style="font-size: 48px; margin-bottom: 8px;">👋</p>
            <h1>تم إلغاء اشتراكك</h1>
          </div>
          
          <div class="content">
            <h2>${greeting}،</h2>
            <p>نؤكد لك أنه تم إلغاء اشتراكك من النشرة الإخبارية الذكية لصحيفة سبق بنجاح.</p>
            <p>لن تتلقى أي رسائل إخبارية منا بعد الآن.</p>
            
            <div class="info-box">
              <p>💡 نأسف لرؤيتك تذهب! إذا ألغيت الاشتراك بالخطأ أو غيرت رأيك، يمكنك إعادة الاشتراك في أي وقت.</p>
            </div>
            
            <p style="text-align: center;">
              <a href="${FRONTEND_URL}/newsletter" class="resubscribe-button">
                إعادة الاشتراك
              </a>
            </p>
            
            <p style="color: #9ca3af; font-size: 14px; margin-top: 30px;">
              إذا كان لديك أي ملاحظات حول سبب إلغاء اشتراكك، نرحب بتواصلك معنا لتحسين خدماتنا.
            </p>
          </div>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} صحيفة سبق الإلكترونية</p>
            <p style="margin-top: 8px;">
              <a href="${FRONTEND_URL}" style="color: #6b7280;">زيارة الموقع</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
${greeting}،

نؤكد لك أنه تم إلغاء اشتراكك من النشرة الإخبارية الذكية لصحيفة سبق بنجاح.

لن تتلقى أي رسائل إخبارية منا بعد الآن.

إذا ألغيت الاشتراك بالخطأ أو غيرت رأيك، يمكنك إعادة الاشتراك من هنا:
${FRONTEND_URL}/newsletter

---
© ${new Date().getFullYear()} صحيفة سبق الإلكترونية
    `.trim();

    const sentFrom = new Sender(FROM_EMAIL, FROM_NAME);
    const recipients = [new Recipient(to)];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject('👋 تم إلغاء اشتراكك | سبق')
      .setHtml(htmlContent)
      .setText(textContent);

    await mailerSend.email.send(emailParams);
    console.log(`✅ Unsubscribe confirmation email sent to ${to}`);
    
    return { success: true };
  } catch (error) {
    console.error(`❌ Failed to send unsubscribe email to ${options.to}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to send email' 
    };
  }
}
