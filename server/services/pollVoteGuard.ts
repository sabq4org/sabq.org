// قواعد هوية المصوّت في استطلاعات المقالات (server/routes/pollsRoutes.ts).
//
// تدقيق 2026-11-10: المصوّت المجهول بلا كوكي كان يأخذ `anon-<وقت>` جديدًا في
// كل طلب، فلا يطابق فحص «صوّتَ سابقًا» أبدًا، وترويسة x-session-id يختارها
// العميل. الآن: المعرّف الاحتياطي مشتق من عنوان العميل الموثوق، وفوقه سقف
// أصوات مجهولة لكل عنوان في الاستطلاع الواحد (العنوان قد يكون مشتركًا: NAT).
import crypto from "crypto";

export const POLL_MAX_ANON_VOTES_PER_IP = 5;
const SESSION_ID_MAX = 100;

export function resolveVoterSessionId(input: {
  cookieSessionId?: unknown;
  headerSessionId?: unknown;
  ip: string;
  pollId: string;
}): string {
  for (const candidate of [input.cookieSessionId, input.headerSessionId]) {
    if (typeof candidate === "string" && candidate.length > 0 && candidate.length <= SESSION_ID_MAX) {
      return candidate;
    }
  }
  const digest = crypto.createHash("sha256").update(`${input.pollId}:${input.ip}`).digest("hex");
  return `ip-${digest.slice(0, 40)}`;
}

export function anonVoteCapReached(existingAnonVotesFromIp: number): boolean {
  return existingAnonVotesFromIp >= POLL_MAX_ANON_VOTES_PER_IP;
}
