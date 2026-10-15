import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { getEffectiveUserPermissions, getRoleAssignmentAuthority, getUserRoleNames } from "../rbac";
import { canAssignRole } from "@shared/rbac-constants";
import {
  canUserLogin,
  botPublisherTokens,
  users,
  type User,
} from "@shared/schema";
import {
  BOT_PUBLISHER_TOKEN_DEFAULT_EXPIRY_DAYS,
  BOT_PUBLISHER_TOKEN_PREFIX,
  type BotPublisherCapability,
  type BotPublisherPrincipal,
  normalizeBotPublisherEmail,
  isBotPublisherToken,
  type IssueBotPublisherTokenInput,
} from "@shared/botPublisherTokens";
import {
  getPublishingGate,
  resolvePublisherForUser,
  trustedPublisherCanPublish,
} from "./publisherPortalService";

const DAY_MS = 24 * 60 * 60 * 1000;

export class BotPublisherTokenError extends Error {
  constructor(
    message: string,
    public readonly code: "USER_NOT_FOUND" | "USER_UNAVAILABLE" | "TOKEN_NOT_FOUND" | "TOKEN_REVOKED" | "INVALID_INPUT",
    public readonly status = code === "TOKEN_NOT_FOUND" || code === "TOKEN_REVOKED" ? 404 : 400,
  ) {
    super(message);
    this.name = "BotPublisherTokenError";
  }
}

export type IssuedBotPublisherToken = {
  tokenId: string;
  token: string;
  tokenPrefix: string;
  email: string;
  name: string;
  user: { id: string; email: string; name: string };
  label: string | null;
  expiresAt: Date;
};

export type BotPublisherTokenListItem = {
  id: string;
  userId: string;
  email: string;
  name: string;
  tokenPrefix: string;
  label: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  lastUsedAt: Date | null;
};

type RequiredIssuer =
  | { issuedByUserId: string; issuerUserId?: never }
  | { issuerUserId: string; issuedByUserId?: never };

type IssueOptions = IssueBotPublisherTokenInput & RequiredIssuer;

function hashBotPublisherToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function generateBotPublisherToken(): string {
  return `${BOT_PUBLISHER_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

function displayName(user: Pick<User, "id" | "firstName" | "lastName" | "email">): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || user.id;
}

/**
 * The shared login helper intentionally treats some legacy status values as
 * expired/clearable. Personal publisher credentials need a stricter boundary:
 * an explicit deleted/locked account is never a token principal, while an
 * expired temporary suspension/lock follows the existing account semantics.
 */
export function canUsePersonalTokenAccount(user: User): boolean {
  if (user.status === "deleted" || user.status === "locked") return false;
  if (user.status === "suspended" && (!user.suspendedUntil || user.suspendedUntil > new Date())) return false;
  return canUserLogin(user);
}

async function findUserByEmail(email: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalizeBotPublisherEmail(email)}`)
    .limit(1);
  return user ?? null;
}

async function findActiveToken(tokenId: string) {
  const [row] = await db
    .select({ token: botPublisherTokens, user: users })
    .from(botPublisherTokens)
    .innerJoin(users, eq(botPublisherTokens.userId, users.id))
    .where(
      and(
        eq(botPublisherTokens.id, tokenId),
        isNull(botPublisherTokens.revokedAt),
        gt(botPublisherTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function capabilitiesForUser(userId: string, knownGate?: Awaited<ReturnType<typeof getPublishingGate>>): Promise<BotPublisherCapability[]> {
  const permissions = await getEffectiveUserPermissions(userId);
  const has = (permission: string) => permissions.includes("*") || permissions.includes(permission);
  const hasEdit = has("articles.edit_own") || has("articles.edit_any");
  const capabilities: BotPublisherCapability[] = [];

  if (has("articles.create")) capabilities.push("create");
  if (hasEdit) capabilities.push("edit", "ready");
  if (has("media.upload")) capabilities.push("upload");
  if (has("articles.view")) capabilities.push("read");
  if (has("articles.publish")) capabilities.push("publish");
  else if (await trustedPublisherCanPublish(userId, knownGate)) capabilities.push("publish");
  if (has("articles.schedule") && (has("articles.publish") || capabilities.includes("publish"))) {
    capabilities.push("schedule", "reschedule", "cancelSchedule");
  }
  // The existing dashboard archive endpoint accepts either archive or delete;
  // the bot action itself only archives and never deletes permanently.
  if (has("articles.archive") || has("articles.delete")) capabilities.push("archive");
  if (has("articles.feature")) capabilities.push("featured", "unfeatured");
  if (has("articles.news_type")) capabilities.push("breaking", "regular");
  if (has("articles.hide_homepage")) capabilities.push("hide", "show");

  return capabilities;
}

async function principalFromTokenRow(row: Awaited<ReturnType<typeof findActiveToken>>): Promise<BotPublisherPrincipal | null> {
  if (!row || !canUsePersonalTokenAccount(row.user)) return null;

  const publisher = await resolvePublisherForUser(row.user.id);
  const gate = await getPublishingGate(row.user.id);
  // A suspended or expired agency must lose the personal bot identity as a
  // whole, including create/edit/read, until the existing portal gate opens.
  if (!gate.allowed) return null;
  const capabilities = await capabilitiesForUser(row.user.id, gate);
  return {
    userId: row.user.id,
    tokenId: row.token.id,
    email: row.user.email ?? "",
    name: displayName(row.user),
    expiresAt: row.token.expiresAt,
    capabilities,
    ...(publisher ? { publisherId: publisher.id, publisherOwnerUserId: publisher.userId } : {}),
  };
}

/** Authenticate one raw botpub_* value. Never pass a shared/global bot token here. */
export async function authenticatePublisherToken(rawToken: string): Promise<BotPublisherPrincipal | null> {
  if (typeof rawToken !== "string" || !isBotPublisherToken(rawToken)) return null;
  const tokenHash = hashBotPublisherToken(rawToken);
  const [row] = await db
    .select({ token: botPublisherTokens, user: users })
    .from(botPublisherTokens)
    .innerJoin(users, eq(botPublisherTokens.userId, users.id))
    .where(
      and(
        eq(botPublisherTokens.tokenHash, tokenHash),
        isNull(botPublisherTokens.revokedAt),
        gt(botPublisherTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const principal = await principalFromTokenRow(row ?? null);
  if (principal) {
    // Usage telemetry must never contain the raw credential. A failed telemetry
    // write must not turn a valid authenticated request into a 5xx response.
    void db
      .update(botPublisherTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(botPublisherTokens.id, principal.tokenId))
      .catch(() => undefined);
  }
  return principal;
}

/** Re-check an already recorded token id for scheduled/background work. */
export async function authenticatePublisherTokenId(tokenId: string): Promise<BotPublisherPrincipal | null> {
  if (!tokenId) return null;
  return principalFromTokenRow(await findActiveToken(tokenId));
}

/** Alias used by worker integrations that speak in terms of resolving identity. */
export const resolvePublisherPrincipal = authenticatePublisherTokenId;

export async function verifyBotPublisherLogin(email: string, rawToken: string): Promise<BotPublisherPrincipal | null> {
  const principal = await authenticatePublisherToken(rawToken);
  return principal && normalizeBotPublisherEmail(principal.email) === normalizeBotPublisherEmail(email)
    ? principal
    : null;
}

function expiryDate(expiresInDays?: number): Date {
  const days = expiresInDays ?? BOT_PUBLISHER_TOKEN_DEFAULT_EXPIRY_DAYS;
  return new Date(Date.now() + days * DAY_MS);
}

function toIssuedToken(row: { id: string; label: string | null; expiresAt: Date }, user: User, rawToken: string): IssuedBotPublisherToken {
  const email = user.email ?? "";
  const name = displayName(user);
  return {
    tokenId: row.id,
    token: rawToken,
    tokenPrefix: rawToken.slice(0, 16),
    email,
    name,
    user: { id: user.id, email, name },
    label: row.label,
    expiresAt: row.expiresAt,
  };
}

async function assertTokenIssueAuthority(issuerUserId: string | undefined, targetUserId: string): Promise<void> {
  if (!issuerUserId?.trim()) {
    throw new BotPublisherTokenError("هوية مُصدر الاعتماد مطلوبة", "USER_UNAVAILABLE", 403);
  }
  const [authority, targetRoles] = await Promise.all([
    getRoleAssignmentAuthority(issuerUserId),
    getUserRoleNames(targetUserId),
  ]);
  // A token delegates the target's existing powers, so the issuer must be
  // able to assign every role the target already has. This also blocks a
  // custom system.manage_settings holder whose role-assignment authority is
  // empty, including when the target is an ordinary publisher/editor.
  if (targetRoles.length === 0 || targetRoles.some((role) => !canAssignRole(authority, role))) {
    throw new BotPublisherTokenError("لا تملك صلاحية إصدار اعتماد لهذا الحساب", "USER_UNAVAILABLE", 403);
  }
}

export async function issueBotPublisherToken(input: IssueOptions): Promise<IssuedBotPublisherToken> {
  const user = await findUserByEmail(input.email);
  if (!user) throw new BotPublisherTokenError("لا يوجد حساب بهذا البريد", "USER_NOT_FOUND");
  if (!canUsePersonalTokenAccount(user)) throw new BotPublisherTokenError("حساب المستخدم غير متاح لتسجيل الدخول", "USER_UNAVAILABLE");
  await assertTokenIssueAuthority(input.issuedByUserId ?? input.issuerUserId, user.id);

  const rawToken = generateBotPublisherToken();
  const expiresAt = expiryDate(input.expiresInDays);
  const [row] = await db
    .insert(botPublisherTokens)
    .values({
      userId: user.id,
      tokenHash: hashBotPublisherToken(rawToken),
      tokenPrefix: rawToken.slice(0, 16),
      label: input.label?.trim() || null,
      expiresAt,
      issuedBy: input.issuedByUserId ?? input.issuerUserId ?? null,
    })
    .returning({ id: botPublisherTokens.id, label: botPublisherTokens.label, expiresAt: botPublisherTokens.expiresAt });

  if (!row) throw new Error("تعذر إنشاء توكن الناشر");
  return toIssuedToken(row, user, rawToken);
}

export async function listBotPublisherTokens(): Promise<BotPublisherTokenListItem[]> {
  const rows = await db
    .select({ token: botPublisherTokens, user: users })
    .from(botPublisherTokens)
    .innerJoin(users, eq(botPublisherTokens.userId, users.id))
    .orderBy(sql`${botPublisherTokens.createdAt} DESC`);
  return rows.map(({ token, user }) => ({
    id: token.id,
    userId: user.id,
    email: user.email ?? "",
    name: displayName(user),
    tokenPrefix: token.tokenPrefix,
    label: token.label,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    createdAt: token.createdAt,
    lastUsedAt: token.lastUsedAt,
  }));
}

export async function revokeBotPublisherToken(tokenId: string): Promise<boolean> {
  const [row] = await db
    .update(botPublisherTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(botPublisherTokens.id, tokenId), isNull(botPublisherTokens.revokedAt)))
    .returning({ id: botPublisherTokens.id });
  return Boolean(row);
}

export async function rotateBotPublisherToken(
  tokenId: string,
  options: Pick<IssueBotPublisherTokenInput, "label" | "expiresInDays"> & RequiredIssuer,
): Promise<IssuedBotPublisherToken> {
  const rawToken = generateBotPublisherToken();
  const newHash = hashBotPublisherToken(rawToken);
  const expiresAt = expiryDate(options.expiresInDays);

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ token: botPublisherTokens, user: users })
      .from(botPublisherTokens)
      .innerJoin(users, eq(botPublisherTokens.userId, users.id))
      .where(and(eq(botPublisherTokens.id, tokenId), isNull(botPublisherTokens.revokedAt)))
      .limit(1);
    if (!existing) throw new BotPublisherTokenError("التوكن غير موجود أو مبطل", "TOKEN_NOT_FOUND");
    if (!canUsePersonalTokenAccount(existing.user)) throw new BotPublisherTokenError("حساب المستخدم غير متاح لتسجيل الدخول", "USER_UNAVAILABLE");
    await assertTokenIssueAuthority(options.issuedByUserId ?? options.issuerUserId, existing.user.id);

    const [revoked] = await tx
      .update(botPublisherTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(botPublisherTokens.id, tokenId), isNull(botPublisherTokens.revokedAt)))
      .returning({ id: botPublisherTokens.id });
    if (!revoked) throw new BotPublisherTokenError("تعذر تدوير التوكن", "TOKEN_REVOKED");

    const [created] = await tx
      .insert(botPublisherTokens)
      .values({
        userId: existing.user.id,
        tokenHash: newHash,
        tokenPrefix: rawToken.slice(0, 16),
        label: options.label?.trim() || existing.token.label || null,
        expiresAt,
        issuedBy: options.issuedByUserId ?? options.issuerUserId ?? null,
      })
      .returning({ id: botPublisherTokens.id, label: botPublisherTokens.label, expiresAt: botPublisherTokens.expiresAt });
    if (!created) throw new Error("تعذر إنشاء التوكن الجديد");
    return toIssuedToken(created, existing.user, rawToken);
  });

  return result;
}

export function hasBotPublisherCapability(
  principal: BotPublisherPrincipal,
  capability: BotPublisherCapability,
): boolean {
  return principal.capabilities.includes(capability);
}

export { hashBotPublisherToken };
