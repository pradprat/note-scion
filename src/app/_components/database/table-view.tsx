"use client";

import { useRef } from "react";
import { Maximize2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { addRow, cellOf, deleteRow, setCell, type DatabaseData, type PropertyType } from "@/lib/database-model";
import { Cell } from "./cells";
import { AddPropertyMenu, PROPERTY_ICONS, PropertyMenu } from "./property-menu";
import { useStableKeys } from "./stable-keys";

export type Apply = (change: (db: DatabaseData) => DatabaseData) => void;

/** The least width of a column, in rem: a title needs room, a checkbox hardly any. */
const MIN_WIDTH: Record<PropertyType, number> = {
  title: 12,
  text: 10,
  select: 8,
  status: 8.5,
  date: 8,
  checkbox: 5,
  number: 6,
};
const ACTIONS = 2.5;

/** A button at the end of a row or header: 28px, quiet until the row is under the pointer. */
const ROW_BUTTON =
  "flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-opacity duration-[120ms] hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10";
const REVEALED = "opacity-0 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100";

/**
 * The rows and properties as a grid. Each cell is edited where it is; the arrow beside a
 * title opens the row. Built from divs with table roles: the page's own table styles
 * would otherwise reach into it.
 */
export function TableView({ db, apply, openRow }: { db: DatabaseData; apply: Apply; openRow: (id: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const keys = useStableKeys();
  const widths = db.properties.map((p) => MIN_WIDTH[p.type]);
  const template = `${widths.map((w, i) => `minmax(${w}rem, ${i === 0 ? 2 : 1}fr)`).join(" ")} ${ACTIONS}rem`;
  const min = `${widths.reduce((a, b) => a + b, ACTIONS)}rem`;
  const title = db.properties[0];

  const newRow = () => {
    let id = "";
    apply((current) => {
      const next = addRow(current);
      id = next.id;
      return next.db;
    });
    // Once the row is drawn, the cursor goes to its title.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-row="${id}"] input`)?.focus())
    );
  };

  return (
    <div ref={root} role="table" aria-label={db.title || "Table"} className="overflow-x-auto">
      <div style={{ minWidth: min }}>
        <div role="row" className="grid border-b" style={{ gridTemplateColumns: template }}>
          {db.properties.map((property, index) => {
            const Icon = PROPERTY_ICONS[property.type];
            return (
              <div key={keys.keyOf(property.name)} role="columnheader" className="min-w-0">
                <PropertyMenu property={property} apply={apply} onRenamed={keys.renamed}>
                  <button
                    type="button"
                    className="flex h-8 w-full min-w-0 items-center gap-1.5 rounded px-2 text-left text-xs font-medium text-muted-foreground transition-colors duration-[120ms] hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-10"
                    aria-label={`${property.name}, ${property.type} property. Edit`}
                  >
                    <Icon aria-hidden size={14} className="shrink-0" />
                    <span className="truncate">{property.name}</span>
                  </button>
                </PropertyMenu>
              </div>
            );
          })}
          <div role="columnheader" aria-label="Actions" className="flex items-center justify-center">
            <AddPropertyMenu apply={apply}>
              <button type="button" aria-label="Add a property" title="Add a property" className={ROW_BUTTON}>
                <Plus aria-hidden size={16} />
              </button>
            </AddPropertyMenu>
          </div>
        </div>

        {db.rows.map((row) => {
          const name = String(cellOf(row, title.name) ?? "") || "Untitled";
          return (
            <div
              key={row.id}
              role="row"
              data-row={row.id}
              className="group/row grid border-b transition-colors duration-[120ms] hover:bg-muted/40"
              style={{ gridTemplateColumns: template }}
            >
              {db.properties.map((property, index) => (
                <div key={keys.keyOf(property.name)} role="cell" className="flex min-w-0 items-center">
                  <div className="min-w-0 flex-1">
                    <Cell
                      property={property}
                      value={cellOf(row, property.name)}
                      label={`${property.name} for ${name}`}
                      onChange={(value) => apply((current) => setCell(current, row.id, property.name, value))}
                    />
                  </div>
                  {index === 0 && (
                    <button
                      type="button"
                      aria-label={`Open ${name}`}
                      title="Open"
                      onClick={() => openRow(row.id)}
                      className={cn(ROW_BUTTON, REVEALED, "mr-1 shrink-0")}
                    >
                      <Maximize2 aria-hidden size={14} />
                    </button>
                  )}
                </div>
              ))}
              <div role="cell" className="flex items-center justify-center">
                <button
                  type="button"
                  aria-label={`Delete ${name}`}
                  title="Delete row"
                  onClick={() => apply((current) => deleteRow(current, row.id))}
                  className={cn(ROW_BUTTON, REVEALED)}
                >
                  <Trash2 aria-hidden size={14} />
                </button>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={newRow}
          className="mt-1 flex h-8 w-full items-center gap-2 rounded px-2 text-sm text-muted-foreground transition-colors duration-[120ms] hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-10"
        >
          <Plus aria-hidden size={14} />
          New row
        </button>
      </div>
    </div>
  );
}
