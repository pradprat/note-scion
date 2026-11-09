"use client";

import { useRef, useState, type DragEvent } from "react";
import { ArrowRightLeft, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  addProperty,
  addRow,
  boardColumns,
  cellOf,
  groupProperty,
  moveRow,
  setCell,
  type DatabaseData,
  type DbRow,
} from "@/lib/database-model";
import { CellSummary, StatusIcon } from "./cells";
import type { Apply } from "./table-view";

interface Drop {
  column: string | null;
  /** The card the dragged one would land above; null for the end of the column. */
  before: string | null;
}

/**
 * The rows as cards in columns, one column for each option of a select or status
 * property. A card moves by dragging it (with a mouse) or by its "Move to" menu, which
 * is a native select: it works from the keyboard and on a phone, where drag doesn't.
 */
export function BoardView({ db, apply, openRow }: { db: DatabaseData; apply: Apply; openRow: (id: string) => void }) {
  const dragging = useRef<string | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const property = groupProperty(db);

  if (!property) {
    return (
      <div className="px-2 py-6 text-sm text-muted-foreground">
        <p>A board needs a status or select property to group the rows by.</p>
        <button
          type="button"
          onClick={() => apply((current) => addProperty(current, "status", "Status").db)}
          className="mt-3 inline-flex h-8 items-center gap-2 rounded-md border px-3 text-foreground transition-colors duration-[120ms] hover:bg-accent [@media(pointer:coarse)]:h-10"
        >
          <Plus aria-hidden size={14} />
          Add a status property
        </button>
      </div>
    );
  }

  const title = db.properties[0];
  const columns = boardColumns(db, property).filter((column) => column.key !== null || column.rows.length > 0);
  const shown = db.properties.filter((p) => p !== title && p.name !== property.name).slice(0, 3);

  const addCard = (key: string | null) => {
    let id = "";
    apply((current) => {
      const next = addRow(current);
      id = next.id;
      return key === null ? next.db : setCell(next.db, next.id, property.name, key);
    });
    openRow(id);
  };

  /** The card under the pointer: the dragged one lands above the first card whose middle is below it. */
  const target = (event: DragEvent<HTMLElement>, column: string | null): Drop => {
    const cards = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-card]"));
    const next = cards.find((card) => {
      const box = card.getBoundingClientRect();
      return event.clientY < box.top + box.height / 2 && card.dataset.card !== dragging.current;
    });
    return { column, before: next?.dataset.card ?? null };
  };

  const clear = () => {
    dragging.current = null;
    setLifted(null);
    setDrop(null);
  };

  const card = (row: DbRow) => {
    const name = String(cellOf(row, title.name) ?? "") || "Untitled";
    const current = (cellOf(row, property.name) as string | undefined) ?? "";
    const chips = shown.filter((p) => cellOf(row, p.name) !== undefined);
    return (
      <div key={row.id}>
        {drop?.before === row.id && <div className="mb-2 h-0.5 rounded bg-foreground/40" />}
        <div
          data-card={row.id}
          draggable
          onDragStart={(event) => {
            dragging.current = row.id;
            event.dataTransfer.effectAllowed = "move";
            // Firefox won't start a drag without data.
            event.dataTransfer.setData("text/plain", name);
            // Changing the card in the same tick can end the drag before it starts.
            setTimeout(() => dragging.current === row.id && setLifted(row.id));
          }}
          onDragEnd={clear}
          className={cn(
            "group/card relative rounded-md border bg-background transition-opacity duration-[120ms]",
            lifted === row.id && "opacity-40"
          )}
        >
          <button
            type="button"
            onClick={() => openRow(row.id)}
            aria-label={`Open ${name}`}
            className="block w-full cursor-pointer rounded-md px-2.5 py-2 pr-9 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className={cn("block text-sm leading-snug", name === "Untitled" && "text-muted-foreground/60")}>
              {name}
            </span>
            {chips.length > 0 && (
              <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                {chips.map((p) => (
                  <CellSummary key={p.name} property={p} value={cellOf(row, p.name)} />
                ))}
              </span>
            )}
          </button>
          <label
            title="Move to"
            className="absolute right-1 top-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity duration-[120ms] focus-within:opacity-100 focus-within:ring-2 focus-within:ring-ring hover:bg-accent hover:text-foreground group-hover/card:opacity-100 [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"
          >
            <ArrowRightLeft aria-hidden size={14} />
            <select
              aria-label={`Move ${name} to`}
              value={current}
              onChange={(event) =>
                apply((now) => moveRow(now, row.id, property.name, event.target.value || null))
              }
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              <option value="">No {property.name}</option>
              {property.options?.map((option) => (
                <option key={option.name} value={option.name}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    );
  };

  return (
    <div className="flex items-start gap-3 overflow-x-auto pb-2">
      {columns.map((column) => {
        const name = column.key ?? `No ${property.name}`;
        const over = drop?.column === column.key;
        return (
          <section
            key={column.key ?? "(none)"}
            aria-label={`${name}, ${column.rows.length} ${column.rows.length === 1 ? "card" : "cards"}`}
            onDragOver={(event) => {
              if (!dragging.current) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              const next = target(event, column.key);
              if (!drop || drop.column !== next.column || drop.before !== next.before) setDrop(next);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrop(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const id = dragging.current;
              const landing = target(event, column.key);
              clear();
              if (id) apply((now) => moveRow(now, id, property.name, column.key, landing.before));
            }}
            className={cn(
              "w-64 shrink-0 rounded-lg bg-muted/50 p-2 transition-colors duration-[120ms] [@media(max-width:480px)]:w-60",
              over && "bg-muted"
            )}
          >
            <header className="mb-2 flex items-center gap-1.5 px-1">
              {column.key !== null && property.type === "status" && <StatusIcon group={column.group} />}
              <h4 className="min-w-0 flex-1 truncate text-sm font-medium">{name}</h4>
              <span className="text-xs tabular-nums text-muted-foreground">{column.rows.length}</span>
              <button
                type="button"
                aria-label={`Add a card to ${name}`}
                title="Add a card"
                onClick={() => addCard(column.key)}
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors duration-[120ms] hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"
              >
                <Plus aria-hidden size={14} />
              </button>
            </header>
            <div className="min-h-8 space-y-2">
              {column.rows.map(card)}
              {over && drop.before === null && <div className="h-0.5 rounded bg-foreground/40" />}
            </div>
          </section>
        );
      })}
    </div>
  );
}
