const businessZone = "America/Sao_Paulo";

function partsForDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: businessZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: Number(value("year")), month: Number(value("month")), day: Number(value("day")) };
}

function offsetMinutes(date: Date) {
  const zone = new Intl.DateTimeFormat("en", { timeZone: businessZone, timeZoneName: "shortOffset" })
    .formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(zone);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

function startOfLocalDay(year: number, month: number, day: number) {
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12));
  return new Date(Date.UTC(year, month - 1, day) - offsetMinutes(noonUtc) * 60_000);
}

export function businessDayRange(now = new Date()) {
  const today = partsForDate(now);
  const next = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  return {
    start: startOfLocalDay(today.year, today.month, today.day).toISOString(),
    end: startOfLocalDay(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()).toISOString()
  };
}
