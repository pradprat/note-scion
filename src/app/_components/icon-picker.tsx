"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const EMOJI = [
  "📝", "📄", "📓", "📚", "📌", "📎", "🗂️", "🗃️",
  "💡", "🧠", "🎯", "✅", "⭐", "🔥", "⚡", "🚀",
  "🛠️", "⚙️", "🧪", "🐛", "💻", "🖥️", "📱", "🔒",
  "📈", "📊", "💰", "🧾", "📅", "⏰", "✈️", "🏠",
  "❤️", "🌱", "🌍", "☕", "🍳", "🎵", "🎨", "📷",
  "👋", "🙌", "🤝", "💬", "❓", "⚠️", "🎉", "🧭",
];

const COLUMNS = 8;

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
  const gridRef = useRef<HTMLDivElement>(null);

  const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS };
    const step = steps[event.key];
    if (step === undefined) return;
    const buttons = Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const next = at + step;
    if (next < 0 || next >= buttons.length) return;
    event.preventDefault();
    buttons[next].focus();
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Choose an icon"
        className="w-[19rem] p-2"
        onOpenAutoFocus={(event) => {
          // Open on the current icon (or the first one) so arrows and Enter work straight away.
          event.preventDefault();
          const start = Math.max(0, current ? EMOJI.indexOf(current) : 0);
          gridRef.current?.querySelectorAll<HTMLButtonElement>("button")[start]?.focus();
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
        <div ref={gridRef} onKeyDown={moveFocus} className="grid grid-cols-8 gap-0.5">
          {EMOJI.map((emoji) => (
            <Button
              key={emoji}
              variant="ghost"
              size="icon"
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
      </PopoverContent>
    </Popover>
  );
}
