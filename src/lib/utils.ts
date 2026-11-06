import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a date string from "MM-YYYY" format to "MMM YYYY" format
 * Example: "01-2025" -> "Jan 2025"
 */
export function formatDate(dateString: string): string {
  const [month, year] = dateString.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(date);
}

/**
 * Converts "MM-YYYY" to the ISO 8601 year-month form used by <time dateTime>.
 * Example: "01-2025" -> "2025-01". Returns undefined for an empty/absent value
 * so callers can spread it straight onto a <time> without emitting dateTime="".
 */
export function toISOMonth(dateString?: string): string | undefined {
  if (!dateString) return undefined;
  const [month, year] = dateString.split("-");
  if (!month || !year) return undefined;
  return `${year}-${month.padStart(2, "0")}`;
}
