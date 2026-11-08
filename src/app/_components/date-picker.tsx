"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fullDate, parseISODate, toISODate } from "@/lib/dates";

const day = (year: number, month: number, date: number) => new Date(year, month, date);
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Same day of the month, clamped to the month's last day (Jan 31 → Feb 28). */
function shiftMonths(date: Date, months: number): Date {
  const last = day(date.getFullYear(), date.getMonth() + months + 1, 0).getDate();
  return day(date.getFullYear(), date.getMonth() + months, Math.min(date.getDate(), last));
}

/** The first day of the week where the reader is: Monday in most places, Sunday in the US. */
function weekStart(): number {
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const first = (locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay;
    if (first) return first % 7; // 1 = Monday … 7 = Sunday
  } catch {
    // An unknown locale: fall back below.
  }
  return 0;
}

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short" });

/**
 * A month to pick a day from, for an "@" date. Arrow keys move by day and week, Page Up
 * and Page Down by month (with Shift, by year), Home and End to the ends of the week.
 * Six rows always, so the grid doesn't change height from month to month.
 */
function DatePicker({
  anchor,
  value,
  onPick,
  onDismiss,
}: {
  anchor: HTMLElement;
  value: string;
  onPick: (iso: string) => void;
  onDismiss: () => void;
}) {
  const selected = useMemo(() => parseISODate(value), [value]);
  const today = useMemo(() => new Date(), []);
  const [focused, setFocused] = useState<Date>(() => selected ?? today);
  const gridRef = useRef<HTMLDivElement>(null);
  const start = useMemo(weekStart, []);

  const year = focused.getFullYear();
  const month = focused.getMonth();
  const first = day(year, month, 1);
  const lead = (first.getDay() - start + 7) % 7;
  const days = Array.from({ length: 42 }, (_, i) => day(year, month, 1 - lead + i));
  const weekdays = days.slice(0, 7).map((date) => WEEKDAY.format(date));

  // Focus follows the focused day, as it moves by key or by changing month.
  const focusDay = () =>
    gridRef.current?.querySelector<HTMLElement>(`[data-iso="${toISODate(focused)}"]`)?.focus();
  useEffect(focusDay, [focused]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (event: React.KeyboardEvent) => {
    const by: Record<string, () => Date> = {
      ArrowLeft: () => day(year, month, focused.getDate() - 1),
      ArrowRight: () => day(year, month, focused.getDate() + 1),
      ArrowUp: () => day(year, month, focused.getDate() - 7),
      ArrowDown: () => day(year, month, focused.getDate() + 7),
      PageUp: () => shiftMonths(focused, event.shiftKey ? -12 : -1),
      PageDown: () => shiftMonths(focused, event.shiftKey ? 12 : 1),
      Home: () => day(year, month, focused.getDate() - ((focused.getDay() - start + 7) % 7)),
      End: () => day(year, month, focused.getDate() + 6 - ((focused.getDay() - start + 7) % 7)),
    };
    const next = by[event.key];
    if (!next) return;
    event.preventDefault();
    setFocused(next());
  };

  return (
    <PopoverPrimitive.Root open onOpenChange={(open) => !open && onDismiss()}>
      <PopoverPrimitive.Anchor virtualRef={{ current: anchor }} />
      <PopoverContent
        align="start"
        sideOffset={6}
        // The page's own side gutter: on a phone it stays clear of the screen's edge.
        collisionPadding={16}
        aria-label="Change date"
        // Focus goes to the day itself, once the click that opened this has finished
        // putting the cursor in the page. On close, the page takes it back (date-mention).
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          requestAnimationFrame(focusDay);
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="w-auto p-3"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p aria-live="polite" className="pl-1 text-sm font-medium">
            {MONTH.format(first)}
          </p>
          <div className="flex gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous month"
              onClick={() => setFocused(shiftMonths(focused, -1))}
              className={NAV_BUTTON}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next month"
              onClick={() => setFocused(shiftMonths(focused, 1))}
              className={NAV_BUTTON}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>

        <div ref={gridRef} role="grid" aria-label={MONTH.format(first)} onKeyDown={move}>
          <div role="row" className="flex">
            {weekdays.map((name) => (
              <span
                key={name}
                role="columnheader"
                aria-label={name}
                className={cn(CELL, "flex items-center justify-center text-xs text-muted-foreground")}
              >
                {name.slice(0, 2)}
              </span>
            ))}
          </div>
          {Array.from({ length: 6 }, (_, row) => (
            <div key={row} role="row" className="flex">
              {days.slice(row * 7, row * 7 + 7).map((date) => {
                const iso = toISODate(date);
                const isSelected = !!selected && sameDay(date, selected);
                const isToday = sameDay(date, today);
                const inMonth = date.getMonth() === month;
                return (
                  <div key={iso} role="gridcell" aria-selected={isSelected}>
                    <button
                      type="button"
                      data-iso={iso}
                      tabIndex={sameDay(date, focused) ? 0 : -1}
                      aria-label={fullDate(iso)}
                      aria-current={isToday ? "date" : undefined}
                      onClick={() => onPick(iso)}
                      onFocus={() => !sameDay(date, focused) && setFocused(date)}
                      className={cn(
                        CELL,
                        "rounded-md text-sm tabular-nums outline-none transition-colors duration-[120ms] ease-out",
                        "hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
                        !inMonth && "text-muted-foreground",
                        isToday && !isSelected && "font-medium ring-1 ring-inset ring-border",
                        isSelected &&
                          "bg-primary font-medium text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
                      )}
                    >
                      {date.getDate()}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-2 flex border-t pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPick(toISODate(today))}
            className="h-8 px-2 font-normal [@media(pointer:coarse)]:h-10"
          >
            Today
          </Button>
        </div>
      </PopoverContent>
    </PopoverPrimitive.Root>
  );
}

/** A day: 32px, or 40px for a finger. */
const CELL = "h-8 w-8 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10";
const NAV_BUTTON =
  "h-7 w-7 text-muted-foreground [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10 [&_svg]:size-4";

let current: { root: Root; host: HTMLElement } | null = null;

function closeDatePicker() {
  if (!current) return;
  const { root, host } = current;
  current = null;
  // Unmounting during a React event from inside this root isn't allowed: wait a tick.
  queueMicrotask(() => {
    root.unmount();
    host.remove();
  });
}

/**
 * Opens the month picker beside a date in the text. One at a time: opening another
 * closes this one. `onPick` gets the chosen day as `YYYY-MM-DD`; `onDismiss` runs when it
 * closes without a pick (Escape, a click outside).
 */
export function openDatePicker({
  anchor,
  value,
  onPick,
  onDismiss,
}: {
  anchor: HTMLElement;
  value: string;
  onPick: (iso: string) => void;
  onDismiss: () => void;
}) {
  closeDatePicker();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  current = { root, host };
  root.render(
    <DatePicker
      anchor={anchor}
      value={value}
      onPick={(iso) => {
        closeDatePicker();
        onPick(iso);
      }}
      onDismiss={() => {
        closeDatePicker();
        onDismiss();
      }}
    />
  );
}
