import crypto from "crypto";
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  articles,
  editorialNotifications,
  pushDevices,
  roles,
  surveyInvitations,
  surveyQuestions,
  surveyResponses,
  surveys,
  userRoles,
  users,
  type Survey,
  type SurveyQuestion,
} from "@shared/schema";
import { sendEmailNotification } from "./email";
import { createCustomNotificationPayload, isApnsConfigured, sendPushNotification } from "./apnsService";
import { isFcmConfigured, sendToMultipleDevices } from "./fcmService";

export const SURVEY_QUESTION_TYPES = ["single", "multi", "short_text", "long_text", "stars", "scale"] as const;
export type SurveyQuestionType = (typeof SURVEY_QUESTION_TYPES)[number];

export type SurveyQuestionInput = {
  type: SurveyQuestionType;
  text: string;
  hint?: string | null;
  required: boolean;
  options?: string[] | null;
  settings?: { maxChoices?: number; scaleMin?: number; scaleMax?: number; minLabel?: string; maxLabel?: string } | null;
};

export type SurveyInput = {
  title: string;
  purpose?: string | null;
  welcomeTitle?: string | null;
  welcomeMessage?: string | null;
  thankYouTitle?: string | null;
  thankYouMessage?: string | null;
  audienceRoles?: string[] | null;
  audienceUserIds?: string[] | null;
  channels: string[];
  showRecipientStats: boolean;
  closesAt?: Date | null;
  questions: SurveyQuestionInput[];
};

function getFrontendUrl(): string {
  return process.env.FRONTEND_URL || "https://sabq.org";
}

function fullName(user: { firstName: string | null; lastName: string | null; email: string | null }): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || "زميلنا العزيز";
}

// ============ CRUD ============

export async function listSurveys() {
  // لا نعتمد على subselect داخل select: Drizzle كان يُصدر أعمدة بلا alias
  // (?column?) فتُفقد الأعداد في JSON. نجمع العدّ باستعلامات منفصلة ثم ندمج.
  const rows = await db
    .select({
      id: surveys.id,
      title: surveys.title,
      purpose: surveys.purpose,
      status: surveys.status,
      sentAt: surveys.sentAt,
      closesAt: surveys.closesAt,
      createdAt: surveys.createdAt,
    })
    .from(surveys)
    .orderBy(desc(surveys.createdAt));

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);

  const [questionRows, invitationRows] = await Promise.all([
    db
      .select({
        surveyId: surveyQuestions.surveyId,
        count: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(surveyQuestions)
      .where(inArray(surveyQuestions.surveyId, ids))
      .groupBy(surveyQuestions.surveyId),
    db
      .select({
        surveyId: surveyInvitations.surveyId,
        invited: sql<number>`count(*)::int`.mapWith(Number),
        completed: sql<number>`count(*) filter (where ${surveyInvitations.completedAt} is not null)::int`.mapWith(Number),
      })
      .from(surveyInvitations)
      .where(inArray(surveyInvitations.surveyId, ids))
      .groupBy(surveyInvitations.surveyId),
  ]);

  const questionsBySurvey = new Map(questionRows.map((row) => [row.surveyId, row.count]));
  const invitationsBySurvey = new Map(
    invitationRows.map((row) => [row.surveyId, { invited: row.invited, completed: row.completed }]),
  );

  return rows.map((row) => {
    const invitation = invitationsBySurvey.get(row.id);
    return {
      ...row,
      questionsCount: questionsBySurvey.get(row.id) ?? 0,
      invitedCount: invitation?.invited ?? 0,
      completedCount: invitation?.completed ?? 0,
    };
  });
}

export async function getSurveyWithQuestions(surveyId: string): Promise<{ survey: Survey; questions: SurveyQuestion[] } | null> {
  const [survey] = await db.select().from(surveys).where(eq(surveys.id, surveyId)).limit(1);
  if (!survey) return null;
  const questions = await db
    .select()
    .from(surveyQuestions)
    .where(eq(surveyQuestions.surveyId, surveyId))
    .orderBy(surveyQuestions.sortOrder);
  return { survey, questions };
}

export async function createSurvey(input: SurveyInput, createdBy: string) {
  const [survey] = await db
    .insert(surveys)
    .values({
      title: input.title,
      purpose: input.purpose ?? null,
      welcomeTitle: input.welcomeTitle ?? null,
      welcomeMessage: input.welcomeMessage ?? null,
      thankYouTitle: input.thankYouTitle ?? null,
      thankYouMessage: input.thankYouMessage ?? null,
      audienceRoles: input.audienceRoles ?? null,
      audienceUserIds: input.audienceUserIds ?? null,
      channels: input.channels,
      showRecipientStats: input.showRecipientStats,
      closesAt: input.closesAt ?? null,
      createdBy,
    })
    .returning();
  await replaceQuestions(survey.id, input.questions);
  return (await getSurveyWithQuestions(survey.id))!;
}

export async function updateSurvey(surveyId: string, input: SurveyInput) {
  const existing = await getSurveyWithQuestions(surveyId);
  if (!existing) throw new Error("SURVEY_NOT_FOUND");
  await db
    .update(surveys)
    .set({
      title: input.title,
      purpose: input.purpose ?? null,
      welcomeTitle: input.welcomeTitle ?? null,
      welcomeMessage: input.welcomeMessage ?? null,
      thankYouTitle: input.thankYouTitle ?? null,
      thankYouMessage: input.thankYouMessage ?? null,
      audienceRoles: input.audienceRoles ?? null,
      audienceUserIds: input.audienceUserIds ?? null,
      channels: input.channels,
      showRecipientStats: input.showRecipientStats,
      closesAt: input.closesAt ?? null,
      updatedAt: new Date(),
    })
    .where(eq(surveys.id, surveyId));
  // استبدال الأسئلة آمن فقط قبل استلام إجابات؛ بعدها تبقى الأسئلة مجمّدة
  if (existing.survey.status === "draft") {
    await replaceQuestions(surveyId, input.questions);
  }
  return getSurveyWithQuestions(surveyId);
}

async function replaceQuestions(surveyId: string, questions: SurveyQuestionInput[]) {
  await db.delete(surveyQuestions).where(eq(surveyQuestions.surveyId, surveyId));
  if (questions.length === 0) return;
  await db.insert(surveyQuestions).values(
    questions.map((question, index) => ({
      surveyId,
      type: question.type,
      text: question.text,
      hint: question.hint ?? null,
      required: question.required,
      options: question.options ?? null,
      settings: question.settings ?? null,
      sortOrder: index,
    })),
  );
}

export async function closeSurvey(surveyId: string) {
  await db.update(surveys).set({ status: "closed", updatedAt: new Date() }).where(eq(surveys.id, surveyId));
}

export async function deleteSurvey(surveyId: string) {
  await db.delete(surveys).where(eq(surveys.id, surveyId));
}

// ============ الجمهور ============

export type AudienceMember = { id: string; name: string; email: string | null };

/** يجمع المستخدمين حسب الأدوار (عمود users.role القديم + جداول RBAC) والمعرّفات الصريحة. */
export async function resolveAudience(audienceRoles: string[] | null | undefined, audienceUserIds: string[] | null | undefined): Promise<AudienceMember[]> {
  const members = new Map<string, AudienceMember>();

  if (audienceRoles && audienceRoles.length > 0) {
    const roleRows = await db
      .selectDistinct({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .leftJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(
        or(inArray(users.role, audienceRoles), inArray(roles.name, audienceRoles)),
        eq(users.status, "active"),
      ));
    for (const row of roleRows) {
      members.set(row.id, { id: row.id, name: fullName(row), email: row.email });
    }
  }

  if (audienceUserIds && audienceUserIds.length > 0) {
    const idRows = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users)
      .where(inArray(users.id, audienceUserIds));
    for (const row of idRows) {
      members.set(row.id, { id: row.id, name: fullName(row), email: row.email });
    }
  }

  return [...members.values()];
}

export async function searchAudienceUsers(query: string, roleFilter?: string[]) {
  const like = `%${query.trim()}%`;
  const rows = await db
    .selectDistinct({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email, role: users.role })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(
      or(
        sql`${users.firstName} ilike ${like}`,
        sql`${users.lastName} ilike ${like}`,
        sql`${users.email} ilike ${like}`,
      ),
      roleFilter && roleFilter.length > 0
        ? or(inArray(users.role, roleFilter), inArray(roles.name, roleFilter))
        : undefined,
    ))
    .limit(20);
  return rows.map((row) => ({ id: row.id, name: fullName(row), email: row.email, role: row.role }));
}

// ============ الإرسال ============

function surveyInviteEmailHtml(args: { recipientName: string; surveyTitle: string; purpose: string | null; link: string }): string {
  const purposeLine = args.purpose
    ? `<p>هدفنا من هذا الاستطلاع: <strong>${args.purpose}</strong> — ورأيك جزء أساسي من هذه الخطوة.</p>`
    : `<p>رأيك جزء أساسي من قراراتنا القادمة، ونقدّر وقتك في مشاركتنا إياه.</p>`;
  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
        .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #0b486f 0%, #0e6db0 60%, #1e9df1 130%); padding: 40px 20px; text-align: center; }
        .header h1 { color: white; font-size: 26px; margin: 0; font-weight: bold; }
        .content { padding: 40px 30px; text-align: right; }
        .content h2 { color: #333; font-size: 22px; margin-bottom: 16px; }
        .content p { color: #666; font-size: 16px; line-height: 1.8; margin-bottom: 16px; }
        .button { display: inline-block; background: #1e9df1; color: white !important; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 18px; font-weight: bold; margin: 20px 0; }
        .footer { background: #f9f9f9; padding: 24px 30px; text-align: center; color: #999; font-size: 14px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>صحيفة سبق الإلكترونية</h1></div>
        <div class="content">
          <h2>أهلًا ${args.recipientName}،</h2>
          <p>يسعدنا دعوتك للمشاركة في استطلاع «${args.surveyTitle}».</p>
          ${purposeLine}
          <p>الاستطلاع قصير ولن يأخذ من وقتك سوى دقائق، والرابط أدناه خاص بك وحدك:</p>
          <p style="text-align: center;">
            <a href="${args.link}" class="button">المشاركة في الاستطلاع</a>
          </p>
          <p style="color: #999; font-size: 14px;">
            أو انسخ الرابط التالي والصقه في المتصفح:<br>
            <span style="color: #1e9df1; word-break: break-all;">${args.link}</span>
          </p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} صحيفة سبق الإلكترونية</p>
          <p style="font-size: 12px; margin-top: 8px;">وصلتك هذه الرسالة لأنك ضمن المدعوين لهذا الاستطلاع الداخلي</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * اعتماد الاستطلاع وإرسال الدعوات: توكن فريد لكل مدعو + إيميل + إشعار في لوحة الكاتب.
 * إعادة الاستدعاء آمنة — المدعوون السابقون لا يُدعون مرتين.
 */
export async function sendSurvey(surveyId: string): Promise<{ invited: number; emailsSent: number; emailsFailed: number; notified: number }> {
  const data = await getSurveyWithQuestions(surveyId);
  if (!data) throw new Error("SURVEY_NOT_FOUND");
  const { survey, questions } = data;
  if (questions.length === 0) throw new Error("SURVEY_NO_QUESTIONS");

  const audience = await resolveAudience(survey.audienceRoles, survey.audienceUserIds);
  if (audience.length === 0) throw new Error("SURVEY_EMPTY_AUDIENCE");

  const existing = await db
    .select({ userId: surveyInvitations.userId })
    .from(surveyInvitations)
    .where(eq(surveyInvitations.surveyId, surveyId));
  const alreadyInvited = new Set(existing.map((row) => row.userId));
  const newMembers = audience.filter((member) => !alreadyInvited.has(member.id));

  const invitations = newMembers.map((member) => ({
    surveyId,
    userId: member.id,
    token: crypto.randomBytes(24).toString("base64url"),
    email: member.email,
  }));
  if (invitations.length > 0) {
    await db.insert(surveyInvitations).values(invitations);
  }

  await db
    .update(surveys)
    .set({ status: "active", sentAt: survey.sentAt ?? new Date(), updatedAt: new Date() })
    .where(eq(surveys.id, surveyId));

  const frontendUrl = getFrontendUrl();
  const memberById = new Map(newMembers.map((member) => [member.id, member]));
  let emailsSent = 0;
  let emailsFailed = 0;
  let notified = 0;

  for (const invitation of invitations) {
    const member = memberById.get(invitation.userId);
    if (!member) continue;
    const link = `${frontendUrl}/survey/${invitation.token}`;

    if (survey.channels.includes("email") && member.email) {
      const result = await sendEmailNotification({
        to: member.email,
        subject: `دعوة خاصة: ${survey.title}`,
        html: surveyInviteEmailHtml({ recipientName: member.name, surveyTitle: survey.title, purpose: survey.purpose, link }),
        text: `أهلًا ${member.name}،\n\nندعوك للمشاركة في استطلاع «${survey.title}».\nرابطك الخاص: ${link}\n\nصحيفة سبق`,
      });
      if (result.success) {
        emailsSent += 1;
        await db.update(surveyInvitations).set({ emailStatus: "sent" }).where(eq(surveyInvitations.token, invitation.token));
      } else {
        emailsFailed += 1;
        await db.update(surveyInvitations).set({ emailStatus: "failed" }).where(eq(surveyInvitations.token, invitation.token));
      }
    } else {
      await db.update(surveyInvitations).set({ emailStatus: "skipped" }).where(eq(surveyInvitations.token, invitation.token));
    }

    if (survey.channels.includes("dashboard")) {
      const title = `استطلاع جديد: ${survey.title}`;
      const body = survey.purpose
        ? `نأمل منك تعبئة الاستطلاع لمساعدتنا في ${survey.purpose}. رابطك الخاص جاهز.`
        : "نأمل منك تعبئة الاستطلاع؛ رأيك يساعدنا على التطوير. رابطك الخاص جاهز.";
      // عرف المنصة للروابط العميقة (iOS/أندرويد)؛ واجهة الويب تحوّله إلى /survey/<token>
      const deepLink = `sabq://survey/${invitation.token}`;
      const [notificationRow] = await db.insert(editorialNotifications).values({
        userId: invitation.userId,
        type: "survey_invite",
        title,
        body,
        deepLink,
        deliveryStatus: "pending",
      }).returning({ id: editorialNotifications.id });
      await pushSurveyInvite(invitation.userId, notificationRow.id, title, body, deepLink);
      await db.update(surveyInvitations).set({ notifiedAt: new Date() }).where(eq(surveyInvitations.token, invitation.token));
      notified += 1;
    }
  }

  return { invited: invitations.length, emailsSent, emailsFailed, notified };
}

/** إرسال دفع فعلي للدعوة: APNs لأجهزة iOS وFCM لأندرويد، مع تحديث حالة التسليم على صف الإشعار. */
async function pushSurveyInvite(userId: string, notificationId: string, title: string, body: string, deepLink: string): Promise<void> {
  try {
    const devices = await db
      .select({ token: pushDevices.deviceToken, provider: pushDevices.tokenProvider, platform: pushDevices.platform })
      .from(pushDevices)
      .where(and(eq(pushDevices.userId, userId), eq(pushDevices.isActive, true)));

    const apnsTokens = devices.filter((device) => device.platform === "ios" && device.provider === "apns").map((device) => device.token);
    const fcmTokens = devices.filter((device) => device.platform === "android" && device.provider === "fcm").map((device) => device.token);

    if (apnsTokens.length === 0 && fcmTokens.length === 0) {
      await db.update(editorialNotifications).set({ deliveryStatus: "no_device" }).where(eq(editorialNotifications.id, notificationId));
      return;
    }

    let sent = 0;
    const errors: string[] = [];

    if (apnsTokens.length > 0) {
      if (isApnsConfigured()) {
        const results = await Promise.all(apnsTokens.map((token) =>
          sendPushNotification(
            token,
            createCustomNotificationPayload(title, body, {
              deeplink: deepLink,
              type: "survey_invite",
              category: "SURVEY_INVITE",
              priority: "active",
            }),
            { priority: "10", pushType: "alert" },
          ),
        ));
        sent += results.filter((result) => result.success).length;
        errors.push(...results.filter((result) => !result.success).map((result) => result.reason || "apns_unknown"));
      } else {
        errors.push("APNS_NOT_CONFIGURED");
      }
    }

    if (fcmTokens.length > 0) {
      if (isFcmConfigured()) {
        const batch = await sendToMultipleDevices(fcmTokens, {
          title,
          body,
          data: { deeplink: deepLink, type: "survey_invite" },
        });
        sent += batch.successCount;
        if (batch.failureCount > 0) errors.push(`fcm_failed:${batch.failureCount}`);
      } else {
        errors.push("FCM_NOT_CONFIGURED");
      }
    }

    await db.update(editorialNotifications)
      .set({ deliveryStatus: sent > 0 ? "sent" : "failed", deliveryError: sent > 0 ? null : errors.join("; ") })
      .where(eq(editorialNotifications.id, notificationId));
  } catch (error) {
    // الدفع أفضل-جهد — الدعوة نفسها (إيميل + سجل الإشعار) لا تتأثر بفشله
    console.warn("[Surveys] push invite failed:", error);
  }
}

/** دعوات المستخدم المفتوحة — لبطاقة «لديك استطلاع بانتظارك» في التطبيقات. */
export async function getOpenInvitationsForUser(userId: string) {
  const rows = await db
    .select({
      token: surveyInvitations.token,
      invitedAt: surveyInvitations.createdAt,
      openedAt: surveyInvitations.openedAt,
      surveyTitle: surveys.title,
      purpose: surveys.purpose,
      closesAt: surveys.closesAt,
      questionsCount: sql<number>`(select count(*)::int from survey_questions q where q.survey_id = ${surveys.id})`
        .mapWith(Number)
        .as("questionsCount"),
    })
    .from(surveyInvitations)
    .innerJoin(surveys, eq(surveys.id, surveyInvitations.surveyId))
    .where(and(
      eq(surveyInvitations.userId, userId),
      isNull(surveyInvitations.completedAt),
      eq(surveys.status, "active"),
    ))
    .orderBy(desc(surveyInvitations.createdAt));
  const now = new Date();
  return rows
    .filter((row) => !row.closesAt || row.closesAt > now)
    .map((row) => ({
      token: row.token,
      title: row.surveyTitle,
      purpose: row.purpose,
      questionsCount: row.questionsCount,
      invitedAt: row.invitedAt,
      opened: row.openedAt != null,
      url: `${getFrontendUrl()}/survey/${row.token}`,
    }));
}

// ============ الصفحة العامة ============

async function getRecipientStats(userId: string) {
  const [row] = await db
    .select({
      publishedCount: sql<number>`count(*)::int`,
      totalViews: sql<number>`coalesce(sum(${articles.views}), 0)::int`,
      firstPublishedAt: sql<string | null>`min(${articles.publishedAt})`,
    })
    .from(articles)
    .where(and(
      or(eq(articles.authorId, userId), eq(articles.submitterId, userId)),
      eq(articles.status, "published"),
    ));
  if (!row || row.publishedCount === 0) return null;
  return {
    publishedCount: row.publishedCount,
    totalViews: row.totalViews,
    sinceYear: row.firstPublishedAt ? new Date(row.firstPublishedAt).getFullYear() : null,
  };
}

export async function getPublicSurveyByToken(token: string) {
  const [invitation] = await db.select().from(surveyInvitations).where(eq(surveyInvitations.token, token)).limit(1);
  if (!invitation) return null;
  const data = await getSurveyWithQuestions(invitation.surveyId);
  if (!data) return null;
  const { survey, questions } = data;

  const [recipient] = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(users)
    .where(eq(users.id, invitation.userId))
    .limit(1);

  if (!invitation.openedAt) {
    await db.update(surveyInvitations).set({ openedAt: new Date() }).where(eq(surveyInvitations.id, invitation.id));
  }

  const closed = survey.status === "closed" || (survey.closesAt ? survey.closesAt < new Date() : false);

  return {
    survey: {
      title: survey.title,
      purpose: survey.purpose,
      welcomeTitle: survey.welcomeTitle,
      welcomeMessage: survey.welcomeMessage,
      thankYouTitle: survey.thankYouTitle,
      thankYouMessage: survey.thankYouMessage,
      status: closed ? "closed" : survey.status,
    },
    questions: questions.map((question) => ({
      id: question.id,
      type: question.type,
      text: question.text,
      hint: question.hint,
      required: question.required,
      options: question.options,
      settings: question.settings,
    })),
    recipient: {
      name: recipient ? fullName(recipient) : "زميلنا العزيز",
      stats: survey.showRecipientStats && recipient ? await getRecipientStats(recipient.id) : null,
    },
    alreadyCompleted: invitation.completedAt != null,
  };
}

function isValidAnswer(question: SurveyQuestion, value: unknown): boolean {
  const optionsCount = question.options?.length ?? 0;
  switch (question.type) {
    case "single":
      return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < optionsCount;
    case "multi": {
      if (!Array.isArray(value) || value.length === 0) return false;
      const maxChoices = question.settings?.maxChoices ?? optionsCount;
      if (value.length > maxChoices) return false;
      return value.every((item) => typeof item === "number" && Number.isInteger(item) && item >= 0 && item < optionsCount)
        && new Set(value).size === value.length;
    }
    case "stars":
      return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
    case "scale": {
      const min = question.settings?.scaleMin ?? 0;
      const max = question.settings?.scaleMax ?? 10;
      return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
    }
    case "short_text":
      return typeof value === "string" && value.trim().length > 0 && value.length <= 500;
    case "long_text":
      return typeof value === "string" && value.trim().length > 0 && value.length <= 5000;
    default:
      return false;
  }
}

export async function submitSurveyResponse(token: string, answers: Record<string, unknown>, durationSeconds?: number) {
  const [invitation] = await db.select().from(surveyInvitations).where(eq(surveyInvitations.token, token)).limit(1);
  if (!invitation) throw new Error("INVITATION_NOT_FOUND");
  if (invitation.completedAt) throw new Error("ALREADY_COMPLETED");

  const data = await getSurveyWithQuestions(invitation.surveyId);
  if (!data) throw new Error("SURVEY_NOT_FOUND");
  if (data.survey.status !== "active") throw new Error("SURVEY_NOT_ACTIVE");
  if (data.survey.closesAt && data.survey.closesAt < new Date()) throw new Error("SURVEY_NOT_ACTIVE");

  const cleanAnswers: Record<string, number | number[] | string> = {};
  for (const question of data.questions) {
    const value = answers[question.id];
    if (value === undefined || value === null || value === "") {
      if (question.required) throw new Error("MISSING_REQUIRED_ANSWER");
      continue;
    }
    if (!isValidAnswer(question, value)) throw new Error("INVALID_ANSWER");
    cleanAnswers[question.id] = (typeof value === "string" ? value.trim() : value) as number | number[] | string;
  }

  await db.insert(surveyResponses).values({
    surveyId: invitation.surveyId,
    invitationId: invitation.id,
    userId: invitation.userId,
    answers: cleanAnswers,
    durationSeconds: durationSeconds ?? null,
  });
  await db.update(surveyInvitations).set({ completedAt: new Date() }).where(eq(surveyInvitations.id, invitation.id));

  return {
    thankYouTitle: data.survey.thankYouTitle,
    thankYouMessage: data.survey.thankYouMessage,
  };
}

// ============ النتائج ============

export async function getSurveyResults(surveyId: string) {
  const data = await getSurveyWithQuestions(surveyId);
  if (!data) return null;
  const { survey, questions } = data;

  const [responses, invitationTotals] = await Promise.all([
    db
      .select({
        answers: surveyResponses.answers,
        submittedAt: surveyResponses.submittedAt,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(surveyResponses)
      .leftJoin(users, eq(users.id, surveyResponses.userId))
      .where(eq(surveyResponses.surveyId, surveyId))
      .orderBy(desc(surveyResponses.submittedAt)),
    db
      .select({
        invited: sql<number>`count(*)::int`,
        opened: sql<number>`count(*) filter (where ${surveyInvitations.openedAt} is not null)::int`,
        completed: sql<number>`count(*) filter (where ${surveyInvitations.completedAt} is not null)::int`,
      })
      .from(surveyInvitations)
      .where(eq(surveyInvitations.surveyId, surveyId)),
  ]);

  const totals = invitationTotals[0] ?? { invited: 0, opened: 0, completed: 0 };

  const questionResults = questions.map((question) => {
    const values = responses
      .map((response) => response.answers?.[question.id])
      .filter((value) => value !== undefined && value !== null && value !== "");

    if (question.type === "single" || question.type === "multi") {
      const counts = (question.options ?? []).map(() => 0);
      for (const value of values) {
        const indices = Array.isArray(value) ? value : [value];
        for (const index of indices) {
          if (typeof index === "number" && counts[index] !== undefined) counts[index] += 1;
        }
      }
      return { id: question.id, type: question.type, text: question.text, options: question.options, settings: question.settings, answered: values.length, counts };
    }

    if (question.type === "stars" || question.type === "scale") {
      const numbers = values.filter((value): value is number => typeof value === "number");
      const distribution: Record<number, number> = {};
      for (const value of numbers) distribution[value] = (distribution[value] ?? 0) + 1;
      const average = numbers.length > 0 ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
      return {
        id: question.id, type: question.type, text: question.text, options: question.options, settings: question.settings,
        answered: numbers.length,
        average: average != null ? Math.round(average * 10) / 10 : null,
        distribution,
      };
    }

    const textAnswers = responses
      .filter((response) => {
        const value = response.answers?.[question.id];
        return typeof value === "string" && value.trim().length > 0;
      })
      .map((response) => ({
        value: response.answers[question.id] as string,
        userName: fullName(response),
        submittedAt: response.submittedAt,
      }));
    return { id: question.id, type: question.type, text: question.text, options: question.options, settings: question.settings, answered: textAnswers.length, textAnswers };
  });

  return {
    survey: {
      id: survey.id,
      title: survey.title,
      purpose: survey.purpose,
      status: survey.status,
      sentAt: survey.sentAt,
      closesAt: survey.closesAt,
    },
    totals: {
      invited: totals.invited,
      opened: totals.opened,
      completed: totals.completed,
      completionRate: totals.invited > 0 ? Math.round((totals.completed / totals.invited) * 100) : 0,
    },
    questions: questionResults,
  };
}

/** يجهّز حزمة مدمجة من النتائج لإرسالها لنموذج التحليل. */
export async function getResultsForAnalysis(surveyId: string) {
  const results = await getSurveyResults(surveyId);
  if (!results) return null;
  return {
    title: results.survey.title,
    purpose: results.survey.purpose,
    totals: results.totals,
    questions: results.questions.map((question) => {
      if ("counts" in question) {
        return {
          type: question.type,
          text: question.text,
          answered: question.answered,
          optionCounts: (question.options ?? []).map((option, index) => ({ option, count: question.counts?.[index] ?? 0 })),
        };
      }
      if ("average" in question) {
        return { type: question.type, text: question.text, answered: question.answered, average: question.average, distribution: question.distribution };
      }
      return {
        type: question.type,
        text: question.text,
        answered: question.answered,
        answers: (question.textAnswers ?? []).map((answer) => answer.value).slice(0, 200),
      };
    }),
  };
}

export async function getSurveyInvitationsAdmin(surveyId: string) {
  const rows = await db
    .select({
      id: surveyInvitations.id,
      userId: surveyInvitations.userId,
      email: surveyInvitations.email,
      emailStatus: surveyInvitations.emailStatus,
      notifiedAt: surveyInvitations.notifiedAt,
      openedAt: surveyInvitations.openedAt,
      completedAt: surveyInvitations.completedAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(surveyInvitations)
    .leftJoin(users, eq(users.id, surveyInvitations.userId))
    .where(eq(surveyInvitations.surveyId, surveyId))
    .orderBy(desc(isNotNull(surveyInvitations.completedAt)), desc(surveyInvitations.createdAt));
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    name: fullName({ firstName: row.firstName, lastName: row.lastName, email: row.email }),
    email: row.email,
    emailStatus: row.emailStatus,
    notifiedAt: row.notifiedAt,
    openedAt: row.openedAt,
    completedAt: row.completedAt,
  }));
}
