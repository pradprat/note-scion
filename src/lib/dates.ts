/**
 * Calendar dates for "@" mentions. A date is stored as a plain local day, "YYYY-MM-DD",
 * with no time or zone: "today" means the day on the writer's own calendar.
 */

const DAY_MS = 86_400_000;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The local day an ISO date names, or null when it isn't a real calendar day. */
export function parseISODate(value: string): Date | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Same day of the month, clamped to the month's last day (Jan 31 + 1 month = Feb 28). */
function addMonths(date: Date, months: number): Date {
  const first = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), last));
}

/** Whole days from `from` to `to`, both taken as local days. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

/**
 * "Today", "Yesterday" or "Tomorrow" within a day of now; any other day in full,
 * "November 12, 2026". A date typed as @today reads "Today", then "Yesterday", then
 * its full date from the day after.
 */
export function dateLabel(iso: string, now = new Date()): string {
  const date = parseISODate(iso);
  if (!date) return iso;
  const diff = daysBetween(now, date);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return longDate(iso);
}

/** How long ago a moment was: "just now", "4m ago", "2h ago", "yesterday", then "Nov 3". */
export function timeAgo(at: string, now = new Date()): string {
  const then = new Date(at);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const days = daysBetween(then, now);
  if (days === 0) return `${Math.floor(minutes / 60)}h ago`;
  if (days === 1) return "yesterday";
  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: then.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/** "November 3, 2026 at 4:12 PM": the moment behind a `timeAgo`. */
export function exactTime(at: string): string {
  return new Date(at).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
}

/** "Thursday, November 12, 2026": for tooltips and copied text. */
export function fullDate(iso: string): string {
  const date = parseISODate(iso);
  return date
    ? date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : iso;
}

/** "November 12, 2026": a date written into plain text, such as a page title. */
export function longDate(iso: string): string {
  const date = parseISODate(iso);
  return date ? date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : iso;
}

/** "Thu, Nov 12, 2026": the exact day beside a suggestion. */
export function shortDate(iso: string): string {
  const date = parseISODate(iso);
  return date
    ? date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
    : iso;
}

export interface DateSuggestion {
  /** What was understood, e.g. "Next Friday". */
  label: string;
  date: string;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The coming weekday: 1 to 7 days ahead, so "friday" on a Friday is a week out. */
function comingWeekday(now: Date, weekday: number): Date {
  return addDays(now, ((weekday - now.getDay() + 6) % 7) + 1);
}

/** Weekday names starting with `prefix` (at least one letter). */
function weekdaysFor(prefix: string): number[] {
  if (!prefix) return [];
  return WEEKDAYS.flatMap((name, index) => (name.startsWith(prefix) ? [index] : []));
}

function monthFor(word: string): number {
  if (word.length < 3) return -1;
  return MONTHS.findIndex((name) => name.startsWith(word));
}

const UNITS: Record<string, "day" | "week" | "month"> = {
  d: "day",
  day: "day",
  days: "day",
  w: "week",
  wk: "week",
  wks: "week",
  week: "week",
  weeks: "week",
  m: "month",
  mo: "month",
  month: "month",
  months: "month",
};

function shift(now: Date, amount: number, unit: "day" | "week" | "month"): Date {
  if (unit === "month") return addMonths(now, amount);
  return addDays(now, unit === "week" ? amount * 7 : amount);
}

/** One phrase that names a single exact day, or null. */
function parsePhrase(q: string, now: Date): DateSuggestion | null {
  const iso = parseISODate(q);
  if (iso) return { label: shortDate(q), date: q };

  let match = /^in (\d{1,3})(?: ([a-z]+))?$/.exec(q);
  if (match) {
    const unit = match[2] === undefined ? "day" : UNITS[match[2]];
    const n = Number(match[1]);
    if (unit && n > 0) return { label: `In ${n} ${unit}${n === 1 ? "" : "s"}`, date: toISODate(shift(now, n, unit)) };
  }

  match = /^(\d{1,3}) ([a-z]+) ago$/.exec(q);
  if (match && UNITS[match[2]]) {
    const unit = UNITS[match[2]];
    const n = Number(match[1]);
    if (n > 0) return { label: `${n} ${unit}${n === 1 ? "" : "s"} ago`, date: toISODate(shift(now, -n, unit)) };
  }

  match = /^(next|last) (week|month|year)$/.exec(q);
  if (match) {
    const sign = match[1] === "next" ? 1 : -1;
    const date =
      match[2] === "week" ? addDays(now, 7 * sign) : addMonths(now, (match[2] === "month" ? 1 : 12) * sign);
    return { label: `${capitalize(match[1])} ${match[2]}`, date: toISODate(date) };
  }

  // "nov 12", "november 12 2026", "12 nov", "12 november 2026" (commas allowed).
  const words = q.replace(/,/g, " ").split(/\s+/);
  let month = -1;
  let day = NaN;
  let year = now.getFullYear();
  if (words.length >= 2 && words.length <= 3) {
    if (monthFor(words[0]) >= 0 && /^\d{1,2}$/.test(words[1])) {
      month = monthFor(words[0]);
      day = Number(words[1]);
    } else if (/^\d{1,2}$/.test(words[0]) && monthFor(words[1]) >= 0) {
      month = monthFor(words[1]);
      day = Number(words[0]);
    }
    if (words.length === 3) year = /^\d{4}$/.test(words[2]) ? Number(words[2]) : NaN;
  }
  if (month >= 0) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (parseISODate(iso)) return { label: shortDate(iso), date: iso };
  }
  return null;
}

/**
 * What "@" + the text typed so far could mean, best guess first. Understands today,
 * tomorrow, yesterday, weekdays ("fri", "next friday", "last mon"), "in 3 days",
 * "2 weeks ago", "next week", "nov 12" and "2026-11-12".
 */
export function suggestDates(query: string, now = new Date()): DateSuggestion[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  const today = startOfDay(now);
  if (q.length > 24) return [];

  const out: DateSuggestion[] = [];
  const add = (label: string, date: Date) => out.push({ label, date: toISODate(date) });

  const fixed: [string, Date][] = [
    ["today", today],
    ["tomorrow", addDays(today, 1)],
    ["yesterday", addDays(today, -1)],
  ];
  for (const [word, date] of fixed) {
    if (word.startsWith(q)) add(capitalize(word), date);
  }

  if (q) {
    for (const weekday of weekdaysFor(q)) add(capitalize(WEEKDAYS[weekday]), comingWeekday(today, weekday));

    const relative = /^(next|last) ?([a-z]*)$/.exec(q);
    if (relative) {
      for (const weekday of weekdaysFor(relative[2])) {
        const name = capitalize(WEEKDAYS[weekday]);
        if (relative[1] === "next") {
          // The one in next week (weeks start on Monday), not merely the coming one.
          const coming = comingWeekday(today, weekday);
          const daysLeftThisWeek = (7 - today.getDay()) % 7;
          add(`Next ${name}`, daysBetween(today, coming) <= daysLeftThisWeek ? addDays(coming, 7) : coming);
        } else {
          // 1 to 7 days back: "last friday" on a Friday is a week ago.
          add(`Last ${name}`, addDays(today, -(((today.getDay() - weekday + 7) % 7) || 7)));
        }
      }
    }

    const phrase = parsePhrase(q, today);
    if (phrase) out.push(phrase);
  }

  // One row per day; the first wording wins.
  const seen = new Set<string>();
  return out.filter((item) => !seen.has(item.date) && seen.add(item.date)).slice(0, 6);
}
