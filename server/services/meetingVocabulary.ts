// ----------------------------------------------------------------------------
// مفردات الاجتماع لـ«مُدوِّن سبق AI» — أسماء المشاركين والأقسام والمنسوبين
//
// تُستخدم في موضعين:
//   1) metadata استدعاء عامل التفريغ (keyterms) → تدخل prompt نموذج التفريغ
//      فيكتب الأسماء صحيحة بدل تخمينها صوتياً.
//   2) prompt توليد المحضر → يصحح النموذج الأسماء ويعتمد عليها.
// البيانات غير حساسة: أسماء عرض (firstName/lastName) وأسماء أقسام فقط — بلا
// بريد ولا جوال ولا بيانات رسمية. لا تُطبع الأسماء في السجلات أبداً.
// ----------------------------------------------------------------------------

import { and, eq, notInArray } from "drizzle-orm";
import { db } from "../db";
import {
  meetingParticipants,
  staffDepartments,
  staffProfiles,
  users,
  type Meeting,
} from "@shared/schema";

export const MAX_KEYTERMS = 60;
export const MAX_KEYTERMS_CHARS = 1500;
const MAX_TERM_CHARS = 60;
const STAFF_SCAN_LIMIT = 300;

export interface MeetingVocabulary {
  /** أسماء الأشخاص: المشاركون أولاً ثم منسوبو الجهة المدعوة */
  names: string[];
  departments: string[];
  /** القائمة المرسلة لعامل التفريغ — مسقوفة عدداً وطولاً */
  keyterms: string[];
}

function clean(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

export function displayName(first: unknown, last: unknown): string {
  return [clean(first), clean(last)].filter(Boolean).join(" ");
}

function dedupe(list: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const t = clean(raw);
    if (!t || t.length > MAX_TERM_CHARS || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** دمج نقي قابل للاختبار — الأولوية: المشاركون ← الأقسام ← بقية المنسوبين */
export function composeMeetingVocabulary(input: {
  participantNames: readonly unknown[];
  departmentNames: readonly unknown[];
  staffNames: readonly unknown[];
}): MeetingVocabulary {
  const participants = dedupe(input.participantNames);
  const departments = dedupe(input.departmentNames);
  const names = dedupe([...participants, ...input.staffNames]);
  const ordered = dedupe([...participants, ...departments, ...names]);

  const keyterms: string[] = [];
  let chars = 0;
  for (const t of ordered) {
    if (keyterms.length >= MAX_KEYTERMS || chars + t.length > MAX_KEYTERMS_CHARS) break;
    keyterms.push(t);
    chars += t.length;
  }
  return { names, departments, keyterms };
}

/** يبني المفردات من قاعدة البيانات (قراءة فقط). أي خطأ → مفردات فارغة لا تعطل شيئاً */
export async function loadMeetingVocabulary(meeting: Meeting): Promise<MeetingVocabulary> {
  try {
    const participantRows = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        guestName: meetingParticipants.guestName,
      })
      .from(meetingParticipants)
      .leftJoin(users, eq(users.id, meetingParticipants.userId))
      .where(
        and(
          eq(meetingParticipants.meetingId, meeting.id),
          notInArray(meetingParticipants.status, ["denied", "removed"]),
        ),
      );

    const departmentRows = await db
      .select({ nameAr: staffDepartments.nameAr })
      .from(staffDepartments)
      .where(eq(staffDepartments.isActive, true))
      .orderBy(staffDepartments.sortOrder, staffDepartments.nameAr);

    // اجتماع لكل المنسوبين أو لقسم: أسماء المنسوبين المحتملين (القسم وحده إن حُدد)
    let staffNames: string[] = [];
    if (meeting.accessType === "all" || meeting.accessType === "department") {
      const conds = [eq(users.status, "active")];
      if (meeting.accessType === "department" && meeting.departmentId) {
        conds.push(eq(staffProfiles.departmentId, meeting.departmentId));
      }
      const staffRows = await db
        .select({ firstName: users.firstName, lastName: users.lastName })
        .from(staffProfiles)
        .innerJoin(users, eq(users.id, staffProfiles.userId))
        .where(and(...conds))
        .orderBy(users.firstName)
        .limit(STAFF_SCAN_LIMIT);
      staffNames = staffRows.map((r) => displayName(r.firstName, r.lastName));
    }

    return composeMeetingVocabulary({
      participantNames: participantRows.map(
        (r) => displayName(r.firstName, r.lastName) || clean(r.guestName),
      ),
      departmentNames: departmentRows.map((r) => r.nameAr),
      staffNames,
    });
  } catch (e) {
    console.error(`[Minutes] vocabulary load failed for ${meeting.id}:`, (e as Error).message);
    return { names: [], departments: [], keyterms: [] };
  }
}
