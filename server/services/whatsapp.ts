import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

// 🔧 FIX: Remove 'whatsapp:' prefix if it exists to prevent duplication
// Also trim any whitespace that might be in the secret value
const rawWhatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER || '';
const whatsappNumber = rawWhatsappNumber.replace(/^whatsapp:/i, '').trim();

if (!accountSid || !authToken) {
  console.warn('⚠️ Twilio credentials not configured - WhatsApp features disabled');
}

export const twilioClient = accountSid && authToken 
  ? twilio(accountSid, authToken)
  : null;

export interface SendWhatsAppMessageOptions {
  to: string;
  body: string;
  mediaUrl?: string;
  statusCallback?: string;
}

export interface SendMessageResult {
  success: boolean;
  sid?: string;
  status?: string;
  error?: string;
  errorCode?: number;
  requiresTemplate?: boolean;
}

// 📊 Track last inbound message time per phone number for 24-hour window
const lastInboundMessageTime = new Map<string, number>();

// Update the last inbound message time when receiving a message
export function updateLastInboundTime(phoneNumber: string): void {
  const cleanNumber = phoneNumber.replace(/^whatsapp:/i, '');
  lastInboundMessageTime.set(cleanNumber, Date.now());
  console.log(`[WhatsApp Service] 📥 Updated last inbound time for ${cleanNumber.substring(0, 8)}...`);
}

// Check if we're within the 24-hour window for free-form messages
export function isWithin24HourWindow(phoneNumber: string): boolean {
  const cleanNumber = phoneNumber.replace(/^whatsapp:/i, '');
  const lastTime = lastInboundMessageTime.get(cleanNumber);
  
  if (!lastTime) {
    console.warn(`[WhatsApp Service] ⚠️ No inbound message tracked for ${cleanNumber.substring(0, 8)}...`);
    return true; // Assume yes if we don't have tracking (might be from before restart)
  }
  
  const hoursSince = (Date.now() - lastTime) / (1000 * 60 * 60);
  const isWithinWindow = hoursSince < 24;
  
  console.log(`[WhatsApp Service] ⏰ 24h window check for ${cleanNumber.substring(0, 8)}...: ${hoursSince.toFixed(2)} hours since last message (${isWithinWindow ? 'OK' : 'EXPIRED'})`);
  
  return isWithinWindow;
}

async function sendWithRetry(
  messageOptions: any, 
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<SendMessageResult> {
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const message = await twilioClient!.messages.create(messageOptions);
      
      console.log(`[WhatsApp Service] 📤 Twilio Response:`, {
        sid: message.sid,
        status: message.status,
        to: message.to,
        errorCode: message.errorCode || 'none',
        errorMessage: message.errorMessage || 'none'
      });
      
      // Check for status that indicates potential issues
      if (message.status === 'failed' || message.status === 'undelivered') {
        return {
          success: false,
          sid: message.sid,
          status: message.status,
          error: message.errorMessage || 'Message failed to deliver',
          errorCode: message.errorCode || undefined,
          requiresTemplate: message.errorCode === 63016 || message.errorCode === 63032
        };
      }
      
      return {
        success: true,
        sid: message.sid,
        status: message.status
      };
    } catch (error: any) {
      lastError = error;
      const errorCode = error.code || error.status;
      const errorMessage = error.message || String(error);
      
      console.error(`[WhatsApp Service] ⚠️ Attempt ${attempt}/${maxRetries} failed:`, {
        code: errorCode,
        message: errorMessage,
        moreInfo: error.moreInfo || 'none'
      });
      
      // 🔴 Critical Twilio Error Codes for WhatsApp
      // 63016: Template required (outside 24h window)
      // 63032: Template required for first message
      // 21408: Permission denied
      // 21610: Message blocked
      // 63007: WhatsApp channel not enabled
      // 429: Rate limited
      
      if (errorCode === 63016 || errorCode === 63032) {
        console.error(`[WhatsApp Service] 🚫 TEMPLATE REQUIRED - Outside 24-hour window or first message`);
        return {
          success: false,
          error: 'يتطلب قالب معتمد - خارج نافذة الـ 24 ساعة',
          errorCode: errorCode,
          requiresTemplate: true
        };
      }
      
      if (errorCode === 21408 || errorCode === 21610) {
        console.error(`[WhatsApp Service] 🚫 MESSAGE BLOCKED OR PERMISSION DENIED`);
        return {
          success: false,
          error: 'الرسالة محظورة أو غير مصرح بها',
          errorCode: errorCode,
          requiresTemplate: false
        };
      }
      
      // Rate limiting - wait longer before retry
      if (errorCode === 429 || errorCode === 63017) {
        console.warn(`[WhatsApp Service] ⏳ Rate limited, waiting ${delayMs * 3}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs * 3));
        continue;
      }
      
      if (attempt < maxRetries) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt - 1)));
      }
    }
  }
  
  return {
    success: false,
    error: lastError?.message || 'Unknown error after retries',
    errorCode: lastError?.code
  };
}

export async function sendWhatsAppMessage(options: SendWhatsAppMessageOptions): Promise<boolean> {
  if (!twilioClient || !whatsappNumber) {
    console.error('[WhatsApp Service] ❌ Twilio not configured');
    return false;
  }

  const startTime = Date.now();
  const toNumber = options.to.replace(/^whatsapp:/i, '');
  
  // Check 24-hour window
  if (!isWithin24HourWindow(toNumber)) {
    console.warn(`[WhatsApp Service] ⚠️ Outside 24-hour window for ${toNumber.substring(0, 8)}... - message may be rejected`);
  }
  
  try {
    console.log(`[WhatsApp Service] 📨 Sending WhatsApp message...`);
    console.log(`[WhatsApp Service]   - From: whatsapp:${whatsappNumber}`);
    console.log(`[WhatsApp Service]   - To: whatsapp:${toNumber}`);
    console.log(`[WhatsApp Service]   - Body length: ${options.body.length} chars`);
    console.log(`[WhatsApp Service]   - Body preview: ${options.body.substring(0, 100)}...`);
    
    const messageOptions: any = {
      from: `whatsapp:${whatsappNumber}`,
      to: `whatsapp:${toNumber}`,
      body: options.body,
    };

    if (options.mediaUrl) {
      messageOptions.mediaUrl = [options.mediaUrl];
      console.log(`[WhatsApp Service]   - Media URL: ${options.mediaUrl}`);
    }

    // Add status callback if provided
    if (options.statusCallback) {
      messageOptions.statusCallback = options.statusCallback;
    }

    const result = await sendWithRetry(messageOptions, 3, 1000);
    const elapsed = Date.now() - startTime;
    
    if (result.success) {
      console.log(`[WhatsApp Service] ✅ Message accepted in ${elapsed}ms`);
      console.log(`[WhatsApp Service]   - SID: ${result.sid}`);
      console.log(`[WhatsApp Service]   - Status: ${result.status}`);
      return true;
    } else {
      console.error(`[WhatsApp Service] ❌ Message failed (${elapsed}ms)`);
      console.error(`[WhatsApp Service]   - Error: ${result.error}`);
      console.error(`[WhatsApp Service]   - Error Code: ${result.errorCode || 'none'}`);
      console.error(`[WhatsApp Service]   - Requires Template: ${result.requiresTemplate ? 'YES' : 'no'}`);
      
      if (result.requiresTemplate) {
        console.error(`[WhatsApp Service] 📋 SOLUTION: Use an approved WhatsApp template message`);
      }
      
      return false;
    }
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[WhatsApp Service] ❌ Unexpected exception (${elapsed}ms):`, {
      message: error.message,
      code: error.code,
      stack: error.stack?.substring(0, 200)
    });
    return false;
  }
}

// Extended version that returns detailed result
export async function sendWhatsAppMessageWithDetails(options: SendWhatsAppMessageOptions): Promise<SendMessageResult> {
  if (!twilioClient || !whatsappNumber) {
    console.error('[WhatsApp Service] ❌ Twilio not configured');
    return { success: false, error: 'Twilio not configured' };
  }

  const toNumber = options.to.replace(/^whatsapp:/i, '');
  
  console.log(`[WhatsApp Service] 📨 Sending WhatsApp message (with details)...`);
  console.log(`[WhatsApp Service]   - To: whatsapp:${toNumber}`);
  
  const messageOptions: any = {
    from: `whatsapp:${whatsappNumber}`,
    to: `whatsapp:${toNumber}`,
    body: options.body,
  };

  if (options.mediaUrl) {
    messageOptions.mediaUrl = [options.mediaUrl];
  }

  if (options.statusCallback) {
    messageOptions.statusCallback = options.statusCallback;
  }

  return await sendWithRetry(messageOptions, 3, 1000);
}

export function validateTwilioSignature(signature: string, url: string, params: any): boolean {
  if (!authToken) {
    console.warn('[WhatsApp Service] Cannot validate signature - auth token not configured');
    return false;
  }

  try {
    return twilio.validateRequest(authToken, signature, url, params);
  } catch (error) {
    console.error('[WhatsApp Service] Signature validation error:', error);
    return false;
  }
}

export function extractTokenFromMessage(message: string): string | null {
  // Support multiple TOKEN patterns:
  // 1. #TOKEN:XXX or #TOKEN-XXX or #TOKEN XXX (with hash)
  // 2. TOKEN:XXX or TOKEN-XXX (without hash, requires colon or dash)
  // 3. TOKEN XXX (without hash, requires space after TOKEN and uppercase token)
  // Case insensitive matching for TOKEN word
  
  // First try patterns with explicit separators (: or -)
  const explicitPattern = /\b#?TOKEN[:\-]([A-Z0-9\-_]+)/i;
  let match = message.match(explicitPattern);
  
  if (!match) {
    // Try pattern with space (with or without #), ensure token part is uppercase/numbers
    const spacePattern = /\b#?TOKEN\s+([A-Z0-9\-_]+)/i;
    match = message.match(spacePattern);
  }
  
  return match ? match[1].toUpperCase() : null;
}

export function removeTokenFromMessage(message: string): string {
  // Remove TOKEN patterns (with or without #, with :, -, or space)
  // Also remove any leftover # symbol at start of line after token removal
  return message
    .replace(/\b#?TOKEN[:\-][A-Z0-9\-_]+/gi, '')
    .replace(/\b#?TOKEN\s+[A-Z0-9\-_]+/gi, '')
    .replace(/^#\s*/gm, '')  // Remove leftover # at start of lines
    .trim();
}

console.log('✅ WhatsApp service initialized', {
  configured: !!twilioClient,
  accountSidPrefix: accountSid ? `${accountSid.substring(0, 10)}...` : 'not set',
  rawNumber: rawWhatsappNumber ? `${rawWhatsappNumber.substring(0, 15)}...` : 'not set',
  cleanNumber: whatsappNumber ? `${whatsappNumber.substring(0, 12)}...` : 'not set',
  fullNumber: whatsappNumber || 'not set'
});
