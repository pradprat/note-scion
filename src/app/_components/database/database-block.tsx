"use client";

import { lazy, Suspense } from "react";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { Database } from "@/lib/database";

// The views, cells and menus are most of the database code, and most pages have no database.
// They load the first time one appears, and the block holds its place until then.
const DatabaseView = lazy(() => import("./database-view"));

function LazyDatabaseView(props: ReactNodeViewProps) {
  return (
    <Suspense fallback={<NodeViewWrapper className="notes-database my-3" data-database="" aria-busy="true" style={{ minHeight: "12rem" }} />}>
      <DatabaseView {...props} />
    </Suspense>
  );
}

export const DatabaseBlock = Database.extend({
  addNodeView() {
    // Everything inside is the block's own: typing, dragging cards and clicking must not
    // reach ProseMirror, which would move the cursor, select the block or start a drop.
    return ReactNodeViewRenderer(LazyDatabaseView, { stopEvent: () => true });
  },
});
