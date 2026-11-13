"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchEmoji } from "@/lib/emoji";
import { cn } from "@/lib/utils";

/**
 * The button an arrow key moves to from `from`: the next or previous one for left and
 * right, and for up and down the nearest one in the row above or below, by where they
 * sit, since the groups' rows don't line up in a single list.
 */
function neighbour(buttons: HTMLButtonElement[], from: HTMLButtonElement, key: string): HTMLButtonElement | null {
  const at = buttons.indexOf(from);
  if (key === "ArrowRight") return buttons[at + 1] ?? null;
  if (key === "ArrowLeft") return buttons[at - 1] ?? null;
  const down = key === "ArrowDown";
  const box = from.getBoundingClientRect();
  const rows = buttons
    .map((button) => ({ button, box: button.getBoundingClientRect() }))
    .filter((b) => (down ? b.box.top > box.top + 1 : b.box.top < box.top - 1));
  if (!rows.length) return null;
  const rowTop = down ? Math.min(...rows.map((b) => b.box.top)) : Math.max(...rows.map((b) => b.box.top));
  const centre = (b: DOMRect) => b.left + b.width / 2;
  return rows
    .filter((b) => Math.abs(b.box.top - rowTop) < 1)
    .reduce((best, b) => (Math.abs(centre(b.box) - centre(box)) < Math.abs(centre(best.box) - centre(box)) ? b : best))
    .button;
}

/** The page icon popover. `children` is the trigger (the icon itself, or "Add icon"). */
export default function IconPicker({
  open,
  onOpenChange,
  current,
  onPick,
  onRemove,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: string | null;
  onPick: (emoji: string) => void;
  onRemove: (() => void) | null;
  children: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const groups = useMemo(() => searchEmoji(query), [query]);

  // Each opening starts on the whole set, however it last closed (a pick closes it from outside).
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const buttons = () => Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
  /** The current icon's button when it's shown, or the first one. */
  const startButton = () => {
    const all = buttons();
    return all.find((button) => button.dataset.emoji === current) ?? all[0];
  };

  const onGridKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const from = document.activeElement as HTMLButtonElement;
    if (event.key.startsWith("Arrow")) {
      const all = buttons();
      if (!all.includes(from)) return;
      event.preventDefault();
      const next = neighbour(all, from, event.key);
      // Up from the top row goes back to the search field.
      if (next) next.focus();
      else if (event.key === "ArrowUp") searchRef.current?.focus();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== " ") {
      // Typing over the grid searches: the letter lands in the field once it has focus.
      searchRef.current?.focus();
    }
  };

  const onSearchKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      startButton()?.focus();
    } else if (event.key === "Enter") {
      event.preventDefault();
      const first = groups[0]?.entries[0];
      if (first) onPick(first.emoji);
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Choose an icon"
        className="w-[19rem] p-2"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const start = startButton();
          const grid = gridRef.current;
          // Scrolled by hand: scrollIntoView would scroll the page behind the popover too.
          if (grid && start) grid.scrollTop = start.offsetTop - grid.clientHeight / 2 + start.offsetHeight / 2;
          // Search takes the keys with a keyboard; on a touchscreen focusing it would open
          // the on-screen keyboard over the grid, so the current icon takes focus instead.
          if (window.matchMedia("(pointer: coarse)").matches) start?.focus({ preventScroll: true });
          else searchRef.current?.focus();
        }}
      >
        <div className="mb-1 flex h-7 items-center justify-between px-1">
          <span className="text-xs font-medium text-muted-foreground">Icon</span>
          {onRemove && (
            <Button variant="ghost" size="sm" onClick={onRemove} className="h-7 px-2 text-xs text-muted-foreground">
              Remove
            </Button>
          )}
        </div>
        <Input
          ref={searchRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onSearchKey}
          placeholder="Search emoji"
          aria-label="Search emoji"
          className="mb-2 h-8 text-sm [@media(pointer:coarse)]:text-base"
        />
        {/* The opaque background lets Chrome scroll the grid on the compositor; over a
            transparent one at 1x it repaints all ~350 colour emoji on every wheel tick. */}
        <div
          ref={gridRef}
          onKeyDown={onGridKey}
          className="relative max-h-72 overflow-y-auto overscroll-contain bg-popover [scrollbar-width:thin]"
        >
          {groups.length === 0 && <p className="px-1 py-6 text-center text-sm text-muted-foreground">No emoji match</p>}
          {groups.map((group) => (
            <section key={group.name} aria-label={group.name} className="mb-2 last:mb-0">
              <h3 className="px-1 pb-1 text-xs font-medium text-muted-foreground">{group.name}</h3>
              <div className="grid grid-cols-8 gap-0.5">
                {group.entries.map(({ emoji, words }) => (
                  <Button
                    key={emoji}
                    data-emoji={emoji}
                    variant="ghost"
                    size="icon"
                    title={words}
                    aria-label={`Use ${emoji}`}
                    aria-pressed={emoji === current}
                    onClick={() => onPick(emoji)}
                    className={cn(
                      "h-8 w-8 text-lg focus-visible:bg-accent focus-visible:ring-offset-0",
                      emoji === current && "bg-accent"
                    )}
                  >
                    {emoji}
                  </Button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
