/**
 * MailerLite API Integration Service
 * خدمة التكامل مع MailerLite للنشرة الإخبارية الذكية
 */

const MAILERLITE_API_KEY = process.env.MAILERLITE_API_KEY;
const MAILERLITE_BASE_URL = 'https://connect.mailerlite.com/api';

// Custom field IDs for MailerLite (will be created on first use)
interface MailerLiteSubscriber {
  id: string;
  email: string;
  status: 'active' | 'unsubscribed' | 'unconfirmed' | 'bounced' | 'junk';
  fields: Record<string, string | number | null>;
  groups: { id: string; name: string }[];
  created_at: string;
  updated_at: string;
}

interface MailerLiteGroup {
  id: string;
  name: string;
  active_count: number;
  sent_count: number;
  opens_count: number;
  created_at: string;
}

interface SubscribeOptions {
  email: string;
  firstName?: string;
  lastName?: string;
  language?: 'ar' | 'en' | 'ur';
  interests?: string[];
  persona?: string;
  source?: string;
  groupIds?: string[];
  customFields?: Record<string, string | number>;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Helper function to make API requests to MailerLite
 */
async function mailerliteRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: Record<string, unknown>
): Promise<ApiResponse<T>> {
  if (!MAILERLITE_API_KEY) {
    console.warn('⚠️ MAILERLITE_API_KEY not configured');
    return { success: false, error: 'MailerLite API key not configured' };
  }

  try {
    const response = await fetch(`${MAILERLITE_BASE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${MAILERLITE_API_KEY}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ MailerLite API error (${response.status}):`, data);
      return {
        success: false,
        error: data.message || `API error: ${response.status}`,
      };
    }

    return { success: true, data: data.data || data };
  } catch (error) {
    console.error('❌ MailerLite request failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Request failed',
    };
  }
}

/**
 * Subscribe a new user to MailerLite with interests and persona
 */
export async function subscribeToMailerLite(options: SubscribeOptions): Promise<ApiResponse<MailerLiteSubscriber>> {
  const {
    email,
    firstName,
    lastName,
    language = 'ar',
    interests = [],
    persona,
    source,
    groupIds = [],
    customFields = {},
  } = options;

  // Build custom fields
  const fields: Record<string, string | number> = {
    ...customFields,
    language,
    interests: interests.join(', '),
    source: source || 'website',
  };

  if (firstName) fields.name = firstName;
  if (lastName) fields.last_name = lastName;
  if (persona) fields.persona = persona;

  // Build request body
  const body: Record<string, unknown> = {
    email,
    fields,
    status: 'active', // or 'unconfirmed' for double opt-in
  };

  // Add to groups if specified
  if (groupIds.length > 0) {
    body.groups = groupIds;
  }

  console.log(`📧 Subscribing ${email} to MailerLite...`);
  const result = await mailerliteRequest<MailerLiteSubscriber>('/subscribers', 'POST', body);

  if (result.success) {
    console.log(`✅ Successfully subscribed ${email} to MailerLite`);
  }

  return result;
}

/**
 * Update subscriber information in MailerLite
 */
export async function updateMailerLiteSubscriber(
  subscriberId: string,
  updates: Partial<SubscribeOptions>
): Promise<ApiResponse<MailerLiteSubscriber>> {
  const fields: Record<string, string | number> = {};

  if (updates.firstName) fields.name = updates.firstName;
  if (updates.lastName) fields.last_name = updates.lastName;
  if (updates.language) fields.language = updates.language;
  if (updates.interests) fields.interests = updates.interests.join(', ');
  if (updates.persona) fields.persona = updates.persona;

  const body: Record<string, unknown> = { fields };

  if (updates.groupIds && updates.groupIds.length > 0) {
    body.groups = updates.groupIds;
  }

  console.log(`📝 Updating MailerLite subscriber ${subscriberId}...`);
  return mailerliteRequest<MailerLiteSubscriber>(`/subscribers/${subscriberId}`, 'PUT', body);
}

/**
 * Get subscriber by email from MailerLite
 */
export async function getMailerLiteSubscriber(email: string): Promise<ApiResponse<MailerLiteSubscriber>> {
  console.log(`🔍 Looking up subscriber: ${email}`);
  return mailerliteRequest<MailerLiteSubscriber>(`/subscribers/${encodeURIComponent(email)}`);
}

/**
 * Unsubscribe a user from MailerLite
 */
export async function unsubscribeFromMailerLite(subscriberId: string): Promise<ApiResponse<void>> {
  console.log(`🚫 Unsubscribing ${subscriberId} from MailerLite...`);
  return mailerliteRequest<void>(`/subscribers/${subscriberId}`, 'DELETE');
}

/**
 * Get all groups (lists) from MailerLite
 */
export async function getMailerLiteGroups(): Promise<ApiResponse<MailerLiteGroup[]>> {
  console.log('📋 Fetching MailerLite groups...');
  return mailerliteRequest<MailerLiteGroup[]>('/groups');
}

/**
 * Create a new group in MailerLite
 */
export async function createMailerLiteGroup(name: string): Promise<ApiResponse<MailerLiteGroup>> {
  console.log(`➕ Creating MailerLite group: ${name}`);
  return mailerliteRequest<MailerLiteGroup>('/groups', 'POST', { name });
}

/**
 * Add subscriber to a group
 */
export async function addSubscriberToGroup(subscriberId: string, groupId: string): Promise<ApiResponse<void>> {
  console.log(`➕ Adding subscriber ${subscriberId} to group ${groupId}`);
  return mailerliteRequest<void>(`/subscribers/${subscriberId}/groups/${groupId}`, 'POST');
}

/**
 * Remove subscriber from a group
 */
export async function removeSubscriberFromGroup(subscriberId: string, groupId: string): Promise<ApiResponse<void>> {
  console.log(`➖ Removing subscriber ${subscriberId} from group ${groupId}`);
  return mailerliteRequest<void>(`/subscribers/${subscriberId}/groups/${groupId}`, 'DELETE');
}

/**
 * Process webhook from MailerLite
 */
export interface MailerLiteWebhookEvent {
  type: 'subscriber.created' | 'subscriber.updated' | 'subscriber.unsubscribed' | 'subscriber.bounced' | 'campaign.sent';
  data: {
    subscriber?: MailerLiteSubscriber;
    campaign?: {
      id: string;
      name: string;
    };
  };
  created_at: string;
}

export function parseMailerLiteWebhook(payload: unknown): MailerLiteWebhookEvent | null {
  try {
    const event = payload as MailerLiteWebhookEvent;
    if (!event.type || !event.data) {
      console.warn('⚠️ Invalid MailerLite webhook payload');
      return null;
    }
    return event;
  } catch (error) {
    console.error('❌ Error parsing MailerLite webhook:', error);
    return null;
  }
}

/**
 * Sync user interests/persona to MailerLite
 * Called when user behavior updates their dynamic interests
 */
export async function syncUserInterestsToMailerLite(
  email: string,
  interests: { categoryId?: string; interestId?: string; categoryName?: string; interestName?: string; score: number }[],
  persona?: string
): Promise<ApiResponse<MailerLiteSubscriber>> {
  // Get existing subscriber
  const existingResult = await getMailerLiteSubscriber(email);
  
  if (!existingResult.success || !existingResult.data) {
    console.warn(`⚠️ Subscriber ${email} not found in MailerLite`);
    return { success: false, error: 'Subscriber not found' };
  }

  // Format interests (top 5 by score)
  const topInterests = interests
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(i => i.categoryName || i.interestName || 'Unknown');

  // Update subscriber with new interests
  return updateMailerLiteSubscriber(existingResult.data.id, {
    interests: topInterests,
    persona,
  });
}

/**
 * Check if MailerLite is configured
 */
export function isMailerLiteConfigured(): boolean {
  return !!MAILERLITE_API_KEY;
}

// Log configuration status on load
if (MAILERLITE_API_KEY) {
  console.log('✅ MailerLite service initialized');
} else {
  console.warn('⚠️ MAILERLITE_API_KEY not set - MailerLite features disabled');
}
