"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight,
  Ellipsis,
  FileText,
  Loader2,
  LogOut,
  PanelLeftClose,
  Plug,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { NoteNode } from "@/lib/types";
import { useBackend } from "./backend";
import { useNotes } from "./notes-provider";
import { useShell } from "./notes-shell";
import { useTitle } from "./title-text";
import { useReturnFocus } from "./use-return-focus";

/** Touch screens get finger-sized rows and buttons; a mouse keeps the dense tree. */
const COARSE_ROW = "[@media(pointer:coarse)]:h-10";
const COARSE_ICON = "[@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10";
/** Small ghost icon button that sits on a sidebar row. */
const ROW_ICON = cn(
  "h-6 w-6 shrink-0 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-border hover:text-sidebar-accent-foreground [&_svg]:size-3.5",
  COARSE_ICON
);
const INDENT = 14;
/** Hovering a collapsed page this long while dragging opens it. */
const EXPAND_DELAY = 600;

// ------------------------------------------------------------------ drag and drop

type Zone = "before" | "after" | "inside";
type Drop = { id: string; zone: Zone } | { id: null; zone: "root" };

interface DragContextValue {
  dragId: string | null;
  drop: Drop | null;
  start: (id: string) => void;
  /** Works out the drop for the pointer over a row; null when it would be invalid. */
  over: (node: NoteNode, event: React.DragEvent<HTMLElement>) => boolean;
  overRoot: () => boolean;
  finish: () => void;
  end: () => void;
}

const DragContext = createContext<DragContextValue | null>(null);
const useDrag = () => useContext(DragContext)!;

function DragProvider({ children }: { children: React.ReactNode }) {
  const { tree, childrenOf, subtreeOf, movePage, isExpanded, toggleExpanded } = useNotes();
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const expandTimer = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const forbidden = useRef<Set<string>>(new Set());

  const clearExpand = () => {
    if (expandTimer.current) clearTimeout(expandTimer.current.timer);
    expandTimer.current = null;
  };

  const value: DragContextValue = {
    dragId,
    drop,
    start: (id) => {
      // A page can't go inside itself or anything under it.
      forbidden.current = subtreeOf(id);
      setDragId(id);
    },
    over: (node, event) => {
      if (!dragId || forbidden.current.has(node.id)) {
        if (drop) setDrop(null);
        return false;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const y = (event.clientY - rect.top) / rect.height;
      const zone: Zone = y < 0.28 ? "before" : y > 0.72 ? "after" : "inside";
      if (drop?.id !== node.id || drop.zone !== zone) setDrop({ id: node.id, zone });

      if (zone === "inside" && !isExpanded(node.id) && childrenOf(node.id).length > 0) {
        if (expandTimer.current?.id !== node.id) {
          clearExpand();
          expandTimer.current = { id: node.id, timer: setTimeout(() => toggleExpanded(node.id), EXPAND_DELAY) };
        }
      } else if (expandTimer.current?.id === node.id) {
        clearExpand();
      }
      return true;
    },
    overRoot: () => {
      if (!dragId) return false;
      if (drop?.zone !== "root") setDrop({ id: null, zone: "root" });
      return true;
    },
    finish: () => {
      clearExpand();
      const id = dragId;
      const target = drop;
      setDragId(null);
      setDrop(null);
      if (!id || !target) return;

      const siblingsOf = (parentId: string | null) => childrenOf(parentId).filter((n) => n.id !== id);
      const last = (list: NoteNode[]) => (list.length ? list[list.length - 1].position + 1 : 1);

      if (target.zone === "root") {
        movePage(id, null, last(siblingsOf(null)));
        return;
      }
      const node = tree.find((n) => n.id === target.id);
      if (!node) return;

      if (target.zone === "inside") {
        movePage(id, node.id, last(siblingsOf(node.id)));
        return;
      }
      // Below an open page with sub-pages, the line sits above its first sub-page:
      // that is where the page lands.
      const kids = siblingsOf(node.id);
      if (target.zone === "after" && isExpanded(node.id) && kids.length > 0) {
        movePage(id, node.id, kids[0].position - 1);
        return;
      }
      const siblings = siblingsOf(node.parentId);
      const at = siblings.findIndex((n) => n.id === node.id);
      if (target.zone === "before") {
        const prev = siblings[at - 1];
        movePage(id, node.parentId, prev ? (prev.position + node.position) / 2 : node.position - 1);
      } else {
        const next = siblings[at + 1];
        movePage(id, node.parentId, next ? (node.position + next.position) / 2 : node.position + 1);
      }
    },
    end: () => {
      clearExpand();
      setDragId(null);
      setDrop(null);
    },
  };

  return <DragContext.Provider value={value}>{children}</DragContext.Provider>;
}

// ------------------------------------------------------------------------ sidebar

export default function NotesSidebar() {
  const { childrenOf, addPage } = useNotes();
  const { openSwitcher, modKey } = useShell();
  const { toggleSidebar, isMobile, state } = useSidebar();
  const pathname = usePathname();
  const { href, demo } = useBackend();
  const roots = childrenOf(null);
  // Folded away on desktop: keep its links out of the tab order.
  const folded = !isMobile && state === "collapsed";

  return (
    <DragProvider>
      <Sidebar inert={folded ? true : undefined}>
        <SidebarHeader className="h-12 flex-row items-center gap-1 py-0 pl-4 pr-2">
          <Link href={href("/")} className="mr-auto flex items-center gap-2 text-sm font-semibold tracking-tight">
            {demo ? "note-scion" : "Notes"}
            {demo && (
              <span className="rounded border border-sidebar-border px-1.5 text-xs font-medium leading-5 text-sidebar-foreground/70">
                Demo
              </span>
            )}
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label="Hide sidebar"
            title={modKey ? `Hide sidebar (${modKey}+\\)` : "Hide sidebar"}
            className={cn(ROW_ICON, "h-7 w-7 [&_svg]:size-4")}
          >
            <PanelLeftClose />
          </Button>
          <AddButton label="New page" onAdd={() => addPage(null)} className="h-7 w-7 [&_svg]:size-4" />
        </SidebarHeader>

        <SidebarGroup className="py-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={openSwitcher} className={COARSE_ROW}>
                <Search />
                <span className="flex-1">Search</span>
                {modKey && (
                  <kbd className="pointer-events-none rounded border bg-background px-1.5 font-mono text-[0.625rem] font-medium leading-4 text-muted-foreground [@media(hover:none)]:hidden">
                    {modKey} K
                  </kbd>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <PageList roots={roots} onAdd={() => void addPage(null)} />

        <SidebarFooter className="border-t border-sidebar-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === href("/trash")} className={COARSE_ROW}>
                <Link href={href("/trash")} aria-current={pathname === href("/trash") ? "page" : undefined}>
                  <Trash2 />
                  <span>Trash</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {demo ? (
              <DemoMenu />
            ) : (
              <>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/apps"} className={COARSE_ROW}>
                    <Link href="/apps" aria-current={pathname === "/apps" ? "page" : undefined}>
                      <Plug />
                      <span>Connected apps</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <form method="post" action="/session/end">
                    <SidebarMenuButton type="submit" className={COARSE_ROW}>
                      <LogOut />
                      <span>Log out</span>
                    </SidebarMenuButton>
                  </form>
                </SidebarMenuItem>
              </>
            )}
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
    </DragProvider>
  );
}

/** In place of Connected apps and Log out: where the demo's pages live, and starting over. */
function DemoMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const { activeId } = useNotes();
  const { reset, href } = useBackend();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // After Cancel or a reset, focus goes back to "Reset demo".
  const resetRef = useReturnFocus<HTMLButtonElement>(confirming);

  const startOver = async () => {
    setBusy(true);
    try {
      await reset?.();
      // Already on the demo's home (the empty state): it opens the first sample itself.
      // Pushing the same URL there would cancel that and leave the pane blank.
      if (pathname !== href("/") || activeId) router.push(href("/"));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <>
      <SidebarMenuItem>
        {confirming ? (
          // The question gets its own line: beside two buttons it wrapped in the 256px rail.
          <div className="px-2 py-1 text-sm">
            <p className="mb-1.5 text-sidebar-foreground/70">Erase your changes?</p>
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} className={cn("h-7 px-2", COARSE_ROW)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                autoFocus
                disabled={busy}
                onClick={() => void startOver()}
                className={cn("h-7 px-2", COARSE_ROW)}
              >
                Reset
              </Button>
            </div>
          </div>
        ) : (
          <SidebarMenuButton ref={resetRef} onClick={() => setConfirming(true)} className={COARSE_ROW}>
            <RotateCcw />
            <span>Reset demo</span>
          </SidebarMenuButton>
        )}
      </SidebarMenuItem>
      <p className="px-2 pb-1 pt-2 text-xs leading-relaxed text-sidebar-foreground/60">
        A demo: pages are saved in this browser only, never sent anywhere.
      </p>
    </>
  );
}

// ------------------------------------------------------------ keyboard in the tree

/**
 * The page tree is one stop in the tab order. Only one row's link (and that row's own
 * buttons) can take Tab; the arrow keys move between rows, as in a file tree.
 */
const TreeNavContext = createContext<{ tabId: string | null; onFocusRow: (id: string) => void }>({
  tabId: null,
  onFocusRow: () => {},
});

/**
 * Down/Up: next and previous visible page. Right: open a closed page, or step into an
 * open one. Left: close an open page, or step out to its parent. Home/End: first, last.
 */
function moveInTree(event: React.KeyboardEvent<HTMLElement>, toggle: (id: string) => void) {
  const row = event.target as HTMLElement;
  const id = row.dataset.treeId;
  if (!id || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  // Rows still folding away (inert) are already gone as far as the keys go.
  const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-tree-id]")).filter(
    (other) => !other.closest(".sidebar-sub-pages[inert]")
  );
  const at = rows.indexOf(row);
  const level = Number(row.dataset.level);
  const expanded = row.getAttribute("aria-expanded");
  const go = (to: HTMLElement | undefined) => {
    event.preventDefault();
    to?.focus();
  };

  switch (event.key) {
    case "ArrowDown":
      return go(rows[at + 1]);
    case "ArrowUp":
      return go(rows[at - 1]);
    case "Home":
      return go(rows[0]);
    case "End":
      return go(rows[rows.length - 1]);
    case "ArrowRight":
      if (expanded === "false") {
        event.preventDefault();
        toggle(id);
      } else if (expanded === "true") go(rows[at + 1]);
      return;
    case "ArrowLeft":
      if (expanded === "true") {
        event.preventDefault();
        toggle(id);
        return;
      }
      return go(rows.slice(0, at).findLast((other) => Number(other.dataset.level) < level));
  }
}

function PageList({ roots, onAdd }: { roots: NoteNode[]; onAdd: () => void }) {
  const { dragId, drop, overRoot, finish } = useDrag();
  const { childrenOf, isExpanded, toggleExpanded, activeId } = useNotes();
  const [focusId, setFocusId] = useState<string | null>(null);
  const rootTarget = drop?.zone === "root";

  // The row that takes Tab: the last one focused, else the open page, else the first,
  // as long as it's showing (not inside a closed page).
  const shown = new Set<string>();
  const walk = (parentId: string | null) => {
    for (const node of childrenOf(parentId)) {
      shown.add(node.id);
      if (isExpanded(node.id)) walk(node.id);
    }
  };
  walk(null);
  const tabId =
    (focusId && shown.has(focusId) && focusId) || (activeId && shown.has(activeId) && activeId) || roots[0]?.id || null;

  return (
    <SidebarContent className="gap-0 px-2 pb-4">
      <nav aria-label="Pages" onKeyDown={(event) => moveInTree(event, toggleExpanded)}>
        {roots.length > 0 && (
          <TreeNavContext.Provider value={{ tabId, onFocusRow: setFocusId }}>
            <SidebarMenu className="gap-0">
              {roots.map((node) => (
                <TreeItem key={node.id} node={node} depth={0} />
              ))}
            </SidebarMenu>
          </TreeNavContext.Provider>
        )}
      </nav>
      {/* With no pages yet, the empty state's own button is the one to press. */}
      {roots.length > 0 && (
        <SidebarMenu className="mt-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onAdd} className={cn("text-sidebar-foreground/70", COARSE_ROW)}>
              <Plus />
              <span>New page</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      )}
      {/* The empty space under the tree takes a page back to the top level. */}
      <div
        className={cn(
          "mt-1 min-h-10 flex-1 rounded-md transition-colors",
          dragId && "px-2 pt-2",
          rootTarget && "bg-sidebar-accent"
        )}
        onDragOver={(event) => {
          if (overRoot()) event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          finish();
        }}
      >
        {dragId && <span className="text-xs text-muted-foreground">Drop here for the top level</span>}
      </div>
    </SidebarContent>
  );
}

function AddButton({
  label,
  onAdd,
  className,
  tabIndex,
}: {
  label: string;
  onAdd: () => Promise<void>;
  className?: string;
  tabIndex?: number;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      tabIndex={tabIndex}
      disabled={busy}
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        setBusy(true);
        try {
          await onAdd();
        } finally {
          setBusy(false);
        }
      }}
      className={cn(ROW_ICON, "disabled:cursor-progress", className)}
    >
      <Plus />
    </Button>
  );
}

/** The page's icon, or a spinner while its link is still loading. Renders inside the <Link>. */
function TreeIcon({ icon }: { icon: string | null }) {
  const { pending } = useLinkStatus();
  return (
    <span className="flex w-4 shrink-0 justify-center leading-none" aria-hidden>
      {pending ? (
        <Loader2 size={14} className="animate-spin text-sidebar-foreground/60 motion-reduce:animate-none" />
      ) : (
        (icon ?? <FileText size={16} className="text-sidebar-foreground/60" />)
      )}
    </span>
  );
}

// Fetch a page's data while the pointer rests on its row, so the click lands on data
// that is already here; plain viewport prefetch only gets loading.tsx. The app-router
// Link that next/link resolves to reads this prop, but the published types describe the
// pages-router Link and leave it out, hence the spread.
const PREFETCH_ON_HOVER = { unstable_dynamicOnHover: true } as Record<string, unknown>;

// With a mouse, the row's buttons lie over the end of the title only while the row is
// hovered or one of them has focus, so at rest the title has the whole row. They sit on
// the hover fill. Touch screens get one "⋯" button instead (RowMenu).
// A named group: the shadcn <Sidebar> is itself a plain `group`.
const ACTIONS =
  "pointer-events-none absolute inset-y-0 right-1 flex items-center gap-0.5 rounded-r-md bg-sidebar-accent pl-1 opacity-0 transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 group-hover/row:pointer-events-auto group-hover/row:opacity-100 [@media(hover:none)]:hidden";

const MENU_ITEM =
  "flex h-10 w-full items-center gap-2 rounded-sm px-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground";

/**
 * A page's actions on a touch screen: one finger-sized "⋯" in place of a trash and a +
 * side by side, which took a third of the row and sat a slip apart.
 */
function RowMenu({
  title,
  tabIndex,
  onAdd,
  onTrash,
}: {
  title: string;
  tabIndex: number;
  onAdd: () => Promise<unknown>;
  onTrash: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${title}`}
          tabIndex={tabIndex}
          className={cn(ROW_ICON, "hidden [@media(hover:none)]:inline-flex")}
        >
          <Ellipsis />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <button
          type="button"
          className={MENU_ITEM}
          onClick={() => {
            setOpen(false);
            void onAdd();
          }}
        >
          <Plus /> Add a page inside
        </button>
        <button
          type="button"
          className={MENU_ITEM}
          onClick={() => {
            setOpen(false);
            onTrash();
          }}
        >
          <Trash2 /> Move to trash
        </button>
      </PopoverContent>
    </Popover>
  );
}

/** Matches the `.sidebar-sub-pages` transitions in globals.css, with a frame to spare. */
const SUB_PAGES_OPEN_MS = 260;
const SUB_PAGES_CLOSE_MS = 200;

/**
 * A page's sub-pages, which grow out of the row when it opens and fold back into it when
 * it closes, so it's clear where they went. They stay mounted until the fold finishes.
 * Pages already open when the tree first shows don't animate.
 */
function SubPages({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [shown, setShown] = useState(open);
  const [moving, setMoving] = useState(false);
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    setMoving(true);
    if (open) setShown(true);
  }

  useEffect(() => {
    if (!moving) return;
    const timer = setTimeout(
      () => {
        setMoving(false);
        if (!open) setShown(false);
      },
      open ? SUB_PAGES_OPEN_MS : SUB_PAGES_CLOSE_MS
    );
    return () => clearTimeout(timer);
  }, [moving, open]);

  if (!shown) return null;
  return (
    <div
      className="sidebar-sub-pages"
      data-state={open ? "open" : "closed"}
      data-moving={moving || undefined}
      // On their way out, the rows are out of reach of Tab and the arrow keys.
      inert={open ? undefined : true}
    >
      <div>{children}</div>
    </div>
  );
}

function TreeItem({ node, depth }: { node: NoteNode; depth: number }) {
  const { childrenOf, activeId, isExpanded, toggleExpanded, addPage, removePage } = useNotes();
  const { href } = useBackend();
  const { dragId, drop, start, over, finish, end } = useDrag();
  const kids = childrenOf(node.id);
  const hasKids = kids.length > 0;
  const open = hasKids && isExpanded(node.id);
  const active = node.id === activeId;
  const title = useTitle(node.title);
  const zone = drop && drop.id === node.id ? drop.zone : null;
  const dragging = dragId === node.id;
  const { tabId, onFocusRow } = useContext(TreeNavContext);
  // Out of the tab order unless this is the tree's one stop.
  const tab = node.id === tabId ? 0 : -1;

  return (
    <SidebarMenuItem aria-level={depth + 1}>
      <div
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", title);
          start(node.id);
        }}
        onDragOver={(event) => {
          if (over(node, event)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          finish();
        }}
        onDragEnd={end}
        data-active={active}
        className={cn(
          "group/row relative flex items-center gap-0.5 rounded-md pr-1 text-sm text-sidebar-foreground transition-colors duration-120 ease-out hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&:has(:focus-visible)]:bg-sidebar-accent",
          "data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground",
          dragging && "opacity-40",
          zone === "inside" && "bg-sidebar-accent ring-1 ring-inset ring-sidebar-ring"
        )}
        style={{ paddingLeft: `${depth * INDENT + 2}px` }}
      >
        {(zone === "before" || zone === "after") && (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute right-1 h-0.5 rounded-full bg-sidebar-ring",
              zone === "before" ? "-top-px" : "-bottom-px"
            )}
            style={{ left: `${depth * INDENT + (zone === "after" && open ? INDENT : 0) + 4}px` }}
          />
        )}
        {hasKids ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
            aria-expanded={open}
            // From the keyboard, Right and Left open and close the page.
            tabIndex={-1}
            onClick={() => toggleExpanded(node.id)}
            className={ROW_ICON}
          >
            <ChevronRight className={cn("transition-transform duration-200 ease-out-expo", open && "rotate-90")} />
          </Button>
        ) : (
          <span className="w-6 shrink-0 [@media(pointer:coarse)]:w-10" aria-hidden />
        )}
        <Link
          href={href(`/${node.id}`)}
          {...PREFETCH_ON_HOVER}
          draggable={false}
          aria-current={active ? "page" : undefined}
          // Read as "Weekend trip, link, collapsed", so sub-pages aren't a surprise.
          aria-expanded={hasKids ? open : undefined}
          tabIndex={tab}
          data-tree-id={node.id}
          data-level={depth + 1}
          onFocus={() => onFocusRow(node.id)}
          className={cn(
            "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md outline-none ring-sidebar-ring focus-visible:ring-2",
            COARSE_ROW
          )}
        >
          <TreeIcon icon={node.icon} />
          <span className="truncate">{title}</span>
        </Link>
        <div className={ACTIONS}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Move ${title} to trash`}
            title="Move to trash"
            tabIndex={tab}
            onClick={() => removePage(node.id)}
            className={ROW_ICON}
          >
            <Trash2 />
          </Button>
          <AddButton label={`Add a page inside ${title}`} onAdd={() => addPage(node.id)} tabIndex={tab} />
        </div>
        <RowMenu title={title} tabIndex={tab} onAdd={() => addPage(node.id)} onTrash={() => removePage(node.id)} />
      </div>

      {hasKids && (
        <SubPages open={open}>
          <SidebarMenu className="gap-0">
            {kids.map((child) => (
              <TreeItem key={child.id} node={child} depth={depth + 1} />
            ))}
          </SidebarMenu>
        </SubPages>
      )}
    </SidebarMenuItem>
  );
}
