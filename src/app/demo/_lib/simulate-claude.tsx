"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { simulateClaudeEdit } from "./demo-store";

/** Long enough to click into the page and start typing, for a real conflict. */
const COUNTDOWN = 4;

/**
 * Stands in for Claude on the page that explains it, because no MCP client can reach a
 * demo that lives in the browser. After a short countdown it writes to the page through
 * the store, and the page takes it as it would a real MCP edit: the text appears, the
 * save status names Claude, and unsaved typing turns it into a conflict.
 */
export default function SimulateClaude({ pageId }: { pageId: string }) {
  const [left, setLeft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Leaving the page (or resetting the demo) calls the edit off.
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    []
  );

  const start = () => {
    if (timer.current) return;
    let count = COUNTDOWN;
    setLeft(count);
    timer.current = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setLeft(count);
        return;
      }
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      setLeft(null);
      void simulateClaudeEdit(pageId);
    }, 1000);
  };

  const waiting = left !== null;

  return (
    <aside aria-label="Demo" className="mt-10 border-t pt-6 text-sm">
      <p className="mb-4 text-muted-foreground [text-wrap:pretty]">
        This demo can&apos;t reach Claude, so this button plays its part. It adds a to-do to the end of this page,
        as Claude would over MCP. To see a conflict, keep typing on the page while it counts down.
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* aria-disabled rather than disabled, so focus stays on the button while it waits. */}
        <Button
          variant="outline"
          size="sm"
          aria-disabled={waiting}
          onClick={start}
          className="aria-disabled:cursor-default aria-disabled:opacity-50 [@media(pointer:coarse)]:h-10"
        >
          Simulate an edit from Claude
        </Button>
        {/* Announced once; the count itself only changes on screen. */}
        <span aria-live="polite" className="text-muted-foreground tabular-nums">
          {waiting && (
            <>
              Claude edits this page in <span aria-hidden>{left}…</span>
              <span className="sr-only">a few seconds</span>
            </>
          )}
        </span>
      </div>
    </aside>
  );
}
