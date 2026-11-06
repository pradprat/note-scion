"use client";

import { useEffect, useState } from "react";
import { FileText, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TrashItem } from "@/lib/types";

/** Taller buttons where the pointer is a finger. */
const COARSE = "[@media(pointer:coarse)]:h-10";
import { useBackend } from "./backend";
import { ago } from "./time";
import TopBar from "./top-bar";

export default function TrashView({ items, days }: { items: TrashItem[]; days: number }) {
  const backend = useBackend();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Relative times are worked out in the browser, so server and client render the same.
  useEffect(() => setNow(Date.now()), []);

  const visible = items.filter((item) => !hidden.has(item.id));

  const run = async (id: string, action: () => Promise<unknown>, failure: string) => {
    setError(null);
    setHidden((prev) => new Set(prev).add(id));
    try {
      await action();
      backend.refresh();
    } catch {
      setHidden((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setError(failure);
    }
  };

  const emptyAll = async () => {
    setConfirmEmpty(false);
    setError(null);
    const before = hidden;
    setHidden(new Set(items.map((item) => item.id)));
    try {
      await backend.emptyTrash();
      backend.refresh();
    } catch {
      setHidden(before);
      setError("Couldn't empty the trash. Try again.");
    }
  };

  return (
    <>
      <TopBar>
        <span className="flex items-center gap-1.5 px-1 text-sm">
          <Trash2 size={14} className="text-muted-foreground" aria-hidden /> Trash
        </span>
      </TopBar>

      <div className="mx-auto w-full max-w-3xl px-6 pb-40 pt-10 sm:px-16 sm:pt-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="mb-2 text-4xl font-bold tracking-tight">Trash</h1>
            <p className="text-muted-foreground">
              Deleted pages wait here for {days} days, then they&apos;re gone for good.
            </p>
          </div>
          {visible.length > 0 &&
            (confirmEmpty ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Delete all {visible.length} for good?</span>
                <Button variant="ghost" size="sm" onClick={() => setConfirmEmpty(false)} className={COARSE}>
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" autoFocus onClick={() => void emptyAll()} className={COARSE}>
                  Empty trash
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setConfirmEmpty(true)} className={COARSE}>
                Empty trash
              </Button>
            ))}
        </div>

        {error && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        )}

        {visible.length === 0 ? (
          <div className="rounded-lg border border-dashed px-6 py-12 text-center">
            <p className="font-medium">The trash is empty</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Pages you delete from the sidebar, and pages Claude deletes, land here first.
            </p>
          </div>
        ) : (
          <ul className="divide-y border-y">
            {visible.map((item) => {
              const title = item.title.trim() || "Untitled";
              return (
                <TrashRow
                  key={item.id}
                  item={item}
                  now={now}
                  onRestore={() => void run(item.id, () => backend.restorePage(item.id), `Couldn't restore “${title}”.`)}
                  onDelete={() => void run(item.id, () => backend.deleteForever(item.id), `Couldn't delete “${title}”.`)}
                />
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function TrashRow({
  item,
  now,
  onRestore,
  onDelete,
}: {
  item: TrashItem;
  now: number | null;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const title = item.title.trim() || "Untitled";
  const meta = [
    item.parentTitle !== null ? `from ${item.parentTitle.trim() || "Untitled"}` : null,
    item.subPageCount > 0 ? `with ${item.subPageCount} sub-page${item.subPageCount === 1 ? "" : "s"}` : null,
    now !== null ? `deleted ${ago(item.deletedAt, now)}` : null,
  ].filter(Boolean);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <span className="flex w-5 shrink-0 justify-center leading-none" aria-hidden>
        {item.icon ?? <FileText size={15} className="text-muted-foreground" />}
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate">{title}</p>
        <p className="min-h-4 truncate text-xs text-muted-foreground">{meta.join(" · ")}</p>
      </div>
      <div className="flex w-full shrink-0 items-center gap-1 pl-[22px] text-sm sm:w-auto sm:pl-0">
        {confirming ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} className={COARSE}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" autoFocus onClick={onDelete} className={COARSE}>
              Delete for good
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={onRestore} className={COARSE}>
              <RotateCcw /> Restore
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setConfirming(true)}
              aria-label={`Delete ${title} for good`}
              title="Delete for good"
              className="h-9 w-9 text-muted-foreground hover:text-destructive [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"
            >
              <Trash2 />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
