import { dateLabel, longDate, parseISODate } from "./dates";

/**
 * Dates in page titles. A title is stored as plain text, with each date kept as the day
 * itself, `@2026-11-08`, the same form the page body uses in Markdown. Wherever a title
 * is shown it reads Today, Yesterday or Tomorrow while that's true, and the full date
 * after, so a journal page titled @today stays right.
 */

/** `@YYYY-MM-DD` as a word of its own, as in the body (see date-mention.ts). */
const TITLE_DATE = /(^|[^\w@.-])@(\d{4}-\d{2}-\d{2})(?![\w-])/g;

export type TitlePart = { text: string } | { date: string };

/** A title cut into text and dates, for the title editor. */
export function titleParts(title: string): TitlePart[] {
  const parts: TitlePart[] = [];
  const find = new RegExp(TITLE_DATE.source, "g");
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = find.exec(title))) {
    const [, before, iso] = match;
    if (!parseISODate(iso)) continue;
    const at = match.index + before.length;
    if (at > last) parts.push({ text: title.slice(last, at) });
    parts.push({ date: iso });
    last = at + iso.length + 1;
  }
  if (last < title.length) parts.push({ text: title.slice(last) });
  return parts;
}

/**
 * A title as words: "Standup @2026-11-08" reads "Standup Today". With no `now` (a server
 * render, before the browser's own clock is known) every date reads in full, so the
 * server and the first browser render agree.
 */
export function titleText(title: string, now: Date | null): string {
  const words = titleParts(title)
    .map((part) => ("date" in part ? (now ? dateLabel(part.date, now) : longDate(part.date)) : part.text))
    .join("")
    .trim();
  return words || "Untitled";
}
