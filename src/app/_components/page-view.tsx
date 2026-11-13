"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState } from "react";
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
import { comparable } from "@/lib/comparable";
import { exactTime, timeAgo } from "@/lib/dates";
import type { McpEdit, NotePage, NotePatch } from "@/lib/types";
import { useBackend } from "./backend";
import { useNotes } from "./notes-provider";
import IconPicker from "./icon-picker";
import NoteEditor from "./editor";
import TopBar from "./top-bar";
import TitleEditor, { type TitleEditorHandle } from "./title-editor";
import TitleText, { useTitle } from "./title-text";
import { applyRemoteContent } from "./remote-content";

type SaveStatus = "saved" | "unsaved" | "saving" | "error" | "conflict" | "missing";

const SAVE_DELAY = 800;

const newer = (a: string, b: string) => Date.parse(a) > Date.parse(b);

/**
 * Lets something under the page hold its autosave for a while: the demo's stand-in for
 * Claude holds it through the countdown, so typing then is still unsaved when the edit
 * lands, which is what makes a real conflict. Edits still save when you leave the page.
 */
const HoldSavesContext = createContext<(held: boolean) => void>(() => {});
export const useHoldSaves = () => useContext(HoldSavesContext);

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
  const held = useRef(false);
  // The body as stored now, to tell an edit from the editor tidying what it loaded.
  const stored = useRef(comparable(page.content));

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
            if (patch.content !== undefined) stored.current = comparable(patch.content);
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
      // Not an edit: the editor only tidied the stored page. Saving it would cost a write
      // for nothing, and if Claude's edit arrived meanwhile it would pass for a conflict.
      const keys = Object.keys(patch);
      if (
        keys.length === 1 &&
        keys[0] === "content" &&
        !hasPending() &&
        comparable(patch.content) === stored.current
      ) {
        return;
      }
      Object.assign(pending.current, patch);
      if (blocked.current) return;
      setStatus("unsaved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = held.current ? null : setTimeout(() => void flush(), SAVE_DELAY);
    },
    [flush]
  );

  const hold = useCallback(
    (on: boolean) => {
      held.current = on;
      // Released: what was typed meanwhile saves as usual, unless it's now a conflict.
      if (!on && hasPending() && !blocked.current) schedule({});
    },
    [schedule]
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
    stored.current = comparable(page.content);
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
    stored.current = comparable(latest.content);
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

  return { status, mcpEdit, schedule, flush, loadLatest, keepMine, hold };
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
  const titleRef = useRef<TitleEditorHandle>(null);

  const applyRemote = useCallback(
    (latest: NotePage) => {
      setTitle(latest.title);
      titleRef.current?.setTitle(latest.title);
      setIcon(latest.icon);
      patchNode(latest.id, { title: latest.title, icon: latest.icon });
      if (editorRef.current) applyRemoteContent(editorRef.current, latest.content);
    },
    [patchNode]
  );

  const { status, mcpEdit, schedule, flush, loadLatest, keepMine, hold } = useAutosave(page, applyRemote);

  const ancestors = ancestorsOf(page.id);

  // The browser tab follows the title as it's typed, with its dates read relative to today.
  const tabTitle = useTitle(title);
  useEffect(() => {
    document.title = `Notes | ${tabTitle}`;
  }, [tabTitle]);

  const changeTitle = useCallback(
    (value: string) => {
      setTitle(value);
      patchNode(page.id, { title: value });
      schedule({ title: value });
    },
    [patchNode, page.id, schedule]
  );

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
  const focusTitleEnd = useCallback(() => titleRef.current?.focusEnd(), []);

  /**
   * Enter or Down in the title moves into the page. What followed the cursor comes down
   * as the page's first line; on an empty page it takes the blank line's place.
   */
  const leaveTitle = useCallback((rest: JSONContent[] | null) => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!rest?.length) {
      editor.commands.focus("start");
      return;
    }
    const at = editor.isEmpty ? { from: 0, to: editor.state.doc.content.size } : 0;
    editor.chain().insertContentAt(at, { type: "paragraph", content: rest }).setTextSelection(1).focus().run();
  }, []);

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
                      <span className="truncate">
                        <TitleText title={node.title} />
                      </span>
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
                <span className="truncate">
                  <TitleText title={title} />
                </span>
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </TopBar>

      {(status === "conflict" || status === "missing") && (
        <ConflictBar pageId={page.id} status={status} onLoadLatest={() => void loadLatest()} onKeepMine={() => void keepMine()} />
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

          <TitleEditor
            ref={titleRef}
            title={page.title}
            // A fresh page opens with the cursor in the title (only on first open).
            autoFocus={!page.title && !page.content}
            onChange={changeTitle}
            onExit={leaveTitle}
          />
        </header>

        <NoteEditor
          content={page.content}
          onChange={onEditorChange}
          onReady={onEditorReady}
          onExitTop={focusTitleEnd}
          onCreateChild={createChild}
          onOpenPage={openPage}
        />
        <HoldSavesContext.Provider value={hold}>{after}</HoldSavesContext.Provider>
        {/* Mouse-only shortcut; from the keyboard the end of the page is Mod+End. */}
        <div aria-hidden className="h-[max(10rem,35vh)] cursor-text" onMouseDown={writeAtEnd} />
      </article>
    </>
  );
}

function ConflictBar({
  pageId,
  status,
  onLoadLatest,
  onKeepMine,
}: {
  pageId: string;
  status: "conflict" | "missing";
  onLoadLatest: () => void;
  onKeepMine: () => void;
}) {
  const { href } = useBackend();
  const [showNewer, setShowNewer] = useState(false);
  return (
    <div className="sticky top-12 z-10 border-y bg-muted px-6 py-2.5 sm:px-0">
      {/* Same column as the page text below, so the warning reads as part of the page. */}
      <div className="mx-auto max-w-3xl text-sm sm:px-16">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {status === "conflict" ? (
            <>
              {/* Only the message is the alert, so opening the newer version isn't read out again. */}
              <p role="alert" className="min-w-0 flex-1 basis-64">
                <span className="font-medium">This page changed somewhere else</span>
                <span className="text-muted-foreground">
                  {" "}
                  since you opened it, in another tab or by Claude. Your recent edits aren&apos;t saved yet. The
                  version you keep replaces the other one.
                </span>
              </p>
              {/* Neither choice is the obvious one, so neither looks like the default. */}
              {/* The two choices stay side by side; on a phone the look-first button sits above them. */}
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-expanded={showNewer}
                  aria-controls="notes-newer-version"
                  onClick={() => setShowNewer((open) => !open)}
                  // The bar is already the muted fill a ghost hover uses: the page color shows instead.
                  className={cn("-ml-3 hover:bg-background", COARSE_BUTTON)}
                >
                  {showNewer ? "Hide the newer version" : "Show the newer version"}
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={onKeepMine} className={COARSE_BUTTON}>
                    Keep my version
                  </Button>
                  <Button variant="outline" size="sm" onClick={onLoadLatest} className={COARSE_BUTTON}>
                    Keep the newer version
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <p role="alert" className="min-w-0 flex-1 basis-64">
                <span className="font-medium">This page was deleted somewhere else.</span>
                <span className="text-muted-foreground"> Edits here can&apos;t be saved. Copy anything you need first.</span>
              </p>
              <Button asChild variant="outline" size="sm" className={cn("shrink-0", COARSE_BUTTON)}>
                <Link href={href("/")}>Back to notes</Link>
              </Button>
            </>
          )}
        </div>
        {status === "conflict" && showNewer && <NewerVersion id="notes-newer-version" pageId={pageId} />}
      </div>
    </div>
  );
}

/**
 * The stored copy that a conflict is about, read-only and as Markdown (the form Claude
 * reads and writes), so the choice between versions isn't made blind.
 */
function NewerVersion({ id, pageId }: { id: string; pageId: string }) {
  const backend = useBackend();
  const { tree } = useNotes();
  const [view, setView] = useState<{ title: string; body: string } | "loading" | "error" | "missing">("loading");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [latest, { toMarkdown }] = await Promise.all([backend.getPage(pageId), import("@/lib/markdown")]);
        if (!live) return;
        if (!latest) return setView("missing");
        const titleOf = (target: string) => tree.find((node) => node.id === target)?.title;
        setView({ title: latest.title, body: toMarkdown(latest.content, titleOf) });
      } catch {
        if (live) setView("error");
      }
    })();
    return () => {
      live = false;
    };
  }, [backend, pageId, tree]);

  return (
    <div id={id} className="mt-2.5 mb-1 max-h-[40vh] overflow-auto rounded-md border bg-background px-4 py-3">
      {view === "loading" ? (
        <p className="text-muted-foreground">Loading the newer version…</p>
      ) : view === "error" ? (
        <p className="text-muted-foreground">Couldn&apos;t load the newer version. Check your connection and try again.</p>
      ) : view === "missing" ? (
        <p className="text-muted-foreground">The newer version is gone: this page was deleted somewhere else.</p>
      ) : (
        <>
          <p className="mb-2 font-medium">
            <TitleText title={view.title || "Untitled"} />
          </p>
          {view.body ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-[1.55] text-foreground">
              {view.body}
            </pre>
          ) : (
            <p className="text-muted-foreground">This version of the page is empty.</p>
          )}
        </>
      )}
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
      className="h-8 w-8 shrink-0 text-muted-foreground [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"
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
      {/* On a phone the top bar is too narrow for both, and the page name needs the room
          more than the time does: there it reads "Claude edited". A real space inside, so
          the two read as words, not "edited4m ago". */}
      {edit && (
        <span className="hidden shrink-0 sm:inline">
          {" "}
          <EditedAgo at={edit.at} />
        </span>
      )}
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
