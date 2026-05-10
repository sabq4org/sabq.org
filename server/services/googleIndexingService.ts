/**
 * Google Indexing API Service
 * 
 * Notifies Google immediately when articles are published/updated.
 * This enables near-instant indexing for news content.
 * 
 * Requirements:
 * 1. Google Cloud Project with Indexing API enabled
 * 2. Service account with "Owner" permission on Search Console property
 * 3. GOOGLE_INDEXING_CLIENT_EMAIL and GOOGLE_INDEXING_PRIVATE_KEY secrets
 */

import { google } from 'googleapis';

const INDEXING_API_ENDPOINT = 'https://indexing.googleapis.com/v3/urlNotifications:publish';

interface IndexingResult {
  success: boolean;
  url: string;
  error?: string;
  notificationType?: string;
  latestUpdate?: string;
}

let authClient: any = null;
let isConfigured = false;

function getAuthClient() {
  if (authClient) return authClient;
  
  const clientEmail = process.env.GOOGLE_INDEXING_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_INDEXING_PRIVATE_KEY;
  
  if (!clientEmail || !privateKey) {
    console.log('[Google Indexing] Not configured - missing credentials');
    return null;
  }
  
  try {
    // Handle escaped newlines in private key
    const formattedKey = privateKey.replace(/\\n/g, '\n');
    
    authClient = new google.auth.JWT(
      clientEmail,
      undefined,
      formattedKey,
      ['https://www.googleapis.com/auth/indexing']
    );
    
    isConfigured = true;
    console.log('[Google Indexing] ✅ Service configured successfully');
    return authClient;
  } catch (error) {
    console.error('[Google Indexing] Failed to initialize auth client:', error);
    return null;
  }
}

/**
 * Check if Google Indexing API is configured
 */
export function isGoogleIndexingConfigured(): boolean {
  if (isConfigured) return true;
  getAuthClient();
  return isConfigured;
}

/**
 * Notify Google about a URL update (new or updated content)
 */
export async function notifyUrlUpdated(url: string): Promise<IndexingResult> {
  const auth = getAuthClient();
  
  if (!auth) {
    return {
      success: false,
      url,
      error: 'Google Indexing API not configured'
    };
  }
  
  try {
    const accessToken = await auth.getAccessToken();
    
    const response = await fetch(INDEXING_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken.token}`
      },
      body: JSON.stringify({
        url: url,
        type: 'URL_UPDATED'
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[Google Indexing] Failed to notify for ${url}:`, errorData);
      return {
        success: false,
        url,
        error: errorData.error?.message || `HTTP ${response.status}`
      };
    }
    
    const result = await response.json();
    console.log(`[Google Indexing] ✅ Notified Google: ${url}`);
    
    return {
      success: true,
      url,
      notificationType: result.urlNotificationMetadata?.latestUpdate?.type,
      latestUpdate: result.urlNotificationMetadata?.latestUpdate?.notifyTime
    };
  } catch (error) {
    console.error(`[Google Indexing] Error notifying ${url}:`, error);
    return {
      success: false,
      url,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Notify Google about URL deletion
 */
export async function notifyUrlDeleted(url: string): Promise<IndexingResult> {
  const auth = getAuthClient();
  
  if (!auth) {
    return {
      success: false,
      url,
      error: 'Google Indexing API not configured'
    };
  }
  
  try {
    const accessToken = await auth.getAccessToken();
    
    const response = await fetch(INDEXING_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken.token}`
      },
      body: JSON.stringify({
        url: url,
        type: 'URL_DELETED'
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        url,
        error: errorData.error?.message || `HTTP ${response.status}`
      };
    }
    
    const result = await response.json();
    console.log(`[Google Indexing] ✅ Notified Google (deleted): ${url}`);
    
    return {
      success: true,
      url,
      notificationType: 'URL_DELETED',
      latestUpdate: result.urlNotificationMetadata?.latestUpdate?.notifyTime
    };
  } catch (error) {
    return {
      success: false,
      url,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Notify Google about a published article
 * Call this when an article is published or updated
 */
export async function indexArticle(slug: string, locale: 'ar' | 'en' | 'ur' = 'ar'): Promise<IndexingResult> {
  const baseUrl = process.env.FRONTEND_URL || 'https://sabq.org';
  
  let articleUrl: string;
  switch (locale) {
    case 'en':
      articleUrl = `${baseUrl}/en/article/${slug}`;
      break;
    case 'ur':
      articleUrl = `${baseUrl}/ur/article/${slug}`;
      break;
    default:
      articleUrl = `${baseUrl}/article/${slug}`;
  }
  
  return notifyUrlUpdated(articleUrl);
}

/**
 * Batch notify Google about multiple URLs
 * Google Indexing API has a quota of ~200 requests/day for new properties
 */
export async function batchIndexUrls(urls: string[]): Promise<IndexingResult[]> {
  const results: IndexingResult[] = [];
  
  // Process in sequence to avoid rate limiting
  for (const url of urls) {
    const result = await notifyUrlUpdated(url);
    results.push(result);
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  const successful = results.filter(r => r.success).length;
  console.log(`[Google Indexing] Batch complete: ${successful}/${urls.length} successful`);
  
  return results;
}

/**
 * Get indexing status for a URL
 */
export async function getUrlStatus(url: string): Promise<any> {
  const auth = getAuthClient();
  
  if (!auth) {
    return { error: 'Google Indexing API not configured' };
  }
  
  try {
    const accessToken = await auth.getAccessToken();
    
    const response = await fetch(
      `https://indexing.googleapis.com/v3/urlNotifications/metadata?url=${encodeURIComponent(url)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken.token}`
        }
      }
    );
    
    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }
    
    return await response.json();
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
