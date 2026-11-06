"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotes } from "./notes-provider";
import { useShell } from "./notes-shell";
import TopBar from "./top-bar";

const KBD =
  "pointer-events-none inline-flex h-5 select-none items-center rounded border bg-muted px-1.5 font-mono text-[0.6875rem] font-medium text-foreground";

export default function EmptyState() {
  const { addPage } = useNotes();
  const { modKey } = useShell();
  const [busy, setBusy] = useState(false);

  return (
    <>
      <TopBar />
      <div className="mx-auto flex max-w-md flex-col items-start px-6 py-20 sm:py-28">
        <h1 className="mb-3 text-2xl font-semibold tracking-tight">Start your first page</h1>
        <p className="mb-6 text-muted-foreground">
          Pages can hold other pages. Inside a page, type <kbd className={KBD}>/</kbd> for headings, lists, to-dos and
          code
          {modKey && (
            <>
              , and press <kbd className={KBD}>{modKey} K</kbd> anywhere to jump between pages
            </>
          )}
          .
        </p>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await addPage(null);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Plus /> {busy ? "Creating…" : "New page"}
        </Button>
      </div>
    </>
  );
}
