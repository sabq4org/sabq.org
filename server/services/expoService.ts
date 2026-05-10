/**
 * Expo Push Notification Service
 * 
 * Handles sending push notifications to devices using Expo Push API
 * For devices that register with ExponentPushToken format
 */

import fetch from 'node-fetch';

// ============================================================================
// Types
// ============================================================================

interface ExpoMessage {
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
}

interface ExpoResponse {
  success: boolean;
  ticketId?: string;
  error?: string;
  errorCategory?: ExpoErrorCategory;
}

interface BatchExpoResult {
  successCount: number;
  failureCount: number;
  results: Array<{
    token: string;
    success: boolean;
    ticketId?: string;
    error?: string;
    errorCategory?: ExpoErrorCategory;
  }>;
}

type ExpoErrorCategory = 
  | 'invalid_token'
  | 'device_not_registered'
  | 'message_too_big'
  | 'message_rate_exceeded'
  | 'invalid_credentials'
  | 'server_error'
  | 'unknown';

// ============================================================================
// Expo Push API
// ============================================================================

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Check if a token is an Expo Push Token
 */
export function isExpoToken(token: string): boolean {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

/**
 * Send notification to a single Expo device
 */
export async function sendToExpoDevice(
  token: string,
  message: ExpoMessage
): Promise<ExpoResponse> {
  try {
    const expoMessage: any = {
      to: token,
      title: message.title,
      body: message.body,
      sound: 'default',
      priority: 'high',
      data: message.data || {},
    };

    if (message.imageUrl) {
      expoMessage.data.imageUrl = message.imageUrl;
    }

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(expoMessage),
    });

    const result = await response.json() as any;

    if (result.data) {
      const ticket = result.data;
      
      if (ticket.status === 'ok') {
        console.log(`[Expo] Sent successfully to ${token.substring(0, 30)}... ticket: ${ticket.id}`);
        return { success: true, ticketId: ticket.id };
      } else {
        const errorCategory = categorizeExpoError(ticket.message, ticket.details?.error);
        console.error(`[Expo] Send failed: ${ticket.message} [${errorCategory}]`);
        return { 
          success: false, 
          error: ticket.message,
          errorCategory 
        };
      }
    }

    console.error('[Expo] Unexpected response format:', result);
    return { success: false, error: 'Unexpected response format', errorCategory: 'unknown' };
  } catch (error: any) {
    console.error('[Expo] Send error:', error.message);
    return { 
      success: false, 
      error: error.message,
      errorCategory: 'server_error' 
    };
  }
}

/**
 * Send notifications to multiple Expo devices
 */
export async function sendToMultipleExpoDevices(
  tokens: string[],
  message: ExpoMessage
): Promise<BatchExpoResult> {
  const startTime = Date.now();
  
  console.log(`[Expo] Starting batch send to ${tokens.length} devices...`);
  
  if (tokens.length === 0) {
    return { successCount: 0, failureCount: 0, results: [] };
  }

  const results: BatchExpoResult['results'] = [];
  let successCount = 0;
  let failureCount = 0;

  // Expo API supports up to 100 messages per request
  const batchSize = 100;
  
  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(tokens.length / batchSize);
    
    console.log(`[Expo] Processing batch ${batchNum}/${totalBatches} (${batch.length} devices)...`);
    
    try {
      const messages = batch.map(token => ({
        to: token,
        title: message.title,
        body: message.body,
        sound: 'default' as const,
        priority: 'high' as const,
        data: {
          ...(message.data || {}),
          ...(message.imageUrl ? { imageUrl: message.imageUrl } : {}),
        },
      }));

      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      const result = await response.json() as any;

      if (result.data && Array.isArray(result.data)) {
        result.data.forEach((ticket: any, index: number) => {
          const token = batch[index];
          
          if (ticket.status === 'ok') {
            successCount++;
            results.push({
              token,
              success: true,
              ticketId: ticket.id,
            });
          } else {
            failureCount++;
            const errorCategory = categorizeExpoError(ticket.message, ticket.details?.error);
            results.push({
              token,
              success: false,
              error: ticket.message,
              errorCategory,
            });
          }
        });
      } else {
        // Unexpected response, mark all as failed
        batch.forEach(token => {
          failureCount++;
          results.push({
            token,
            success: false,
            error: 'Unexpected API response',
            errorCategory: 'unknown',
          });
        });
      }
    } catch (error: any) {
      console.error(`[Expo] Batch ${batchNum} error:`, error.message);
      batch.forEach(token => {
        failureCount++;
        results.push({
          token,
          success: false,
          error: error.message,
          errorCategory: 'server_error',
        });
      });
    }

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < tokens.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  const duration = Date.now() - startTime;
  console.log(`[Expo] Batch send completed in ${duration}ms: ${successCount} success, ${failureCount} failed`);

  return { successCount, failureCount, results };
}

/**
 * Categorize Expo error for proper handling
 */
function categorizeExpoError(message?: string, errorCode?: string): ExpoErrorCategory {
  if (!message && !errorCode) return 'unknown';
  
  const combined = `${message || ''} ${errorCode || ''}`.toLowerCase();
  
  if (combined.includes('devicenotregistered') || combined.includes('device not registered')) {
    return 'device_not_registered';
  }
  if (combined.includes('invalidcredentials') || combined.includes('invalid credentials')) {
    return 'invalid_credentials';
  }
  if (combined.includes('messagetobig') || combined.includes('too big')) {
    return 'message_too_big';
  }
  if (combined.includes('messagerateexceeded') || combined.includes('rate exceeded')) {
    return 'message_rate_exceeded';
  }
  if (combined.includes('invalid') && combined.includes('token')) {
    return 'invalid_token';
  }
  
  return 'unknown';
}

export { ExpoMessage, ExpoResponse, BatchExpoResult };
