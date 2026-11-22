import { readFile } from "node:fs/promises";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { users, roles, userRoles } from "@shared/schema";
import type { ContentDutyManager, ContentDutyResponse, ContentDutyShift } from "@shared/contentDuty";
import { db } from "../db";
import { getInactiveRoles } from "./roleStatusCache";
import { canReadEnDashboardStats } from "@shared/enDashboardAccess";

const ONLINE_THRESHOLD_MS = 15 * 60 * 1000;

const shiftSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(0).max(24),
}).strict().superRefine((shift, ctx) => {
  if (shift.startHour === shift.endHour) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endHour"], message: "Shift start and end must differ" });
  }
});

const managerConfigSchema = z.object({
  key: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  userId: z.string().trim().min(1).max(160).nullable().optional(),
  shifts: z.array(shiftSchema).min(1).max(14),
}).strict();

const rosterConfigSchema = z.object({
  managers: z.array(managerConfigSchema).min(1).max(100),
}).strict();

export type ContentDutyManagerConfig = Omit<z.infer<typeof managerConfigSchema>, "shifts"> & { shifts: ContentDutyShift[] };

export class ContentDutyConfigError extends Error {
  readonly code = "CONTENT_DUTY_NOT_CONFIGURED";
  constructor(message = "Content duty roster is not configured") {
    super(message);
    this.name = "ContentDutyConfigError";
  }
}

export interface ContentDutyAccountRow {
  id: string;
  role: string | null;
  assignedRole: string | null;
  status: string;
  deletedAt: Date | null;
  lastActivityAt: Date | string | null;
  loggedOutAt: Date | string | null;
  roleId: string | null;
}

function parseRoster(raw: string): ContentDutyManagerConfig[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ContentDutyConfigError("Content duty roster configuration is not valid JSON");
  }
  const result = rosterConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new ContentDutyConfigError("Content duty roster configuration is invalid");
  }
  const keys = new Set<string>();
  const userIds = new Set<string>();
  for (const manager of result.data.managers) {
    if (keys.has(manager.key) || (manager.userId && userIds.has(manager.userId))) {
      throw new ContentDutyConfigError("Content duty roster contains duplicate manager keys or user IDs");
    }
    keys.add(manager.key);
    if (manager.userId) userIds.add(manager.userId);
    for (const shift of manager.shifts) {
      if (new Set(shift.days).size !== shift.days.length) {
        throw new ContentDutyConfigError("Content duty roster contains duplicate shift days");
      }
    }
  }
  return result.data.managers;
}

/** Read on every request so operators can activate/rotate a private file without a deploy. */
export async function loadContentDutyRoster(): Promise<ContentDutyManagerConfig[]> {
  const configured = process.env.CONTENT_DUTY_ROSTER_JSON?.trim();
  if (!configured) throw new ContentDutyConfigError();
  let raw: string;
  try {
    raw = configured.startsWith("{") ? configured : await readFile(configured, "utf8");
  } catch {
    throw new ContentDutyConfigError();
  }
  return parseRoster(raw);
}

function asTime(value: Date | string | null): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function resolveContentDutyOnline(
  managers: readonly ContentDutyManagerConfig[],
  accounts: readonly ContentDutyAccountRow[],
  now = new Date(),
  inactiveRoleNames: ReadonlySet<string> = new Set(),
): ContentDutyManager[] {
  const accountById = new Map<string, ContentDutyAccountRow[]>();
  for (const account of accounts) {
    const rows = accountById.get(account.id) ?? [];
    rows.push(account);
    accountById.set(account.id, rows);
  }
  const threshold = now.getTime() - ONLINE_THRESHOLD_MS;
  return managers.map((manager) => {
    const accountRows = manager.userId ? accountById.get(manager.userId) : undefined;
    const account = accountRows?.[0];
    let online: boolean | null = null;
    if (account && account.status === "active" && !account.deletedAt) {
      const roleNames = accountRows
        .flatMap((row) => [row.role, row.assignedRole])
        .filter((role): role is string => typeof role === "string" && !inactiveRoleNames.has(role));
      if (canReadEnDashboardStats(account.role && !inactiveRoleNames.has(account.role) ? account.role : null, roleNames)) {
        const activity = asTime(account.lastActivityAt);
        const loggedOut = asTime(account.loggedOutAt);
        online = Boolean(activity !== null && activity >= threshold && (loggedOut === null || activity > loggedOut));
      }
    }
    return { key: manager.key, name: manager.name, online, shifts: manager.shifts };
  });
}

async function readAccounts(userIds: readonly string[]): Promise<{ accounts: ContentDutyAccountRow[]; inactive: ReadonlySet<string> }> {
  if (userIds.length === 0) return { accounts: [], inactive: new Set() };
  const inactive = await getInactiveRoles();
  const rows = await db
    .select({
      id: users.id,
      role: users.role,
      assignedRole: roles.name,
      status: users.status,
      deletedAt: users.deletedAt,
      lastActivityAt: users.lastActivityAt,
      loggedOutAt: users.loggedOutAt,
      roleId: roles.id,
    })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(inArray(users.id, [...userIds]), eq(users.status, "active"), isNull(users.deletedAt)));
  return { accounts: rows as ContentDutyAccountRow[], inactive: inactive.names };
}

export async function getContentDutyRoster(now = new Date()): Promise<ContentDutyResponse> {
  const managers = await loadContentDutyRoster();
  try {
    const userIds = managers.flatMap((manager) => manager.userId ? [manager.userId] : []);
    const { accounts, inactive } = await readAccounts(userIds);
    return { managers: resolveContentDutyOnline(managers, accounts, now, inactive) };
  } catch (error) {
    console.error("[ContentDuty] activity lookup failed; serving unknown presence");
    return {
      managers: managers.map(({ key, name, shifts }) => ({ key, name, shifts, online: null })),
    };
  }
}
