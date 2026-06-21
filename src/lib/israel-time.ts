/** Wall-clock times in reservations are always Israel local (Asia/Jerusalem). */
export const COOP_TIMEZONE = "Asia/Jerusalem";

const wallClockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: COOP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function wallClockParts(date: Date) {
  const parts = wallClockFormatter.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
    second: pick("second"),
  };
}

/** Parse YYYY-MM-DD + HH:mm as Israel wall-clock → UTC Date (works on Vercel UTC). */
export function reservationDateTime(dateStr: string, timeStr = "00:00"): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return new Date(NaN);
  }

  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let i = 0; i < 4; i++) {
    const parts = wallClockParts(new Date(guess));
    const target = Date.UTC(year, month - 1, day, hour, minute, 0);
    const actual = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const diff = target - actual;
    if (diff === 0) break;
    guess += diff;
  }

  return new Date(guess);
}

export function formatReservationDateTimeHe(date: Date): string {
  return date.toLocaleString("he-IL", {
    timeZone: COOP_TIMEZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
