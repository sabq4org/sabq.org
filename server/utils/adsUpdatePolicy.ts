/**
 * حقول التحديث المسموحة في نظام الإعلانات.
 *
 * فحص الملكية في PUT يجري على الحملة/المجموعة الحالية فقط، فإن مرّ
 * `campaignId` أو `adGroupId` من الجسم نقل المعلن مجموعته أو إعلانه إلى
 * حملة حساب آخر (يُصرف من ميزانيته). النقل ليس تعديلًا عاديًا، فيُحذف.
 * وحالة «مرفوض» قرار إشراف: المعلن لا يضعها ولا يرفعها.
 */
import { adGroups, creatives } from "@shared/schema";
import { pickTableColumns } from "./sanitizeBody";

export const ADS_ADMIN_ROLES = ["admin", "superadmin"];

export function isAdsAdminRole(role: unknown): boolean {
  return typeof role === "string" && ADS_ADMIN_ROLES.includes(role);
}

export function adGroupUpdateFields(body: unknown): Record<string, unknown> {
  return pickTableColumns(adGroups, body, { omit: ["campaignId"] });
}

export function creativeUpdateFields(
  body: unknown,
  ctx: { isAdmin: boolean; currentStatus: string | null | undefined },
): Record<string, unknown> {
  if (ctx.isAdmin) return pickTableColumns(creatives, body, { omit: ["adGroupId"] });

  const fields = pickTableColumns(creatives, body, {
    omit: ["adGroupId", "rejectionReason", "predictedCTR"],
  });
  if ("status" in fields && (fields.status === "rejected" || ctx.currentStatus === "rejected")) {
    delete fields.status;
  }
  return fields;
}
