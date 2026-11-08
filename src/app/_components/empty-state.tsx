"use client";

import { useState } from "react";
import { Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBackend } from "./backend";
import { useNotes } from "./notes-provider";
import { useShell } from "./notes-shell";
import TopBar from "./top-bar";

const KBD =
  "pointer-events-none inline-flex h-5 select-none items-center rounded border bg-muted px-1.5 font-mono text-[0.625rem] font-medium text-foreground";

export default function EmptyState() {
  const { addPage } = useNotes();
  const { modKey } = useShell();
  const { demo, reset } = useBackend();
  const [busy, setBusy] = useState<"new" | "samples" | null>(null);

  const run = async (which: "new" | "samples", action: () => Promise<unknown>) => {
    setBusy(which);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

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
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy !== null} onClick={() => void run("new", () => addPage(null))}>
            <Plus /> {busy === "new" ? "Creating…" : "New page"}
          </Button>
          {/* In the demo, the way back to the tour after deleting everything. */}
          {demo && reset && (
            <Button variant="ghost" disabled={busy !== null} onClick={() => void run("samples", reset)}>
              <RotateCcw /> {busy === "samples" ? "Bringing them back…" : "Bring back the sample pages"}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
