"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Editor, JSONContent } from "@tiptap/react";
import { Check, LinkIcon, SmilePlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { exactTime, timeAgo } from "@/lib/dates";
import type { McpEdit, NotePage, NotePatch } from "@/lib/types";
import { useBackend } from "./backend";
import { useNotes } from "./notes-provider";
import IconPicker from "./icon-picker";
import NoteEditor from "./editor";
import TopBar from "./top-bar";
import { useTitleDates } from "./title-dates";

type SaveStatus = "saved" | "unsaved" | "saving" | "error" | "conflict" | "missing";

const SAVE_DELAY = 800;

const newer = (a: string, b: string) => Date.parse(a) > Date.parse(b);

/**
 * Batches edits into one debounced, strictly ordered save per pause in typing. Every save
 * names the version it was made on; if the page was saved elsewhere since (Claude over
 * MCP, another tab), the server refuses it and the page stops saving until the conflict
 * is resolved, rather than writing an old copy over the newer one.
 */
function useAutosave(page: NotePage, applyRemote: (page: NotePage) => void) {
  const backend = useBackend();
  const [status, setStatus] = useState<SaveStatus>("saved");
  // The last edit, if an MCP client made it. Our own save makes us the last editor.
  const [mcpEdit, setMcpEdit] = useState(page.mcpEdit);
  const pending = useRef<NotePatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const base = useRef(page.updatedAt);
  const inFlight = useRef(false);
  const blocked = useRef(false);

  const hasPending = () => Object.keys(pending.current).length > 0;

  const flush = useCallback(
    (overwrite = false) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (blocked.current && !overwrite) return chain.current;
      // Chained so an older save can never land after a newer one.
      chain.current = chain.current.then(async () => {
        const patch = pending.current;
        if (Object.keys(patch).length === 0) return;
        pending.current = {};
        inFlight.current = true;
        setStatus("saving");
        try {
          // ProseMirror builds node attrs with Object.create(null). React's action
          // serializer only sends plain objects as data and turns anything else into an
          // opaque reference the server can't read, so hand it plain JSON.
          const result = await backend.updatePage(
            page.id,
            JSON.parse(JSON.stringify(patch)) as NotePatch,
            overwrite ? null : base.current
          );
          if (result.status === "saved") {
            base.current = result.updatedAt;
            blocked.current = false;
            setMcpEdit(null);
            setStatus(hasPending() ? "unsaved" : "saved");
          } else {
            // Keep what didn't land, under anything typed since.
            pending.current = { ...patch, ...pending.current };
            blocked.current = true;
            setStatus(result.status);
          }
        } catch {
          pending.current = { ...patch, ...pending.current };
          setStatus("error");
        } finally {
          inFlight.current = false;
        }
      });
      return chain.current;
    },
    [backend, page.id]
  );

  const schedule = useCallback(
    (patch: NotePatch) => {
      Object.assign(pending.current, patch);
      if (blocked.current) return;
      setStatus("unsaved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY);
    },
    [flush]
  );

  // A fresher copy from the server (refresh on focus). Nothing unsaved here: take it.
  // Unsaved edits on top of an older copy: that's a conflict, say so before saving.
  useEffect(() => {
    if (inFlight.current || !newer(page.updatedAt, base.current)) return;
    if (hasPending() || blocked.current) {
      blocked.current = true;
      if (timer.current) clearTimeout(timer.current);
      setStatus("conflict");
      return;
    }
    base.current = page.updatedAt;
    setMcpEdit(page.mcpEdit);
    applyRemote(page);
  }, [page, applyRemote]);

  /** Drops local edits and loads what is stored now. */
  const loadLatest = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    await chain.current;
    const latest = await backend.getPage(page.id);
    if (!latest) {
      setStatus("missing");
      return;
    }
    pending.current = {};
    blocked.current = false;
    base.current = latest.updatedAt;
    setMcpEdit(latest.mcpEdit);
    applyRemote(latest);
    setStatus("saved");
  }, [backend, page.id, applyRemote]);

  const keepMine = useCallback(() => flush(true), [flush]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPending()) return;
      void flush();
      event.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Leaving the page inside the app: save whatever is still waiting.
      void flush();
    };
  }, [flush]);

  return { status, mcpEdit, schedule, flush, loadLatest, keepMine };
}

/** `after` sits in the page column under the last block, outside the editable text. */
export default function PageView({ page, after }: { page: NotePage; after?: React.ReactNode }) {
  const { ancestorsOf, patchNode, createPage } = useNotes();
  const router = useRouter();
  const { href } = useBackend();
  const [title, setTitle] = useState(page.title);
  const [icon, setIcon] = useState(page.icon);
  const [pickerOpen, setPickerOpen] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const applyRemote = useCallback(
    (latest: NotePage) => {
      setTitle(latest.title);
      setIcon(latest.icon);
      patchNode(latest.id, { title: latest.title, icon: latest.icon });
      editorRef.current?.commands.setContent(latest.content ?? "", { emitUpdate: false });
    },
    [patchNode]
  );

  const { status, mcpEdit, schedule, flush, loadLatest, keepMine } = useAutosave(page, applyRemote);

  const ancestors = ancestorsOf(page.id);

  // Grow the title box with its text.
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  // A fresh page opens with the cursor in the title.
  useEffect(() => {
    if (!page.title && !page.content) titleRef.current?.focus();
    // Only on first open: a refreshed copy must not steal focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeTitle = (value: string) => {
    const clean = value.replace(/\n/g, " ");
    setTitle(clean);
    patchNode(page.id, { title: clean });
    schedule({ title: clean });
  };

  // "@today" in the title writes the date there.
  const titleDates = useTitleDates(titleRef, (value, caret) => {
    changeTitle(value);
    requestAnimationFrame(() => titleRef.current?.setSelectionRange(caret, caret));
  });

  const changeIcon = (value: string | null) => {
    setIcon(value);
    // The popover hands focus back to its trigger as it closes.
    setPickerOpen(false);
    patchNode(page.id, { icon: value });
    schedule({ icon: value });
  };

  const onEditorChange = useCallback((content: JSONContent) => schedule({ content }), [schedule]);
  const onEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
  }, []);

  /** "/page" in the body: a new page inside this one. */
  const createChild = useCallback(async () => {
    try {
      return (await createPage(page.id)).id;
    } catch {
      return null;
    }
  }, [createPage, page.id]);
  // Leaving saves the new block here first (the autosave flushes on unmount).
  const openPage = useCallback((id: string) => router.push(href(`/${id}`)), [router, href]);

  /** Back up from the page body: the cursor lands at the end of the title. */
  const focusTitleEnd = useCallback(() => {
    const el = titleRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const onTitleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (titleDates.onKeyDown(event)) return;
    const editor = editorRef.current;
    if (!editor || event.nativeEvent.isComposing || event.altKey || event.metaKey || event.ctrlKey) return;
    const el = event.currentTarget;
    const caretAtEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;

    if (event.key === "Enter") {
      event.preventDefault();
      // Enter inside the title carries the rest of it down as the first line of the page.
      const rest = caretAtEnd || event.shiftKey ? "" : el.value.slice(el.selectionEnd).trim();
      if (rest) {
        changeTitle(el.value.slice(0, el.selectionStart).trimEnd());
        // On an empty page it replaces the blank first line rather than stacking above it.
        const at = editor.isEmpty ? { from: 0, to: editor.state.doc.content.size } : 0;
        editor
          .chain()
          .insertContentAt(at, { type: "paragraph", content: [{ type: "text", text: rest }] })
          .setTextSelection(1)
          .focus()
          .run();
      } else {
        editor.commands.focus("start");
      }
    } else if (event.key === "ArrowDown" && !event.shiftKey) {
      // Only from the title's last line; a wrapped title moves down through itself first.
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 0;
      const oneLine = el.scrollHeight < lineHeight * 1.5;
      if (caretAtEnd || oneLine) {
        event.preventDefault();
        editor.commands.focus("start");
      }
    }
  };

  /**
   * A click in the open space under the page writes at its end. When the page ends in a
   * list, heading or code, a fresh line is added there first so the click starts plain text.
   */
  const writeAtEnd = (event: React.MouseEvent) => {
    const editor = editorRef.current;
    if (!editor || event.button !== 0) return;
    event.preventDefault();
    const last = editor.state.doc.lastChild;
    const endsInEmptyLine = last?.type.name === "paragraph" && last.content.size === 0;
    const chain = editor.chain();
    if (!endsInEmptyLine) chain.insertContentAt(editor.state.doc.content.size, { type: "paragraph" });
    chain.focus("end").run();
  };

  return (
    <>
      <TopBar
        end={
          <>
            <SaveIndicator status={status} mcpEdit={mcpEdit} onRetry={() => void flush()} />
            <CopyLinkButton id={page.id} />
          </>
        }
      >
        <Breadcrumb>
          <BreadcrumbList className="flex-nowrap gap-1 sm:gap-1">
            {ancestors.map((node) => (
              <Fragment key={node.id}>
                <BreadcrumbItem className="min-w-0 shrink-[2]">
                  <BreadcrumbLink asChild>
                    <Link href={href(`/${node.id}`)} className="flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5">
                      {node.icon && <span aria-hidden>{node.icon}</span>}
                      <span className="truncate">{node.title.trim() || "Untitled"}</span>
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </Fragment>
            ))}
            {/* Ancestors give way first. Factors stay at 1 or more: below that, a page with
                no ancestors would take only part of the squeeze and spill into the status. */}
            <BreadcrumbItem className="min-w-0 shrink">
              <BreadcrumbPage className="flex min-w-0 items-center gap-1.5 px-1">
                {icon && <span aria-hidden>{icon}</span>}
                <span className="truncate">{title.trim() || "Untitled"}</span>
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </TopBar>

      {(status === "conflict" || status === "missing") && (
        <ConflictBar status={status} onLoadLatest={() => void loadLatest()} onKeepMine={() => void keepMine()} />
      )}

      <article className="mx-auto w-full max-w-3xl px-6 pt-10 sm:px-16 sm:pt-16">
        <header className="group/header mb-4">
          <div className="mb-2">
            <IconPicker
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              current={icon}
              onPick={changeIcon}
              onRemove={icon ? () => changeIcon(null) : null}
            >
              {/* One trigger for both states, so focus returns to it after a pick. */}
              <Button
                variant="ghost"
                aria-label={icon ? "Change icon" : undefined}
                className={cn(
                  icon
                    ? "-ml-1 h-auto px-1 py-0 text-6xl font-normal leading-none"
                    : "-ml-2 h-8 px-2 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover/header:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
                )}
              >
                {icon ?? (
                  <>
                    <SmilePlus /> Add icon
                  </>
                )}
              </Button>
            </IconPicker>
          </div>

          <div className="relative">
            <textarea
              ref={titleRef}
              value={title}
              rows={1}
              placeholder="Untitled"
              aria-label="Page title"
              maxLength={500}
              onChange={(event) => {
                changeTitle(event.target.value);
                titleDates.sync();
              }}
              onSelect={titleDates.sync}
              onBlur={titleDates.close}
              onKeyDown={onTitleKeyDown}
              className="block w-full resize-none overflow-hidden bg-transparent text-4xl font-bold leading-tight tracking-tight outline-none placeholder:text-muted-foreground/60 [text-wrap:balance]"
            />
            {titleDates.menu}
          </div>
        </header>

        <NoteEditor
          content={page.content}
          onChange={onEditorChange}
          onReady={onEditorReady}
          onExitTop={focusTitleEnd}
          onCreateChild={createChild}
          onOpenPage={openPage}
        />
        {after}
        {/* Mouse-only shortcut; from the keyboard the end of the page is Mod+End. */}
        <div aria-hidden className="h-[max(10rem,35vh)] cursor-text" onMouseDown={writeAtEnd} />
      </article>
    </>
  );
}

function ConflictBar({
  status,
  onLoadLatest,
  onKeepMine,
}: {
  status: "conflict" | "missing";
  onLoadLatest: () => void;
  onKeepMine: () => void;
}) {
  const { href } = useBackend();
  return (
    <div role="alert" className="sticky top-12 z-10 border-y bg-muted px-6 py-2.5 sm:px-0">
      {/* Same column as the page text below, so the warning reads as part of the page. */}
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:px-16">
        {status === "conflict" ? (
          <>
            <p className="min-w-0 flex-1 basis-64">
              <span className="font-medium">This page changed somewhere else</span>
              <span className="text-muted-foreground">
                {" "}
                since you opened it, in another tab or by Claude. Your recent edits aren&apos;t saved yet.
              </span>
            </p>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onClick={onKeepMine} className={COARSE_BUTTON}>
                Keep my version
              </Button>
              <Button size="sm" onClick={onLoadLatest} className={COARSE_BUTTON}>
                Load latest
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="min-w-0 flex-1 basis-64">
              <span className="font-medium">This page was deleted somewhere else.</span>
              <span className="text-muted-foreground"> Edits here can&apos;t be saved. Copy anything you need first.</span>
            </p>
            <Button asChild variant="outline" size="sm" className={cn("shrink-0", COARSE_BUTTON)}>
              <Link href={href("/")}>Back to notes</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Taller buttons where the pointer is a finger. */
const COARSE_BUTTON = "[@media(pointer:coarse)]:h-10";

/** Copies this page's address. The link only opens for someone signed in. */
function CopyLinkButton({ id }: { id: string }) {
  const { href, demo } = useBackend();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  // A demo link only opens in the browser that wrote the page.
  if (demo) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${href(`/${id}`)}`);
      setCopied(true);
      toast.success("Link copied", { id: "notes-copy-link" });
    } catch {
      toast.error("Couldn't copy the link", { id: "notes-copy-link" });
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => void copy()}
      aria-label="Copy link to this page"
      title="Copy link"
      className="h-8 w-8 text-muted-foreground [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"
    >
      {copied ? <Check /> : <LinkIcon />}
    </Button>
  );
}

/**
 * Where the page stands: "Saved", "Saving…", "Editing", or, when an MCP client made the
 * last edit, who and when ("Claude Code edited 4m ago"), in words and in the same quiet
 * style. Only the words sit in the live region, which stays mounted, so a screen reader
 * hears "Claude Code edited" once as the edit arrives, not again as the time counts up.
 */
function SaveIndicator({
  status,
  mcpEdit,
  onRetry,
}: {
  status: SaveStatus;
  mcpEdit: McpEdit | null;
  onRetry: () => void;
}) {
  if (status === "error") {
    return (
      <Button variant="link" size="sm" onClick={onRetry} className="h-auto shrink-0 p-0 text-xs text-destructive">
        Couldn&apos;t save · Retry
      </Button>
    );
  }
  const edit = status === "saved" ? mcpEdit : null;
  const text = edit
    ? edit.client
      ? `${edit.client} edited`
      : "Edited over MCP"
    : status === "saved"
      ? "Saved"
      : status === "saving"
        ? "Saving…"
        : status === "unsaved"
          ? "Editing"
          : "Not saved";
  return (
    <span
      className={cn(
        "flex min-w-0 items-baseline gap-1 text-xs text-muted-foreground",
        (status === "conflict" || status === "missing") && "text-destructive"
      )}
    >
      {/* A long client name gives way before the time does. */}
      <span aria-live="polite" className="min-w-0 max-w-[8rem] truncate sm:max-w-[14rem]">
        {text}
      </span>
      {/* A real space, so the two read as words, not "edited4m ago". */}
      {edit && " "}
      {edit && <EditedAgo at={edit.at} />}
    </span>
  );
}

/** "4m ago", kept current while it's on screen; the exact time on hover. */
function EditedAgo({ at }: { at: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, 30_000);
    // A laptop waking from sleep shows the right time at once.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return (
    <time dateTime={at} title={exactTime(at)} className="shrink-0 whitespace-nowrap" suppressHydrationWarning>
      {timeAgo(at, now)}
    </time>
  );
}
