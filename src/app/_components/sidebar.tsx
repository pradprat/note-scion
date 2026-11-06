"use client";

import { createContext, useContext, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  FileText,
  Loader2,
  LogOut,
  PanelLeftClose,
  Plug,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import { useNotes } from "./notes-provider";
import { useShell } from "./notes-shell";

/** Touch screens get finger-sized rows and buttons; a mouse keeps the dense tree. */
const COARSE_ROW = "[@media(pointer:coarse)]:h-10";
const COARSE_ICON = "[@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9";
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
  const roots = childrenOf(null);
  // Folded away on desktop: keep its links out of the tab order.
  const folded = !isMobile && state === "collapsed";

  return (
    <DragProvider>
      <Sidebar inert={folded ? true : undefined}>
        <SidebarHeader className="h-12 flex-row items-center gap-1 py-0 pl-4 pr-2">
          <Link href="/" className="mr-auto text-sm font-semibold tracking-tight">
            Notes
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
              <SidebarMenuButton asChild isActive={pathname === "/trash"} className={COARSE_ROW}>
                <Link href="/trash" aria-current={pathname === "/trash" ? "page" : undefined}>
                  <Trash2 />
                  <span>Trash</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
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
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
    </DragProvider>
  );
}

function PageList({ roots, onAdd }: { roots: NoteNode[]; onAdd: () => void }) {
  const { dragId, drop, overRoot, finish } = useDrag();
  const rootTarget = drop?.zone === "root";

  return (
    <SidebarContent className="gap-0 px-2 pb-4">
      <nav aria-label="Pages">
        {roots.length > 0 && (
          <SidebarMenu className="gap-0">
            {roots.map((node) => (
              <TreeItem key={node.id} node={node} depth={0} />
            ))}
          </SidebarMenu>
        )}
      </nav>
      <SidebarMenu className="mt-0.5">
        <SidebarMenuItem>
          <SidebarMenuButton onClick={onAdd} className={cn("text-sidebar-foreground/70", COARSE_ROW)}>
            <Plus />
            <span>New page</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
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
}: {
  label: string;
  onAdd: () => Promise<void>;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
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

// Row actions show on hover and keyboard focus; where there is no hover (touch), always.
// A named group: the shadcn <Sidebar> is itself a plain `group`.
const ACTIONS =
  "flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:gap-1";

function TreeItem({ node, depth }: { node: NoteNode; depth: number }) {
  const { childrenOf, activeId, isExpanded, toggleExpanded, addPage, removePage } = useNotes();
  const { dragId, drop, start, over, finish, end } = useDrag();
  const kids = childrenOf(node.id);
  const hasKids = kids.length > 0;
  const open = hasKids && isExpanded(node.id);
  const active = node.id === activeId;
  const title = node.title.trim() || "Untitled";
  const zone = drop && drop.id === node.id ? drop.zone : null;
  const dragging = dragId === node.id;

  return (
    <SidebarMenuItem>
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
          "group/row relative flex items-center gap-0.5 rounded-md pr-1 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
            onClick={() => toggleExpanded(node.id)}
            className={ROW_ICON}
          >
            <ChevronRight className={cn("transition-transform duration-150", open && "rotate-90")} />
          </Button>
        ) : (
          <span className="w-6 shrink-0 [@media(pointer:coarse)]:w-9" aria-hidden />
        )}
        <Link
          href={`/${node.id}`}
          {...PREFETCH_ON_HOVER}
          draggable={false}
          aria-current={active ? "page" : undefined}
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
            onClick={() => removePage(node.id)}
            className={ROW_ICON}
          >
            <Trash2 />
          </Button>
          <AddButton label={`Add a page inside ${title}`} onAdd={() => addPage(node.id)} />
        </div>
      </div>

      {open && (
        <SidebarMenu className="gap-0">
          {kids.map((child) => (
            <TreeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </SidebarMenu>
      )}
    </SidebarMenuItem>
  );
}
