"use client";

import { useEffect } from "react";
import { Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cellOf, deleteRow, setCell, type DatabaseData } from "@/lib/database-model";
import { Cell, TextCell } from "./cells";
import { PROPERTY_ICONS } from "./property-menu";
import type { Apply } from "./table-view";

/**
 * One row opened: its title large, then every other property with the same editors the
 * table uses. A dialog rather than a side panel, so it holds up on a phone as it is.
 */
export function RowDialog({
  db,
  rowId,
  apply,
  onClose,
}: {
  db: DatabaseData;
  rowId: string | null;
  apply: Apply;
  onClose: () => void;
}) {
  const row = rowId ? db.rows.find((r) => r.id === rowId) : undefined;
  // The row can go while it is open (an undo, an edit from Claude).
  useEffect(() => {
    if (rowId && !row) onClose();
  }, [rowId, row, onClose]);

  const [title, ...others] = db.properties;
  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[85vh] max-w-lg overflow-y-auto"
        onCloseAutoFocus={(event) => event.preventDefault()}
        // Escape closes the dialog before the field under the cursor hears it, and a field
        // that is removed gives no blur, so a number typed but not yet kept would be lost.
        // Leaving the field first lets it keep (or put back) its number as it does on Tab.
        onEscapeKeyDown={() => {
          const field = document.activeElement;
          if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) field.blur();
        }}
        // The date calendar is drawn by the editor's own picker, outside this dialog's React
        // tree, so a click in it would read as a click outside and close the dialog.
        onInteractOutside={(event) => {
          if ((event.target as HTMLElement | null)?.closest("[data-radix-popper-content-wrapper]")) event.preventDefault();
        }}
      >
        <DialogTitle className="sr-only">Row</DialogTitle>
        <DialogDescription className="sr-only">Edit the properties of this row.</DialogDescription>
        {row && (
          <>
            <div className="pr-6">
              <TextCell
                value={String(cellOf(row, title.name) ?? "")}
                onChange={(value) => apply((current) => setCell(current, row.id, title.name, value || null))}
                label={title.name}
                placeholder="Untitled"
                className="h-auto -ml-2 py-1 text-xl font-semibold leading-snug [@media(pointer:coarse)]:h-auto [@media(pointer:coarse)]:text-xl"
              />
            </div>
            <div className="space-y-1">
              {others.map((property) => {
                const Icon = PROPERTY_ICONS[property.type];
                return (
                  <div key={property.name} className="grid grid-cols-[7.5rem_1fr] items-start gap-2 sm:grid-cols-[9rem_1fr]">
                    <p className="flex h-8 items-center gap-1.5 truncate text-sm text-muted-foreground [@media(pointer:coarse)]:h-10">
                      <Icon aria-hidden size={14} className="shrink-0" />
                      <span className="truncate">{property.name}</span>
                    </p>
                    <div className="min-w-0">
                      <Cell
                        property={property}
                        value={cellOf(row, property.name)}
                        label={property.name}
                        multiline
                        placeholder="Empty"
                        onChange={(value) => apply((current) => setCell(current, row.id, property.name, value))}
                      />
                    </div>
                  </div>
                );
              })}
              {!others.length && <p className="text-sm text-muted-foreground">This database has only a title.</p>}
            </div>
            <div className="border-t pt-3">
              <button
                type="button"
                onClick={() => {
                  apply((current) => deleteRow(current, row.id));
                  onClose();
                }}
                className="inline-flex h-8 items-center gap-2 rounded-md px-2 text-sm text-destructive transition-colors duration-[120ms] hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-10"
              >
                <Trash2 aria-hidden size={14} />
                Delete row
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
