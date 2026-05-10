import fetch from 'node-fetch';
import { db } from '../db';
import { pushNotificationLogs, pushDevices } from '@shared/schema';
import { eq } from 'drizzle-orm';

// ============================================================================
// أنواع البيانات
// ============================================================================

interface FCMMessage {
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
}

interface FCMResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCategory?: ErrorCategory;
}

interface BatchFCMResult {
  successCount: number;
  failureCount: number;
  results: Array<{
    token: string;
    success: boolean;
    messageId?: string;
    error?: string;
    errorCategory?: ErrorCategory;
  }>;
}

// تصنيفات الأخطاء
type ErrorCategory = 
  | 'invalid_token'      // Token غير صالح أو منتهي
  | 'unregistered'       // الجهاز ألغى التسجيل
  | 'auth_failure'       // فشل المصادقة مع FCM
  | 'rate_limited'       // تجاوز الحد المسموح
  | 'quota_exceeded'     // تجاوز الحصة
  | 'payload_invalid'    // رسالة غير صالحة
  | 'server_error'       // خطأ في خادم FCM
  | 'network_error'      // خطأ في الشبكة
  | 'timeout'            // انتهت مهلة الاتصال
  | 'config_error'       // خطأ في التكوين
  | 'unknown';           // خطأ غير معروف

interface LogContext {
  campaignId?: string;
  articleId?: string; // varchar في قاعدة البيانات
  deviceId?: string;
  userId?: string;
  operationType: 'send_to_device' | 'send_to_topic' | 'send_batch' | 'quick_send';
  targetType: 'device' | 'topic' | 'segment' | 'all';
  targetValue?: string;
}

// ============================================================================
// متغيرات الـ Token
// ============================================================================

let fcmAccessToken: string | null = null;
let tokenExpiry: number = 0;

// ============================================================================
// وظائف مساعدة
// ============================================================================

function isFcmConfigured(): boolean {
  return !!(
    process.env.FCM_PROJECT_ID &&
    process.env.FCM_PRIVATE_KEY &&
    process.env.FCM_CLIENT_EMAIL
  );
}

// تصنيف الخطأ من رسالة FCM
function categorizeError(errorMessage: string, httpStatus?: number): ErrorCategory {
  const msg = errorMessage.toLowerCase();
  
  // Invalid Token
  if (msg.includes('not a valid fcm registration token') ||
      msg.includes('invalid registration') ||
      msg.includes('invalid_registration')) {
    return 'invalid_token';
  }
  
  // Unregistered Device
  if (msg.includes('requested entity was not found') ||
      msg.includes('not registered') ||
      msg.includes('unregistered')) {
    return 'unregistered';
  }
  
  // Auth Failure
  if (msg.includes('authentication') ||
      msg.includes('unauthorized') ||
      msg.includes('permission denied') ||
      httpStatus === 401 || httpStatus === 403) {
    return 'auth_failure';
  }
  
  // Rate Limited
  if (msg.includes('rate') ||
      msg.includes('too many') ||
      msg.includes('quota') ||
      httpStatus === 429) {
    return 'rate_limited';
  }
  
  // Quota Exceeded
  if (msg.includes('exceeded') ||
      msg.includes('limit')) {
    return 'quota_exceeded';
  }
  
  // Payload Invalid
  if (msg.includes('invalid') && 
      (msg.includes('payload') || msg.includes('message') || msg.includes('request'))) {
    return 'payload_invalid';
  }
  
  // Server Error
  if (msg.includes('internal') ||
      msg.includes('unavailable') ||
      (httpStatus && httpStatus >= 500)) {
    return 'server_error';
  }
  
  // Network Error
  if (msg.includes('network') ||
      msg.includes('connection') ||
      msg.includes('econnrefused') ||
      msg.includes('enotfound')) {
    return 'network_error';
  }
  
  // Timeout
  if (msg.includes('timeout') ||
      msg.includes('timed out')) {
    return 'timeout';
  }
  
  // Config Error
  if (msg.includes('not configured') ||
      msg.includes('missing')) {
    return 'config_error';
  }
  
  return 'unknown';
}

// تسجيل العملية في قاعدة البيانات
async function logPushOperation(
  context: LogContext,
  message: FCMMessage,
  result: FCMResponse,
  durationMs: number,
  httpStatus?: number
): Promise<void> {
  try {
    // Hash the device token for privacy
    const tokenHash = context.targetValue ? 
      context.targetValue.substring(0, 10) + '...' + context.targetValue.slice(-10) : 
      null;
    
    await db.insert(pushNotificationLogs).values({
      campaignId: context.campaignId,
      articleId: context.articleId,
      deviceId: context.deviceId,
      userId: context.userId,
      operationType: context.operationType,
      targetType: context.targetType,
      targetValue: tokenHash,
      messageTitle: message.title,
      messageBody: message.body,
      messageData: message.data,
      status: result.success ? 'sent' : 'failed',
      fcmMessageId: result.messageId,
      httpStatusCode: httpStatus,
      errorCategory: result.errorCategory,
      errorCode: result.error ? result.error.substring(0, 100) : null,
      errorMessage: result.error,
      errorDetails: result.error ? { rawResponse: result.error } : null,
      durationMs,
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      startedAt: new Date(Date.now() - durationMs),
      completedAt: new Date(),
    });

    // إذا كان الخطأ invalid_token أو unregistered، إلغاء تفعيل الجهاز
    if (result.errorCategory === 'invalid_token' || result.errorCategory === 'unregistered') {
      if (context.targetValue) {
        await db.update(pushDevices)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(pushDevices.deviceToken, context.targetValue));
        console.log(`[FCM] Device deactivated due to ${result.errorCategory}: ${tokenHash}`);
      }
    }
  } catch (logError) {
    // لا نريد أن يفشل الإرسال بسبب فشل التسجيل
    console.error('[FCM] Failed to log push operation:', logError);
  }
}

// ============================================================================
// الحصول على Access Token
// ============================================================================

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  
  if (fcmAccessToken && tokenExpiry > now + 60000) {
    return fcmAccessToken;
  }

  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  
  if (!privateKey || !clientEmail) {
    throw new Error('FCM credentials not configured');
  }

  console.log('[FCM] Refreshing access token...');
  const jwt = await createJWT(clientEmail, privateKey);
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[FCM] Token refresh failed:', error);
    throw new Error(`Failed to get FCM access token: ${error}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  fcmAccessToken = data.access_token;
  tokenExpiry = now + (data.expires_in * 1000);
  
  console.log('[FCM] Access token refreshed, expires in:', data.expires_in, 'seconds');
  return fcmAccessToken;
}

async function createJWT(clientEmail: string, privateKey: string): Promise<string> {
  const crypto = await import('crypto');
  
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(privateKey, 'base64url');

  return `${signatureInput}.${signature}`;
}

// ============================================================================
// إرسال لجهاز واحد
// ============================================================================

async function sendToDevice(
  token: string,
  message: FCMMessage,
  context?: Partial<LogContext>
): Promise<FCMResponse> {
  const startTime = Date.now();
  
  if (!isFcmConfigured()) {
    const result = { success: false, error: 'FCM not configured', errorCategory: 'config_error' as ErrorCategory };
    console.warn('[FCM] Send failed: FCM not configured');
    return result;
  }

  let httpStatus: number | undefined;
  
  try {
    const accessToken = await getAccessToken();
    const projectId = process.env.FCM_PROJECT_ID;

    // Prepare data for both Android and iOS
    const messageData = message.data || {};
    
    const fcmMessage: any = {
      message: {
        token,
        notification: {
          title: message.title,
          body: message.body,
        },
        data: messageData,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              'mutable-content': 1,
            },
            // Include data fields directly in APNs payload for iOS background handling
            ...messageData,
          },
        },
      },
    };

    if (message.imageUrl) {
      fcmMessage.message.notification.image = message.imageUrl;
      fcmMessage.message.android.notification.image = message.imageUrl;
      fcmMessage.message.apns.fcm_options = { image: message.imageUrl };
    }

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fcmMessage),
      }
    );

    httpStatus = response.status;
    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const error = await response.json() as any;
      const errorMessage = error?.error?.message || 'Unknown FCM error';
      const errorCategory = categorizeError(errorMessage, httpStatus);
      
      const result: FCMResponse = { 
        success: false, 
        error: errorMessage,
        errorCategory
      };
      
      console.error(`[FCM] Send failed (${httpStatus}): ${errorMessage} [${errorCategory}]`);
      
      // تسجيل العملية
      if (context) {
        await logPushOperation(
          { 
            ...context, 
            operationType: context.operationType || 'send_to_device',
            targetType: 'device',
            targetValue: token 
          } as LogContext,
          message,
          result,
          durationMs,
          httpStatus
        );
      }
      
      return result;
    }

    const apiResult = await response.json() as { name: string };
    const result: FCMResponse = { success: true, messageId: apiResult.name };
    
    console.log(`[FCM] Sent successfully to device in ${durationMs}ms, messageId: ${apiResult.name}`);
    
    // تسجيل العملية
    if (context) {
      await logPushOperation(
        { 
          ...context, 
          operationType: context.operationType || 'send_to_device',
          targetType: 'device',
          targetValue: token 
        } as LogContext,
        message,
        result,
        durationMs,
        httpStatus
      );
    }
    
    return result;
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const errorCategory = categorizeError(error.message);
    
    const result: FCMResponse = { 
      success: false, 
      error: error.message,
      errorCategory
    };
    
    console.error(`[FCM] Send error (${durationMs}ms): ${error.message} [${errorCategory}]`);
    
    // تسجيل العملية
    if (context) {
      await logPushOperation(
        { 
          ...context, 
          operationType: context.operationType || 'send_to_device',
          targetType: 'device',
          targetValue: token 
        } as LogContext,
        message,
        result,
        durationMs,
        httpStatus
      );
    }
    
    return result;
  }
}

// ============================================================================
// إرسال لعدة أجهزة
// ============================================================================

async function sendToMultipleDevices(
  tokens: string[],
  message: FCMMessage,
  context?: Partial<LogContext>
): Promise<BatchFCMResult> {
  const startTime = Date.now();
  
  console.log(`[FCM] Starting batch send to ${tokens.length} devices...`);
  
  if (!isFcmConfigured()) {
    console.error('[FCM] Batch send failed: FCM not configured');
    return {
      successCount: 0,
      failureCount: tokens.length,
      results: tokens.map(token => ({
        token,
        success: false,
        error: 'FCM not configured',
        errorCategory: 'config_error' as ErrorCategory,
      })),
    };
  }

  const results: BatchFCMResult['results'] = [];
  let successCount = 0;
  let failureCount = 0;

  // إرسال على دفعات
  const batchSize = 500;
  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(tokens.length / batchSize);
    
    console.log(`[FCM] Processing batch ${batchNum}/${totalBatches} (${batch.length} devices)...`);
    
    const batchResults = await Promise.all(
      batch.map(async (token) => {
        const result = await sendToDevice(token, message, context);
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }
        return {
          token,
          success: result.success,
          messageId: result.messageId,
          error: result.error,
          errorCategory: result.errorCategory,
        };
      })
    );
    
    results.push(...batchResults);
    
    // تأخير بين الدفعات لتجنب rate limiting
    if (i + batchSize < tokens.length) {
      console.log('[FCM] Waiting 100ms before next batch...');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(`[FCM] Batch send completed in ${durationMs}ms: ${successCount} success, ${failureCount} failed`);

  // تسجيل ملخص الدفعة
  try {
    await db.insert(pushNotificationLogs).values({
      campaignId: context?.campaignId,
      articleId: context?.articleId,
      operationType: 'send_batch',
      targetType: 'segment',
      targetValue: `${tokens.length} devices`,
      messageTitle: message.title,
      messageBody: message.body,
      messageData: message.data,
      status: failureCount === 0 ? 'sent' : (successCount === 0 ? 'failed' : 'sent'),
      errorMessage: failureCount > 0 ? `${failureCount} failures out of ${tokens.length}` : null,
      errorDetails: failureCount > 0 ? {
        rawResponse: JSON.stringify({
          successCount,
          failureCount,
          errorBreakdown: results.filter(r => !r.success).reduce((acc, r) => {
            const cat = r.errorCategory || 'unknown';
            acc[cat] = (acc[cat] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        })
      } : null,
      durationMs,
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      startedAt: new Date(startTime),
      completedAt: new Date(),
    });
  } catch (logError) {
    console.error('[FCM] Failed to log batch operation:', logError);
  }

  return { successCount, failureCount, results };
}

// ============================================================================
// إرسال لـ Topic
// ============================================================================

async function sendToTopic(
  topic: string,
  message: FCMMessage,
  context?: Partial<LogContext>
): Promise<FCMResponse> {
  const startTime = Date.now();
  
  console.log(`[FCM] Sending to topic: ${topic}...`);
  
  if (!isFcmConfigured()) {
    console.error('[FCM] Topic send failed: FCM not configured');
    return { success: false, error: 'FCM not configured', errorCategory: 'config_error' };
  }

  let httpStatus: number | undefined;

  try {
    const accessToken = await getAccessToken();
    const projectId = process.env.FCM_PROJECT_ID;

    // Prepare data for both Android and iOS
    const messageData = message.data || {};

    const fcmMessage = {
      message: {
        topic,
        notification: {
          title: message.title,
          body: message.body,
          image: message.imageUrl,
        },
        data: messageData,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              'mutable-content': 1,
            },
            // Include data fields directly in APNs payload for iOS background handling
            ...messageData,
          },
        },
      },
    };

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fcmMessage),
      }
    );

    httpStatus = response.status;
    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const error = await response.json() as any;
      const errorMessage = error?.error?.message || 'Unknown error';
      const errorCategory = categorizeError(errorMessage, httpStatus);
      
      const result: FCMResponse = { 
        success: false, 
        error: errorMessage,
        errorCategory
      };
      
      console.error(`[FCM] Topic send failed (${httpStatus}): ${errorMessage} [${errorCategory}]`);
      
      // تسجيل العملية
      await db.insert(pushNotificationLogs).values({
        campaignId: context?.campaignId,
        articleId: context?.articleId,
        operationType: context?.operationType || 'send_to_topic',
        targetType: 'topic',
        targetValue: topic,
        messageTitle: message.title,
        messageBody: message.body,
        messageData: message.data,
        status: 'failed',
        httpStatusCode: httpStatus,
        errorCategory,
        errorCode: errorMessage.substring(0, 100),
        errorMessage,
        durationMs,
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
        startedAt: new Date(startTime),
        completedAt: new Date(),
      });
      
      return result;
    }

    const apiResult = await response.json() as { name: string };
    const result: FCMResponse = { success: true, messageId: apiResult.name };
    
    console.log(`[FCM] Topic send successful in ${durationMs}ms, messageId: ${apiResult.name}`);
    
    // تسجيل العملية
    await db.insert(pushNotificationLogs).values({
      campaignId: context?.campaignId,
      articleId: context?.articleId,
      operationType: context?.operationType || 'send_to_topic',
      targetType: 'topic',
      targetValue: topic,
      messageTitle: message.title,
      messageBody: message.body,
      messageData: message.data,
      status: 'sent',
      fcmMessageId: apiResult.name,
      httpStatusCode: httpStatus,
      durationMs,
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      startedAt: new Date(startTime),
      completedAt: new Date(),
    });
    
    return result;
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const errorCategory = categorizeError(error.message);
    
    const result: FCMResponse = { 
      success: false, 
      error: error.message,
      errorCategory
    };
    
    console.error(`[FCM] Topic send error (${durationMs}ms): ${error.message} [${errorCategory}]`);
    
    // تسجيل العملية
    try {
      await db.insert(pushNotificationLogs).values({
        campaignId: context?.campaignId,
        articleId: context?.articleId,
        operationType: context?.operationType || 'send_to_topic',
        targetType: 'topic',
        targetValue: topic,
        messageTitle: message.title,
        messageBody: message.body,
        messageData: message.data,
        status: 'failed',
        httpStatusCode: httpStatus,
        errorCategory,
        errorMessage: error.message,
        errorDetails: { stackTrace: error.stack },
        durationMs,
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
        startedAt: new Date(startTime),
        completedAt: new Date(),
      });
    } catch (logError) {
      console.error('[FCM] Failed to log topic error:', logError);
    }
    
    return result;
  }
}

// ============================================================================
// وظائف التحليل والإحصائيات
// ============================================================================

async function getPushStats(days: number = 7): Promise<{
  totalSent: number;
  totalFailed: number;
  successRate: number;
  errorBreakdown: Record<string, number>;
  dailyStats: Array<{ date: string; sent: number; failed: number }>;
}> {
  const { sql, count, gte, and, eq: eqOp } = await import('drizzle-orm');
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  // إحصائيات عامة
  const [stats] = await db
    .select({
      totalSent: sql<number>`count(*) filter (where ${pushNotificationLogs.status} = 'sent')`,
      totalFailed: sql<number>`count(*) filter (where ${pushNotificationLogs.status} = 'failed')`,
    })
    .from(pushNotificationLogs)
    .where(gte(pushNotificationLogs.createdAt, startDate));
  
  // تفصيل الأخطاء
  const errorStats = await db
    .select({
      category: pushNotificationLogs.errorCategory,
      count: count(),
    })
    .from(pushNotificationLogs)
    .where(
      and(
        gte(pushNotificationLogs.createdAt, startDate),
        eqOp(pushNotificationLogs.status, 'failed')
      )
    )
    .groupBy(pushNotificationLogs.errorCategory);
  
  const errorBreakdown: Record<string, number> = {};
  errorStats.forEach(stat => {
    if (stat.category) {
      errorBreakdown[stat.category] = stat.count;
    }
  });
  
  // إحصائيات يومية
  const dailyStatsRaw = await db
    .select({
      date: sql<string>`date(${pushNotificationLogs.createdAt})`,
      sent: sql<number>`count(*) filter (where ${pushNotificationLogs.status} = 'sent')`,
      failed: sql<number>`count(*) filter (where ${pushNotificationLogs.status} = 'failed')`,
    })
    .from(pushNotificationLogs)
    .where(gte(pushNotificationLogs.createdAt, startDate))
    .groupBy(sql`date(${pushNotificationLogs.createdAt})`)
    .orderBy(sql`date(${pushNotificationLogs.createdAt})`);
  
  const totalSent = stats?.totalSent || 0;
  const totalFailed = stats?.totalFailed || 0;
  const total = totalSent + totalFailed;
  
  return {
    totalSent,
    totalFailed,
    successRate: total > 0 ? (totalSent / total) * 100 : 0,
    errorBreakdown,
    dailyStats: dailyStatsRaw.map(d => ({
      date: d.date,
      sent: d.sent || 0,
      failed: d.failed || 0,
    })),
  };
}

// ============================================================================
// اشتراك/إلغاء اشتراك الأجهزة في Topics
// ============================================================================

/**
 * اشتراك جهاز في topic
 */
async function subscribeToTopic(token: string, topic: string): Promise<{ success: boolean; error?: string }> {
  if (!isFcmConfigured()) {
    return { success: false, error: 'FCM not configured' };
  }

  try {
    const accessToken = await getAccessToken();
    
    const response = await fetch(
      `https://iid.googleapis.com/iid/v1/${token}/rel/topics/${topic}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok) {
      console.log(`[FCM] Device subscribed to topic: ${topic}`);
      return { success: true };
    } else {
      const errorText = await response.text();
      console.error(`[FCM] Failed to subscribe to topic ${topic}:`, errorText);
      return { success: false, error: errorText };
    }
  } catch (error) {
    console.error('[FCM] Subscribe to topic error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * إلغاء اشتراك جهاز من topic
 */
async function unsubscribeFromTopic(token: string, topic: string): Promise<{ success: boolean; error?: string }> {
  if (!isFcmConfigured()) {
    return { success: false, error: 'FCM not configured' };
  }

  try {
    const accessToken = await getAccessToken();
    
    const response = await fetch(
      `https://iid.googleapis.com/iid/v1/${token}/rel/topics/${topic}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (response.ok) {
      console.log(`[FCM] Device unsubscribed from topic: ${topic}`);
      return { success: true };
    } else {
      const errorText = await response.text();
      console.error(`[FCM] Failed to unsubscribe from topic ${topic}:`, errorText);
      return { success: false, error: errorText };
    }
  } catch (error) {
    console.error('[FCM] Unsubscribe from topic error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * اشتراك جهاز في عدة topics
 */
async function subscribeToMultipleTopics(token: string, topics: string[]): Promise<{ success: boolean; results: Record<string, boolean> }> {
  const results: Record<string, boolean> = {};
  
  for (const topic of topics) {
    const result = await subscribeToTopic(token, topic);
    results[topic] = result.success;
  }
  
  const allSuccess = Object.values(results).every(r => r);
  return { success: allSuccess, results };
}

export {
  isFcmConfigured,
  sendToDevice,
  sendToMultipleDevices,
  sendToTopic,
  getPushStats,
  categorizeError,
  subscribeToTopic,
  unsubscribeFromTopic,
  subscribeToMultipleTopics,
  FCMMessage,
  FCMResponse,
  BatchFCMResult,
  ErrorCategory,
  LogContext,
};
