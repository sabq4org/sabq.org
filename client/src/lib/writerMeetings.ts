// منطق خالص لصفحة اجتماعات كاتب الرأي (المرحلة 4).

/** يُفتح زر الانضمام قبل موعد الاجتماع بهذه الدقائق. */
export const WRITER_JOIN_WINDOW_MINUTES = 10;

export function canJoinWriterMeeting({
  isLive,
  scheduledAt,
  now,
}: {
  isLive: boolean;
  scheduledAt: string | null;
  now: number;
}): boolean {
  if (isLive) return true;
  if (!scheduledAt) return false;
  const at = new Date(scheduledAt).getTime();
  if (Number.isNaN(at)) return false;
  return at - now <= WRITER_JOIN_WINDOW_MINUTES * 60_000;
}

function unit(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

/** «بعد يومين و3 ساعات» / «بعد 25 دقيقة» / «حان الموعد». */
export function writerMeetingCountdown(scheduledAt: string | null, now: number): string | null {
  if (!scheduledAt) return null;
  const at = new Date(scheduledAt).getTime();
  if (Number.isNaN(at)) return null;
  const diffMin = Math.round((at - now) / 60_000);
  if (diffMin <= 0) return "حان الموعد";
  const days = Math.floor(diffMin / 1440);
  const hours = Math.floor((diffMin % 1440) / 60);
  const minutes = diffMin % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(unit(days, "يوم", "يومين", "أيام", "يومًا"));
  if (hours > 0) parts.push(unit(hours, "ساعة", "ساعتين", "ساعات", "ساعة"));
  if (days === 0 && minutes > 0) parts.push(unit(minutes, "دقيقة", "دقيقتين", "دقائق", "دقيقة"));
  return `بعد ${parts.slice(0, 2).join(" و")}`;
}
