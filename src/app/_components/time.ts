/** "3 hours ago", "yesterday". Call it in the browser only, so server and client agree. */
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function ago(iso: string, now: number): string {
  const seconds = (Date.parse(iso) - now) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
