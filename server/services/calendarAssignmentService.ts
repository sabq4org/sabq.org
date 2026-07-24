/**
 * Authorization for newsroom calendar assignments.
 *
 * `PATCH /api/calendar/assignments/:id` and `POST .../complete` were gated on
 * `requireAuth` alone — no permission, no ownership — so any account, including
 * a self-registered public reader, could retarget or close out any coverage
 * assignment in the newsroom calendar. Their sibling create route already
 * requires `calendar:assign_tasks`.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { calendarAssignments, type CalendarAssignment } from "@shared/schema";
import { getUserPermissions } from "../rbac";

export async function getCalendarAssignmentById(
  id: string,
): Promise<CalendarAssignment | undefined> {
  const [row] = await db
    .select()
    .from(calendarAssignments)
    .where(eq(calendarAssignments.id, id))
    .limit(1);
  return row;
}

export type AssignmentAccess =
  | { ok: true; assignment: CalendarAssignment }
  | { ok: false; httpStatus: number; message: string };

/**
 * Who may change an assignment:
 *  - the person it is assigned to (they complete their own coverage),
 *  - the editor who assigned it,
 *  - anyone holding the desk-level calendar permissions.
 */
export async function authorizeAssignmentWrite(
  userId: string,
  assignmentId: string,
): Promise<AssignmentAccess> {
  const assignment = await getCalendarAssignmentById(assignmentId);
  if (!assignment) {
    return { ok: false, httpStatus: 404, message: "المهمة غير موجودة" };
  }

  if (assignment.userId === userId || assignment.assignedBy === userId) {
    return { ok: true, assignment };
  }

  const permissions = await getUserPermissions(userId);
  if (
    permissions.includes("calendar:assign_tasks") ||
    permissions.includes("calendar:edit")
  ) {
    return { ok: true, assignment };
  }

  return { ok: false, httpStatus: 403, message: "غير مصرح لك بتعديل هذه المهمة" };
}
