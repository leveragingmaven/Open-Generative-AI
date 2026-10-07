const CLOCK_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_TIME_PATTERN = /^(\d{2}):(\d{2})$/;

function partsAt(instant, timezone) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant)).map(({ type, value }) => [type, Number(value)]));
  return [values.year, values.month, values.day, values.hour, values.minute];
}

function sameParts(left, right) {
  return left.every((part, index) => part === right[index]);
}

export function resolvedScheduleTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function scheduleFieldsForInstant(value, timezone) {
  const instant = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(instant.getTime())) return { date: "", time: "" };
  try {
    const [year, month, day, hour, minute] = partsAt(instant, timezone);
    const pad = (part) => String(part).padStart(2, "0");
    return { date: `${year}-${pad(month)}-${pad(day)}`, time: `${pad(hour)}:${pad(minute)}` };
  } catch {
    return { date: "", time: "" };
  }
}

export function clockPartsFromTime(value) {
  const match = CLOCK_TIME_PATTERN.exec(value || "");
  if (!match) return { hour: "12", minute: "00", period: "AM" };
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  if (hour24 > 23 || minute > 59) return { hour: "12", minute: "00", period: "AM" };
  return {
    hour: String(hour24 % 12 || 12).padStart(2, "0"),
    minute: String(minute).padStart(2, "0"),
    period: hour24 >= 12 ? "PM" : "AM",
  };
}

export function timeFromClockParts(hourValue, minuteValue, periodValue) {
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const period = String(periodValue || "").toUpperCase();
  if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59 || !["AM", "PM"].includes(period)) return "";
  const hour24 = (hour % 12) + (period === "PM" ? 12 : 0);
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function scheduledForFromFields(dateValue, timeValue, timezone) {
  const dateMatch = CLOCK_DATE_PATTERN.exec(dateValue || "");
  const timeMatch = CLOCK_TIME_PATTERN.exec(timeValue || "");
  if (!dateMatch || !timeMatch) return null;

  const desired = [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3]), Number(timeMatch[1]), Number(timeMatch[2])];
  const [year, month, day, hour, minute] = desired;
  if (year < 100 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null;
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const utcDate = new Date(desiredAsUtc);
  if (!sameParts([utcDate.getUTCFullYear(), utcDate.getUTCMonth() + 1, utcDate.getUTCDate(), utcDate.getUTCHours(), utcDate.getUTCMinutes()], desired)) return null;

  try {
    const offsets = new Set();
    for (let hours = -36; hours <= 36; hours += 6) {
      const sample = desiredAsUtc + hours * 60 * 60 * 1000;
      const [localYear, localMonth, localDay, localHour, localMinute] = partsAt(sample, timezone);
      offsets.add(Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute) - sample);
    }
    const candidates = [...offsets]
      .map((offset) => desiredAsUtc - offset)
      .filter((candidate) => sameParts(partsAt(candidate, timezone), desired))
      .sort((left, right) => left - right);
    // A repeated wall-clock time at the daylight-saving fall-back uses its first occurrence.
    return candidates.length ? new Date(candidates[0]).toISOString() : null;
  } catch {
    return null;
  }
}
