import { db } from "../db";
import { 
  staffCommunicationGroups, 
  staffCommunicationGroupMembers, 
  staffCommunicationCampaigns,
  staffCommunicationDeliveries,
  users,
  userRoles,
  roles,
  StaffCommunicationGroup,
  StaffCommunicationCampaign,
  InsertStaffCommunicationGroup,
  InsertStaffCommunicationCampaign,
} from "@shared/schema";
import { eq, and, desc, inArray, sql, count, or, ilike, lte } from "drizzle-orm";
import { sendEmailNotification } from "./email";

// Saudi Arabia timezone offset (UTC+3)
const SAUDI_TIMEZONE_OFFSET_HOURS = 3;

/**
 * Checks if a string looks like a datetime-local input (e.g., "2026-01-04T17:10")
 * These strings don't have timezone info and should be interpreted as Saudi time
 */
function isDateTimeLocalFormat(str: string): boolean {
  // datetime-local format: YYYY-MM-DDTHH:MM or YYYY-MM-DDTHH:MM:SS
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(str);
}

/**
 * Converts a datetime-local string (without timezone) from Saudi time to UTC
 * Saudi Arabia is UTC+3 (Arabia Standard Time)
 * @param value - datetime-local format string like "2026-01-04T17:10" or Date object
 * @returns Date object in UTC
 */
function convertScheduledTimeToUTC(value: string | Date | null): Date | null {
  if (!value) return null;
  
  // If it's already a Date object, return as-is (already in UTC)
  if (value instanceof Date) {
    return value;
  }
  
  const strValue = String(value);
  
  // Only convert datetime-local format strings (from user input)
  // These need Saudi -> UTC conversion
  if (isDateTimeLocalFormat(strValue)) {
    // Parse as UTC first, then adjust for Saudi timezone
    // datetime-local "2026-01-04T17:10" means 17:10 Saudi time = 14:10 UTC
    const [datePart, timePart] = strValue.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = timePart.split(':').map(Number);
    
    // Create date in UTC, then subtract Saudi offset
    const utcDate = new Date(Date.UTC(year, month - 1, day, hours - SAUDI_TIMEZONE_OFFSET_HOURS, minutes));
    return utcDate;
  }
  
  // For ISO strings or other formats, parse normally (they include timezone info)
  return new Date(strValue);
}

function getUserDisplayName(user: { firstName?: string | null; lastName?: string | null; email: string }): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  if (user.firstName) return user.firstName;
  if (user.lastName) return user.lastName;
  return user.email;
}

export interface GroupWithMembers extends StaffCommunicationGroup {
  members?: Array<{
    id: string;
    userId: string;
    user: {
      id: string;
      firstName?: string | null;
      lastName?: string | null;
      email: string;
      profileImageUrl?: string | null;
    };
  }>;
}

export interface CampaignWithStats extends StaffCommunicationCampaign {
  createdByUser?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  deliveryStats?: {
    total: number;
    sent: number;
    failed: number;
    pending: number;
  };
}

export class StaffCommunicationsService {
  
  async getGroups(): Promise<GroupWithMembers[]> {
    const groups = await db.query.staffCommunicationGroups.findMany({
      where: eq(staffCommunicationGroups.isActive, true),
      orderBy: [desc(staffCommunicationGroups.createdAt)],
      with: {
        members: {
          with: {
            user: true,
          },
        },
      },
    });
    return groups as GroupWithMembers[];
  }

  async getGroupById(id: string): Promise<GroupWithMembers | null> {
    const group = await db.query.staffCommunicationGroups.findFirst({
      where: eq(staffCommunicationGroups.id, id),
      with: {
        members: {
          with: {
            user: true,
          },
        },
      },
    });
    return group as GroupWithMembers | null;
  }

  async createGroup(data: InsertStaffCommunicationGroup): Promise<StaffCommunicationGroup> {
    const [group] = await db.insert(staffCommunicationGroups).values(data).returning();
    return group;
  }

  async updateGroup(id: string, data: Partial<InsertStaffCommunicationGroup>): Promise<StaffCommunicationGroup | null> {
    const [group] = await db.update(staffCommunicationGroups)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(staffCommunicationGroups.id, id))
      .returning();
    return group || null;
  }

  async deleteGroup(id: string): Promise<boolean> {
    await db.delete(staffCommunicationGroups)
      .where(eq(staffCommunicationGroups.id, id));
    return true;
  }

  async addMemberToGroup(groupId: string, userId: string, addedBy: string): Promise<void> {
    const existing = await db.query.staffCommunicationGroupMembers.findFirst({
      where: and(
        eq(staffCommunicationGroupMembers.groupId, groupId),
        eq(staffCommunicationGroupMembers.userId, userId)
      ),
    });

    if (!existing) {
      await db.insert(staffCommunicationGroupMembers).values({
        groupId,
        userId,
        addedBy,
      });
      
      await db.update(staffCommunicationGroups)
        .set({ 
          memberCount: sql`${staffCommunicationGroups.memberCount} + 1`,
          updatedAt: new Date() 
        })
        .where(eq(staffCommunicationGroups.id, groupId));
    }
  }

  async removeMemberFromGroup(groupId: string, userId: string): Promise<void> {
    await db.delete(staffCommunicationGroupMembers)
      .where(and(
        eq(staffCommunicationGroupMembers.groupId, groupId),
        eq(staffCommunicationGroupMembers.userId, userId)
      ));
    
    await db.update(staffCommunicationGroups)
      .set({ 
        memberCount: sql`GREATEST(${staffCommunicationGroups.memberCount} - 1, 0)`,
        updatedAt: new Date() 
      })
      .where(eq(staffCommunicationGroups.id, groupId));
  }

  async getGroupMembers(groupId: string) {
    const members = await db.query.staffCommunicationGroupMembers.findMany({
      where: eq(staffCommunicationGroupMembers.groupId, groupId),
      with: {
        user: true,
      },
    });
    return members;
  }

  async getCampaigns(status?: string): Promise<CampaignWithStats[]> {
    const whereClause = status ? eq(staffCommunicationCampaigns.status, status) : undefined;
    
    const campaigns = await db.query.staffCommunicationCampaigns.findMany({
      where: whereClause,
      orderBy: [desc(staffCommunicationCampaigns.createdAt)],
      with: {
        createdByUser: true,
      },
    });
    
    return campaigns as CampaignWithStats[];
  }

  async getCampaignById(id: string): Promise<CampaignWithStats | null> {
    const campaign = await db.query.staffCommunicationCampaigns.findFirst({
      where: eq(staffCommunicationCampaigns.id, id),
      with: {
        createdByUser: true,
        deliveries: {
          with: {
            user: true,
          },
        },
      },
    });
    return campaign as CampaignWithStats | null;
  }

  async createCampaign(data: InsertStaffCommunicationCampaign): Promise<StaffCommunicationCampaign> {
    // Convert scheduledAt to UTC, interpreting datetime-local input as Saudi time (UTC+3)
    const scheduledAtDate = convertScheduledTimeToUTC(data.scheduledAt as string | Date | null);
    const processedData = {
      ...data,
      scheduledAt: scheduledAtDate,
      // If scheduledAt is provided, set status to "scheduled" instead of "draft"
      status: scheduledAtDate ? 'scheduled' : (data.status || 'draft'),
    };
    const [campaign] = await db.insert(staffCommunicationCampaigns).values(processedData).returning();
    return campaign;
  }

  async updateCampaign(id: string, data: Partial<InsertStaffCommunicationCampaign>): Promise<StaffCommunicationCampaign | null> {
    // Convert scheduledAt to UTC, interpreting datetime-local input as Saudi time (UTC+3)
    const scheduledAtDate = data.scheduledAt !== undefined 
      ? convertScheduledTimeToUTC(data.scheduledAt as string | Date | null)
      : undefined;
    
    const processedData: Record<string, any> = {
      ...data,
      updatedAt: new Date(),
    };
    
    if (scheduledAtDate !== undefined) {
      processedData.scheduledAt = scheduledAtDate;
      // Update status based on scheduledAt
      if (scheduledAtDate) {
        processedData.status = 'scheduled';
      } else if (!data.status) {
        processedData.status = 'draft';
      }
    }
    
    const [campaign] = await db.update(staffCommunicationCampaigns)
      .set(processedData)
      .where(eq(staffCommunicationCampaigns.id, id))
      .returning();
    return campaign || null;
  }

  async deleteCampaign(id: string): Promise<boolean> {
    await db.delete(staffCommunicationCampaigns)
      .where(eq(staffCommunicationCampaigns.id, id));
    return true;
  }

  async resolveRecipients(campaign: StaffCommunicationCampaign): Promise<Array<{ id: string; email: string; name: string }>> {
    const recipients: Array<{ id: string; email: string; name: string }> = [];
    const seenIds = new Set<string>();

    if (campaign.audienceType === 'groups' && campaign.targetGroups && campaign.targetGroups.length > 0) {
      const members = await db.query.staffCommunicationGroupMembers.findMany({
        where: inArray(staffCommunicationGroupMembers.groupId, campaign.targetGroups as string[]),
        with: {
          user: true,
        },
      });

      for (const member of members) {
        if (member.user && member.user.email && !seenIds.has(member.userId)) {
          seenIds.add(member.userId);
          recipients.push({
            id: member.userId,
            email: member.user.email,
            name: getUserDisplayName(member.user),
          });
        }
      }
    }

    if (campaign.audienceType === 'roles' && campaign.targetRoles && campaign.targetRoles.length > 0) {
      const usersWithRoles = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .innerJoin(userRoles, eq(users.id, userRoles.userId))
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(inArray(roles.id, campaign.targetRoles as string[]));

      for (const user of usersWithRoles) {
        if (user.email && !seenIds.has(user.id)) {
          seenIds.add(user.id);
          recipients.push({
            id: user.id,
            email: user.email,
            name: getUserDisplayName(user),
          });
        }
      }
    }

    if (campaign.audienceType === 'custom' && campaign.targetUserIds && campaign.targetUserIds.length > 0) {
      const selectedUsers = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(inArray(users.id, campaign.targetUserIds as string[]));

      for (const user of selectedUsers) {
        if (user.email && !seenIds.has(user.id)) {
          seenIds.add(user.id);
          recipients.push({
            id: user.id,
            email: user.email,
            name: getUserDisplayName(user),
          });
        }
      }
    }

    return recipients;
  }

  async sendCampaign(campaignId: string): Promise<{ success: boolean; sent: number; failed: number }> {
    const campaign = await this.getCampaignById(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status === 'sent') {
      throw new Error('Campaign already sent');
    }

    await db.update(staffCommunicationCampaigns)
      .set({ status: 'sending' })
      .where(eq(staffCommunicationCampaigns.id, campaignId));

    const recipients = await this.resolveRecipients(campaign);
    let sentCount = 0;
    let failedCount = 0;

    await db.update(staffCommunicationCampaigns)
      .set({ recipientCount: recipients.length })
      .where(eq(staffCommunicationCampaigns.id, campaignId));

    for (const recipient of recipients) {
      try {
        const channels = campaign.channels || ['email'];
        
        if (channels.includes('email')) {
          const personalizedHtml = this.personalizeContent(campaign.contentHtml, recipient);
          
          await sendEmailNotification({
            to: recipient.email,
            subject: campaign.subject,
            html: this.wrapInTemplate(personalizedHtml, campaign.subject),
          });
          
          await db.insert(staffCommunicationDeliveries).values({
            campaignId,
            userId: recipient.id,
            email: recipient.email,
            channel: 'email',
            status: 'sent',
            sentAt: new Date(),
          });
          
          sentCount++;
        }
        
      } catch (error) {
        console.error(`Failed to send to ${recipient.email}:`, error);
        
        await db.insert(staffCommunicationDeliveries).values({
          campaignId,
          userId: recipient.id,
          email: recipient.email,
          channel: 'email',
          status: 'failed',
          failureReason: error instanceof Error ? error.message : 'Unknown error',
        });
        
        failedCount++;
      }
    }

    await db.update(staffCommunicationCampaigns)
      .set({
        status: 'sent',
        sentAt: new Date(),
        sentCount,
        failedCount,
        updatedAt: new Date(),
      })
      .where(eq(staffCommunicationCampaigns.id, campaignId));

    return { success: true, sent: sentCount, failed: failedCount };
  }

  private personalizeContent(html: string, recipient: { name: string; email: string }): string {
    return html
      .replace(/\{\{name\}\}/g, recipient.name)
      .replace(/\{\{email\}\}/g, recipient.email);
  }

  private getFrontendUrl(): string {
    if (process.env.FRONTEND_URL) {
      return process.env.FRONTEND_URL;
    }
    if (process.env.REPLIT_DOMAINS) {
      const domains = process.env.REPLIT_DOMAINS.split(',');
      const primaryDomain = domains[0]?.trim();
      if (primaryDomain) {
        return `https://${primaryDomain}`;
      }
    }
    return 'https://sabq.org';
  }

  private getLogoUrl(): string {
    return `${this.getFrontendUrl()}/branding/sabq-logo.png`;
  }

  public wrapInTemplate(content: string, subject: string): string {
    const BRAND_COLOR = '#1a73e8';
    const BRAND_DARK = '#0d47a1';
    const logoUrl = this.getLogoUrl();
    
    return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap');
    
    body { 
      font-family: 'Tajawal', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
      background-color: #f0f4f8; 
      margin: 0; 
      padding: 0; 
      direction: rtl;
      -webkit-font-smoothing: antialiased;
    }
    
    .wrapper {
      padding: 40px 20px;
    }
    
    .container { 
      max-width: 580px; 
      margin: 0 auto; 
      background: #ffffff; 
      border-radius: 16px; 
      overflow: hidden; 
      box-shadow: 0 10px 40px rgba(0,0,0,0.08);
    }
    
    .header { 
      background: linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%); 
      padding: 32px 24px; 
      text-align: center;
    }
    
    .logo-container {
      display: inline-block;
      background: #ffffff;
      padding: 12px 24px;
      border-radius: 12px;
      margin-bottom: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    
    .header img {
      height: 40px;
      display: block;
    }
    
    .header-text {
      color: rgba(255,255,255,0.95);
      font-size: 20px;
      font-weight: 500;
      margin: 0;
      letter-spacing: -0.3px;
    }
    
    .content { 
      padding: 36px 32px; 
      text-align: right;
      color: #1e293b;
      font-size: 16px;
      line-height: 1.9;
    }
    
    .content p { 
      color: #4a5568; 
      font-size: 16px; 
      line-height: 1.9; 
      margin: 0 0 18px 0;
    }

    .content h1, .content h2, .content h3 {
      color: #1e293b;
      margin-bottom: 16px;
    }

    .content ul, .content ol {
      color: #4a5568;
      padding-right: 20px;
      margin: 12px 0;
    }

    .content li {
      margin-bottom: 8px;
      line-height: 1.8;
    }

    .content strong {
      color: #1e293b;
      font-weight: 600;
    }
    
    .footer { 
      background: #f8fafc; 
      padding: 24px 32px; 
      text-align: center; 
      border-top: 1px solid #e2e8f0;
    }
    
    .footer p {
      color: #94a3b8;
      font-size: 13px;
      margin: 4px 0;
    }
    
    .footer a {
      color: ${BRAND_COLOR};
      text-decoration: none;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo-container">
          <img src="${logoUrl}" alt="سبق" />
        </div>
        <p class="header-text">رسالة من إدارة سبق</p>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>هذه الرسالة موجهة لفريق عمل سبق</p>
        <p style="margin-top: 8px;">
          <a href="https://sabq.org">sabq.org</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `;
  }

  async searchStaffUsers(query: string) {
    const searchResults = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        profileImageUrl: users.profileImageUrl,
      })
      .from(users)
      .innerJoin(userRoles, eq(users.id, userRoles.userId))
      .where(
        or(
          ilike(users.firstName, `%${query}%`),
          ilike(users.lastName, `%${query}%`),
          ilike(users.email, `%${query}%`)
        )
      )
      .limit(20);

    const uniqueUsers = Array.from(
      new Map(searchResults.map(u => [u.id, u])).values()
    );

    return uniqueUsers;
  }

  async getDeliveries(campaignId: string) {
    const deliveries = await db.query.staffCommunicationDeliveries.findMany({
      where: eq(staffCommunicationDeliveries.campaignId, campaignId),
      with: {
        user: true,
      },
      orderBy: [desc(staffCommunicationDeliveries.sentAt)],
    });
    return deliveries;
  }

  async getCampaignStats(campaignId: string) {
    const stats = await db
      .select({
        status: staffCommunicationDeliveries.status,
        count: count(),
      })
      .from(staffCommunicationDeliveries)
      .where(eq(staffCommunicationDeliveries.campaignId, campaignId))
      .groupBy(staffCommunicationDeliveries.status);

    return stats.reduce((acc, s) => {
      acc[s.status] = Number(s.count);
      return acc;
    }, {} as Record<string, number>);
  }

  async getAvailableRoles() {
    const rolesData = await db.select({ 
      id: roles.id, 
      name: roles.name, 
      nameAr: roles.nameAr 
    }).from(roles);
    
    return rolesData;
  }

  async getUsersByRole(roleId: string, groupId?: string) {
    const usersWithRole = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        profileImageUrl: users.profileImageUrl,
      })
      .from(users)
      .innerJoin(userRoles, eq(users.id, userRoles.userId))
      .where(eq(userRoles.roleId, roleId));

    // If groupId provided, mark which users are already members
    if (groupId) {
      const existingMembers = await db.query.staffCommunicationGroupMembers.findMany({
        where: eq(staffCommunicationGroupMembers.groupId, groupId),
      });
      const memberIds = new Set(existingMembers.map(m => m.userId));
      
      return usersWithRole.map(user => ({
        ...user,
        displayName: getUserDisplayName(user),
        isAlreadyMember: memberIds.has(user.id),
      }));
    }

    return usersWithRole.map(user => ({
      ...user,
      displayName: getUserDisplayName(user),
      isAlreadyMember: false,
    }));
  }

  async addMembersToGroup(groupId: string, userIds: string[]) {
    const results = { added: 0, skipped: 0 };
    
    // Use transaction to ensure atomicity
    await db.transaction(async (tx) => {
      for (const userId of userIds) {
        // Use onConflictDoNothing for race-condition safe upsert
        const result = await tx.insert(staffCommunicationGroupMembers)
          .values({ groupId, userId })
          .onConflictDoNothing({ target: [staffCommunicationGroupMembers.groupId, staffCommunicationGroupMembers.userId] })
          .returning({ id: staffCommunicationGroupMembers.id });
        
        if (result.length > 0) {
          results.added++;
        } else {
          results.skipped++;
        }
      }

      // Update the memberCount on the group within the same transaction
      if (results.added > 0) {
        await tx
          .update(staffCommunicationGroups)
          .set({
            memberCount: sql`${staffCommunicationGroups.memberCount} + ${results.added}`,
          })
          .where(eq(staffCommunicationGroups.id, groupId));
      }
    });

    return results;
  }

  async initializeDefaultGroups(createdBy: string) {
    const defaultGroups = [
      { name: 'Reporters', nameAr: 'المراسلون', slug: 'reporters', roleFilter: 'reporter', isRoleBased: true, color: '#3b82f6', icon: 'newspaper' },
      { name: 'Opinion Authors', nameAr: 'كتاب الرأي', slug: 'opinion-authors', roleFilter: 'opinion_author', isRoleBased: true, color: '#8b5cf6', icon: 'pen-tool' },
      { name: 'Content Managers', nameAr: 'مدراء المحتوى', slug: 'content-managers', roleFilter: 'content_manager', isRoleBased: true, color: '#f59e0b', icon: 'settings' },
      { name: 'Editors', nameAr: 'المحررون', slug: 'editors', roleFilter: 'editor', isRoleBased: true, color: '#10b981', icon: 'edit' },
      { name: 'Moderators', nameAr: 'المشرفون', slug: 'moderators', roleFilter: 'moderator', isRoleBased: true, color: '#ef4444', icon: 'shield' },
    ];

    for (const group of defaultGroups) {
      const existing = await db.query.staffCommunicationGroups.findFirst({
        where: eq(staffCommunicationGroups.slug, group.slug),
      });

      if (!existing) {
        await db.insert(staffCommunicationGroups).values({
          ...group,
          createdBy,
        });
      }
    }
  }

  /**
   * Get campaigns that are scheduled and ready to be sent
   */
  async getScheduledCampaignsToSend(): Promise<StaffCommunicationCampaign[]> {
    const now = new Date();
    const campaigns = await db.query.staffCommunicationCampaigns.findMany({
      where: and(
        eq(staffCommunicationCampaigns.status, 'scheduled'),
        lte(staffCommunicationCampaigns.scheduledAt, now)
      ),
    });
    return campaigns;
  }

  /**
   * Process all scheduled campaigns that are ready to be sent
   * Uses atomic status transition to prevent double-firing
   */
  async processScheduledCampaigns(): Promise<{ processed: number; sent: number; failed: number }> {
    const campaigns = await this.getScheduledCampaignsToSend();
    let processed = 0;
    let totalSent = 0;
    let totalFailed = 0;

    for (const campaign of campaigns) {
      try {
        // Atomically transition from 'scheduled' to 'sending' to prevent double-firing
        // Only update if status is still 'scheduled' (not already being processed)
        const [updatedCampaign] = await db.update(staffCommunicationCampaigns)
          .set({ 
            status: 'sending',
            updatedAt: new Date(),
          })
          .where(and(
            eq(staffCommunicationCampaigns.id, campaign.id),
            eq(staffCommunicationCampaigns.status, 'scheduled')
          ))
          .returning();
        
        // If no rows updated, another process already picked it up
        if (!updatedCampaign) {
          console.log(`[StaffComm Scheduler] Campaign ${campaign.id} already being processed, skipping`);
          continue;
        }
        
        console.log(`[StaffComm Scheduler] Sending scheduled campaign: ${campaign.title} (ID: ${campaign.id})`);
        const result = await this.sendCampaign(campaign.id);
        processed++;
        totalSent += result.sent;
        totalFailed += result.failed;
        console.log(`[StaffComm Scheduler] Campaign sent successfully: ${campaign.title}`);
      } catch (error) {
        console.error(`[StaffComm Scheduler] Failed to send campaign ${campaign.id}:`, error);
        
        // Get the campaign's current retry count
        const currentCampaign = await db.query.staffCommunicationCampaigns.findFirst({
          where: eq(staffCommunicationCampaigns.id, campaign.id),
        });
        
        const metadata = (currentCampaign?.metadata as Record<string, any>) || {};
        const retryCount = (metadata.retryCount || 0) + 1;
        const maxRetries = 3;
        
        if (retryCount < maxRetries) {
          // Schedule for retry - set scheduledAt to 5 minutes from now and reset to 'scheduled'
          const retryAt = new Date(Date.now() + 5 * 60 * 1000);
          await db.update(staffCommunicationCampaigns)
            .set({ 
              status: 'scheduled',
              scheduledAt: retryAt,
              metadata: { ...metadata, retryCount, lastError: error instanceof Error ? error.message : 'Unknown error' },
              updatedAt: new Date(),
            })
            .where(eq(staffCommunicationCampaigns.id, campaign.id));
          console.log(`[StaffComm Scheduler] Campaign ${campaign.id} scheduled for retry ${retryCount}/${maxRetries} at ${retryAt.toISOString()}`);
        } else {
          // Max retries reached, mark as failed
          await db.update(staffCommunicationCampaigns)
            .set({ 
              status: 'failed',
              metadata: { ...metadata, retryCount, lastError: error instanceof Error ? error.message : 'Unknown error' },
              updatedAt: new Date(),
            })
            .where(eq(staffCommunicationCampaigns.id, campaign.id));
          console.error(`[StaffComm Scheduler] Campaign ${campaign.id} failed after ${maxRetries} retries`);
          totalFailed++;
        }
      }
    }

    return { processed, sent: totalSent, failed: totalFailed };
  }
}

export const staffCommunicationsService = new StaffCommunicationsService();
