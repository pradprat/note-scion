"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileText, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TrashItem } from "@/lib/types";
import { useBackend } from "./backend";
import { ago } from "./time";
import TopBar from "./top-bar";
import { useNow, useTitle } from "./title-text";
import { useReturnFocus } from "./use-return-focus";
import { titleText } from "@/lib/title-dates";

/** Taller buttons where the pointer is a finger. */
const COARSE = "[@media(pointer:coarse)]:h-10";

export default function TrashView({ items, days }: { items: TrashItem[]; days: number }) {
  const backend = useBackend();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What just happened, said in words, since the row it happened to is gone. A restored
  // page can be opened from here.
  const [notice, setNotice] = useState<{ text: string; openId?: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const emptyRef = useReturnFocus<HTMLButtonElement>(confirmEmpty);
  const today = useNow();

  // Relative times are worked out in the browser, so server and client render the same.
  useEffect(() => setNow(Date.now()), []);

  // Rows hide at once and stay hidden until the list catches up. After that the id is
  // forgotten, so a page restored here and trashed again later shows up again.
  useEffect(() => {
    setHidden((prev) => {
      const present = new Set(items.map((item) => item.id));
      const next = new Set(Array.from(prev).filter((id) => present.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const visible = items.filter((item) => !hidden.has(item.id));

  /** Focus goes to the row that takes this one's place, or to the heading. */
  const focusAfter = (id: string | null) => {
    requestAnimationFrame(() => {
      const next = id ? document.querySelector<HTMLElement>(`[data-trash-id="${id}"] [data-restore]`) : null;
      (next ?? headingRef.current)?.focus();
    });
  };

  const run = async (
    id: string,
    action: () => Promise<unknown>,
    done: { text: string; openId?: string },
    failure: string
  ) => {
    setError(null);
    const at = visible.findIndex((item) => item.id === id);
    const next = visible[at + 1] ?? visible[at - 1];
    setHidden((prev) => new Set(prev).add(id));
    focusAfter(next?.id ?? null);
    try {
      await action();
      setNotice(done);
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
    focusAfter(null);
    try {
      await backend.emptyTrash();
      setNotice({ text: "Emptied the trash." });
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
            <h1 ref={headingRef} tabIndex={-1} className="mb-2 text-4xl font-bold tracking-tight outline-none">
              Trash
            </h1>
            {/* "pretty" keeps the last word from wrapping onto a line of its own. */}
            <p className="text-muted-foreground [text-wrap:pretty]">
              {backend.demo
                ? `Deleted pages wait here for ${days} days, or until you reset the demo.`
                : `Deleted pages wait here for ${days} days, then they're gone for good.`}
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
              <Button ref={emptyRef} variant="outline" size="sm" onClick={() => setConfirmEmpty(true)} className={COARSE}>
                Empty trash
              </Button>
            ))}
        </div>

        {/* Always mounted, so a screen reader hears each notice as it arrives. */}
        <p aria-live="polite" className={notice ? "mb-4 text-sm text-muted-foreground" : "sr-only"}>
          {notice?.text}
          {notice?.openId && (
            <>
              {" "}
              <Link
                href={backend.href(`/${notice.openId}`)}
                className="rounded-sm font-medium text-foreground underline decoration-muted-foreground underline-offset-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Open it
              </Link>
            </>
          )}
        </p>

        {error && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        )}

        {visible.length === 0 ? (
          <div className="rounded-lg border border-dashed px-6 py-12 text-center">
            <p className="font-medium">The trash is empty</p>
            <p className="mt-1 text-sm text-muted-foreground [text-wrap:balance]">
              {backend.demo
                ? "Pages you delete from the sidebar land here first."
                : "Pages you delete from the sidebar, and pages Claude deletes, land here first."}
            </p>
          </div>
        ) : (
          <ul className="divide-y border-y">
            {visible.map((item) => {
              const title = titleText(item.title, today);
              return (
                <TrashRow
                  key={item.id}
                  item={item}
                  now={now}
                  onRestore={() =>
                    void run(
                      item.id,
                      () => backend.restorePage(item.id),
                      { text: `Restored “${title}”.`, openId: item.id },
                      `Couldn't restore “${title}”.`
                    )
                  }
                  onDelete={() =>
                    void run(
                      item.id,
                      () => backend.deleteForever(item.id),
                      { text: `Deleted “${title}” for good.` },
                      `Couldn't delete “${title}”.`
                    )
                  }
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
  const deleteRef = useReturnFocus<HTMLButtonElement>(confirming);
  const title = useTitle(item.title);
  const today = useNow();
  const meta = [
    item.parentTitle !== null ? `from ${titleText(item.parentTitle, today)}` : null,
    item.subPageCount > 0 ? `with ${item.subPageCount} sub-page${item.subPageCount === 1 ? "" : "s"}` : null,
    now !== null ? `deleted ${ago(item.deletedAt, now)}` : null,
  ].filter(Boolean);

  return (
    <li data-trash-id={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
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
            <Button
              variant="ghost"
              size="sm"
              data-restore=""
              aria-label={`Restore ${title}`}
              onClick={onRestore}
              className={COARSE}
            >
              <RotateCcw /> Restore
            </Button>
            <Button
              ref={deleteRef}
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
