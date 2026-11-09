"use client";

import { useCallback, useId, useMemo, useState, type KeyboardEvent } from "react";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { cn } from "@/lib/utils";
import { Database, toAttrs } from "@/lib/database";
import { groupableProperties, groupProperty, normalizeDatabase, setTitle, setView } from "@/lib/database-model";
import { TextCell } from "./cells";
import { BoardView } from "./board-view";
import { RowDialog } from "./row-dialog";
import { TableView, type Apply } from "./table-view";

const VIEWS = [
  { id: "table", label: "Table" },
  { id: "board", label: "Board" },
] as const;

/**
 * A database as the editor shows it: a title, tabs for its two views (the same rows and
 * properties in both), and the view. Every change is one transaction that replaces the
 * block's attributes, so it undoes, saves and conflicts like typing does.
 */
function DatabaseView({ node, editor, getPos }: ReactNodeViewProps) {
  const db = useMemo(() => normalizeDatabase(node.attrs), [node.attrs]);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const id = useId();

  // Read from the document each time: two changes in one tick (leaving a field and
  // clicking a button) must each build on the one before.
  const apply = useCallback<Apply>(
    (change) => {
      const pos = getPos();
      const current = pos === undefined ? null : editor.state.doc.nodeAt(pos);
      if (pos === undefined || current?.type.name !== "database") return;
      const next = change(normalizeDatabase(current.attrs));
      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, toAttrs(next)));
    },
    [editor, getPos]
  );

  const closeRow = useCallback(() => setOpenRow(null), []);
  const groupable = groupableProperties(db);
  const board = db.views.active === "board";

  const onTabKey = (event: KeyboardEvent) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = VIEWS[(VIEWS.findIndex((view) => view.id === db.views.active) + step + VIEWS.length) % VIEWS.length];
    apply((current) => setView(current, { active: next.id }));
    requestAnimationFrame(() => document.getElementById(`${id}-${next.id}`)?.focus());
  };

  return (
    <NodeViewWrapper className="notes-database my-3" data-database="">
      <TextCell
        value={db.title}
        onChange={(title) => apply((current) => setTitle(current, title))}
        label="Database title"
        placeholder="Untitled database"
        className="mb-1 h-auto -ml-2 py-1 text-base font-medium [@media(pointer:coarse)]:h-auto"
      />
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 border-b">
        <div role="tablist" aria-label="Database views" onKeyDown={onTabKey} className="flex gap-1">
          {VIEWS.map((view) => {
            const selected = view.id === db.views.active;
            return (
              <button
                key={view.id}
                id={`${id}-${view.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${id}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => apply((current) => setView(current, { active: view.id }))}
                className={cn(
                  "-mb-px h-9 border-b-2 px-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11",
                  selected
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {view.label}
              </button>
            );
          })}
        </div>
        {board && groupable.length > 0 && (
          <label className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
            Group by
            <select
              value={groupProperty(db)?.name}
              onChange={(event) => apply((current) => setView(current, { groupBy: event.target.value }))}
              className="h-7 rounded border bg-background px-1 text-sm text-foreground [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:text-base"
            >
              {groupable.map((property) => (
                <option key={property.name} value={property.name}>
                  {property.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${db.views.active}`}>
        {board ? (
          <BoardView db={db} apply={apply} openRow={setOpenRow} />
        ) : (
          <TableView db={db} apply={apply} openRow={setOpenRow} />
        )}
      </div>
      <RowDialog db={db} rowId={openRow} apply={apply} onClose={closeRow} />
    </NodeViewWrapper>
  );
}

export const DatabaseBlock = Database.extend({
  addNodeView() {
    // Everything inside is the block's own: typing, dragging cards and clicking must not
    // reach ProseMirror, which would move the cursor, select the block or start a drop.
    return ReactNodeViewRenderer(DatabaseView, { stopEvent: () => true });
  },
});
