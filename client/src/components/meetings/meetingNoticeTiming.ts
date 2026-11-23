// تنسيق وتوقيت تنبيه الاجتماع القادم في مساحة الكاتب (منطق خالص قابل للاختبار).

export type MeetingTimingInfo = {
  isToday: boolean;
  isTomorrow: boolean;
  dayBadge: string | null;
  countdownLabel: string | null;
};

export function formatMeetingDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ar", {
    weekday: "long",
    day: "numeric",
    month: "long",
    numberingSystem: "latn",
  });
}

export function formatMeetingTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("ar", {
    hour: "2-digit",
    minute: "2-digit",
    numberingSystem: "latn",
  });
}

export function getMeetingTimingInfo(iso: string | null, nowMs = Date.now()): MeetingTimingInfo {
  if (!iso) return { isToday: false, isTomorrow: false, dayBadge: null, countdownLabel: null };
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) {
    return { isToday: false, isTomorrow: false, dayBadge: null, countdownLabel: null };
  }
  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const dayDiff = Math.round((startOfTarget - startOfToday) / (24 * 60 * 60 * 1000));

  const isToday = dayDiff === 0;
  const isTomorrow = dayDiff === 1;
  const deltaMs = target.getTime() - nowMs;

  let countdownLabel: string | null = null;
  if (isToday) {
    if (deltaMs <= 0) {
      countdownLabel = "حان موعده الآن";
    } else if (deltaMs < 60 * 60 * 1000) {
      const mins = Math.max(1, Math.round(deltaMs / 60_000));
      countdownLabel = mins === 1 ? "يبدأ خلال دقيقة" : mins === 2 ? "يبدأ خلال دقيقتين" : `يبدأ خلال ${mins} دقيقة`;
    } else {
      const hours = Math.floor(deltaMs / (60 * 60 * 1000));
      const remMins = Math.round((deltaMs % (60 * 60 * 1000)) / 60_000);
      if (hours === 1 && remMins < 15) countdownLabel = "يبدأ بعد ساعة";
      else if (hours === 2 && remMins < 15) countdownLabel = "يبدأ بعد ساعتين";
      else if (remMins >= 15 && hours < 4) countdownLabel = `يبدأ بعد ${hours} س و${remMins} د`;
      else countdownLabel = `يبدأ بعد ${hours} ساعات`;
    }
  }

  return {
    isToday,
    isTomorrow,
    dayBadge: isToday ? "اجتماع اليوم" : isTomorrow ? "اجتماع غداً" : null,
    countdownLabel,
  };
}
