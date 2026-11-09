"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Circle, CircleCheck, CircleDot, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { dateLabel as relativeLabel, parseISODate } from "@/lib/dates";
import { isOptionType, parseNumberInput, type CellValue, type DbProperty, type StatusGroup } from "@/lib/database-model";
import { openDatePicker } from "../date-picker";

/** A text field that sits in a cell: no box until it has focus. 16px on a phone, so iOS doesn't zoom. */
export const CELL_INPUT =
  "h-8 w-full min-w-0 rounded bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:text-base";

/** A button that fills a cell and shows its value. */
export const CELL_BUTTON =
  "flex h-8 w-full min-w-0 items-center gap-1 rounded px-2 text-left text-sm outline-none transition-colors duration-[120ms] ease-out hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-10";

/** "Today", "Tomorrow" or "Yesterday", else "Nov 12, 2026": short enough for a cell. */
export function dateLabel(iso: string): string {
  const relative = relativeLabel(iso);
  if (relative === "Today" || relative === "Tomorrow" || relative === "Yesterday") return relative;
  return parseISODate(iso)?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) ?? iso;
}

const EMPTY = <span className="text-muted-foreground/60">Empty</span>;

/**
 * A field that keeps what is being typed itself and passes every change on, so the caret
 * stays put while the page updates behind it. A value that changes from outside (undo, an
 * edit from Claude) replaces the text.
 */
function useDraft<T>(value: T, same: (draft: string, value: T) => boolean, show: (value: T) => string) {
  const [draft, setDraft] = useState(() => show(value));
  useEffect(() => {
    setDraft((current) => (same(current, value) ? current : show(value)));
    // `same` and `show` are fixed for a field's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return [draft, setDraft] as const;
}

export function TextCell({
  value,
  onChange,
  label,
  placeholder,
  multiline,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useDraft(
    value,
    (text, current) => text === current,
    (current) => current
  );
  const props = {
    value: draft,
    "aria-label": label,
    placeholder,
    onChange: (event: { target: { value: string } }) => {
      setDraft(event.target.value);
      onChange(event.target.value);
    },
  };
  if (multiline) {
    return (
      <textarea
        {...props}
        rows={3}
        className={cn(CELL_INPUT, "h-auto resize-y py-1.5 leading-snug [@media(pointer:coarse)]:h-auto", className)}
      />
    );
  }
  return (
    <input
      {...props}
      type="text"
      className={cn(CELL_INPUT, className)}
      onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
    />
  );
}

/**
 * A number field. What is typed is kept in the field and the stored number changes only
 * when the text is leaving (blur, Enter, Escape) and is a number or empty: text that is
 * not a number is marked and, on leaving, replaced by the stored number, so a typo can
 * never clear a value. Emptying the field on purpose does. One edit is one change, so
 * one Ctrl+Z takes it back.
 */
export function NumberCell({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: number | undefined;
  onChange: (value: number | null) => void;
  label: string;
  placeholder?: string;
}) {
  const show = (number: number | undefined) => (number === undefined ? "" : String(number));
  const [draft, setDraft] = useState(show(value));
  // A number changed from outside (undo, an edit from Claude) replaces the text.
  useEffect(() => setDraft(show(value)), [value]);
  const parsed = parseNumberInput(draft);
  const invalid = parsed.kind === "invalid";

  const leave = () => {
    if (parsed.kind === "invalid") {
      setDraft(show(value));
      return;
    }
    const next = parsed.kind === "empty" ? null : parsed.value;
    if (next !== (value ?? null)) onChange(next);
    else setDraft(show(value));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      aria-label={label}
      aria-invalid={invalid || undefined}
      title={invalid ? "Not a number. It will go back to the saved number." : undefined}
      placeholder={placeholder}
      className={cn(CELL_INPUT, "tabular-nums", invalid && "text-destructive ring-1 ring-destructive")}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={leave}
      onKeyDown={(event) => {
        // Escape closes the dialog this may sit in without a blur: keep what was typed first.
        if (event.key === "Enter" || event.key === "Escape") leave();
      }}
    />
  );
}

export function CheckboxCell({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex h-8 w-8 cursor-pointer items-center justify-center [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10">
      <input
        type="checkbox"
        checked={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 cursor-pointer accent-foreground"
      />
    </label>
  );
}

/** A status's place in the work, drawn as an outline, a half-filled dot or a check: no color. */
export function StatusIcon({ group }: { group: StatusGroup | undefined }) {
  const Icon = group === "done" ? CircleCheck : group === "doing" ? CircleDot : Circle;
  return <Icon aria-hidden size={14} className="shrink-0 text-muted-foreground" />;
}

/** An option's name on a quiet chip; a status leads with its icon. */
export function OptionChip({ name, group, status }: { name: string; group?: StatusGroup; status?: boolean }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-sm leading-snug">
      {status && <StatusIcon group={group} />}
      <span className="truncate">{name}</span>
    </span>
  );
}

function OptionCell({
  property,
  value,
  onChange,
  label,
}: {
  property: DbProperty;
  value: string | undefined;
  onChange: (value: string | null) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const options = property.options ?? [];
  const q = query.trim().toLowerCase();
  const matches = options.filter((option) => option.name.toLowerCase().includes(q));
  const canCreate = q !== "" && !options.some((option) => option.name.toLowerCase() === q);
  const items = [...matches.map((option) => option.name), ...(canCreate ? [query.trim()] : [])];
  const current = options.find((option) => option.name === value);

  const pick = (name: string | null) => {
    onChange(name);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setQuery("");
        setHighlight(0);
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className={CELL_BUTTON} aria-label={`${label}: ${value ?? "empty"}`}>
          {value ? <OptionChip name={value} group={current?.group} status={property.type === "status"} /> : EMPTY}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-1" aria-label={label}>
        <input
          autoFocus
          value={query}
          placeholder={isOptionType(property.type) ? "Search or add" : ""}
          aria-label={`Find or add an option for ${label}`}
          className="mb-1 h-8 w-full rounded bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:text-base"
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (items.length) setHighlight((i) => (i + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (items[highlight]) pick(items[highlight]);
            }
          }}
        />
        <div role="listbox" aria-label={label} className="max-h-56 overflow-y-auto">
          {items.map((name, index) => {
            const option = options.find((o) => o.name === name);
            return (
              <button
                key={name}
                type="button"
                role="option"
                aria-selected={name === value}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(name)}
                className={cn(
                  "flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm [@media(pointer:coarse)]:h-10",
                  index === highlight && "bg-accent text-accent-foreground"
                )}
              >
                {option ? (
                  <OptionChip name={name} group={option.group} status={property.type === "status"} />
                ) : (
                  <span>
                    Create <span className="font-medium">“{name}”</span>
                  </span>
                )}
                {name === value && <Check aria-hidden size={14} className="ml-auto shrink-0" />}
              </button>
            );
          })}
          {!items.length && <p className="px-2 py-1.5 text-sm text-muted-foreground">Type to add an option</p>}
        </div>
        {value && (
          <button
            type="button"
            onClick={() => pick(null)}
            className="mt-1 flex h-8 w-full items-center gap-2 rounded-sm border-t px-2 pt-1 text-left text-sm text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:h-10"
          >
            Clear
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function DateCell({
  value,
  onChange,
  label,
}: {
  value: string | undefined;
  onChange: (value: string | null) => void;
  label: string;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const focus = () => button.current?.focus();
  return (
    <div className="group/date flex min-w-0 items-center">
      <button
        ref={button}
        type="button"
        className={CELL_BUTTON}
        aria-label={`${label}: ${value ? dateLabel(value) : "empty"}`}
        onClick={() =>
          button.current &&
          openDatePicker({
            anchor: button.current,
            value: value ?? "",
            onPick: (iso) => {
              onChange(iso);
              focus();
            },
            onDismiss: focus,
          })
        }
      >
        {value ? <span className="truncate">{dateLabel(value)}</span> : EMPTY}
      </button>
      {value && (
        <button
          type="button"
          aria-label={`Clear ${label}`}
          title="Clear date"
          onClick={() => onChange(null)}
          className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/date:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:mr-0 [@media(pointer:coarse)]:h-10"
        >
          <X aria-hidden size={14} />
        </button>
      )}
    </div>
  );
}

/** The editor for one cell, by the type of its property. `label` names it for a screen reader. */
export function Cell({
  property,
  value,
  onChange,
  label,
  multiline,
  placeholder,
}: {
  property: DbProperty;
  value: CellValue | undefined;
  onChange: (value: CellValue | null) => void;
  label: string;
  multiline?: boolean;
  /** Shown in an empty text or number cell: the dialog says "Empty", the table stays blank. */
  placeholder?: string;
}) {
  switch (property.type) {
    case "title":
    case "text":
      return (
        <TextCell
          value={typeof value === "string" ? value : ""}
          onChange={(text) => onChange(text || null)}
          label={label}
          multiline={multiline && property.type === "text"}
          placeholder={property.type === "title" ? "Untitled" : placeholder}
        />
      );
    case "number":
      return <NumberCell value={typeof value === "number" ? value : undefined} onChange={onChange} label={label} placeholder={placeholder} />;
    case "checkbox":
      return <CheckboxCell value={value === true} onChange={(checked) => onChange(checked || null)} label={label} />;
    case "date":
      return <DateCell value={typeof value === "string" ? value : undefined} onChange={onChange} label={label} />;
    case "select":
    case "status":
      return (
        <OptionCell
          property={property}
          value={typeof value === "string" ? value : undefined}
          onChange={onChange}
          label={label}
        />
      );
  }
}

/** A value read-only and small, for a card on the board. Nothing for an empty cell. */
export function CellSummary({ property, value }: { property: DbProperty; value: CellValue | undefined }) {
  if (value === undefined) return null;
  switch (property.type) {
    case "select":
    case "status":
      return (
        <OptionChip
          name={String(value)}
          group={property.options?.find((o) => o.name === value)?.group}
          status={property.type === "status"}
        />
      );
    case "date":
      return <span className="text-xs text-muted-foreground">{dateLabel(String(value))}</span>;
    case "checkbox":
      return <span className="text-xs text-muted-foreground">{property.name}</span>;
    case "number":
      return (
        <span className="text-xs tabular-nums text-muted-foreground">
          {property.name}: {String(value)}
        </span>
      );
    default:
      return <span className="line-clamp-2 text-xs text-muted-foreground">{String(value)}</span>;
  }
}
