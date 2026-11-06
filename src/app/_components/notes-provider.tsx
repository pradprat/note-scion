"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { NoteNode } from "@/lib/types";
import { useBackend } from "./backend";

const EXPANDED_KEY = "notes:expanded";
/** How long the "Moved to trash · Undo" toast stays up. */
const UNDO_WINDOW = 6000;
/** Least time between two background refreshes when the tab regains focus. */
const REFRESH_GAP = 5000;

export interface PendingDelete {
  id: string;
  title: string;
}

interface NotesContextValue {
  tree: NoteNode[];
  activeId: string | null;
  childrenOf: (parentId: string | null) => NoteNode[];
  ancestorsOf: (id: string) => NoteNode[];
  patchNode: (id: string, patch: Partial<Pick<NoteNode, "title" | "icon">>) => void;
  /** Makes a page and adds it to the tree, without opening it. */
  createPage: (parentId: string | null, title?: string) => Promise<NoteNode>;
  /** Makes a page and opens it. */
  addPage: (parentId: string | null, title?: string) => Promise<void>;
  /** Sends the page and its sub-pages to the trash; undoable from the toast. */
  removePage: (id: string) => void;
  pendingDelete: PendingDelete | null;
  undoDelete: () => void;
  /** Re-parents a page into an exact slot (the sidebar's drag and drop). */
  movePage: (id: string, parentId: string | null, position: number) => void;
  /** Ids of the page and everything under it. */
  subtreeOf: (id: string) => Set<string>;
  isExpanded: (id: string) => boolean;
  toggleExpanded: (id: string) => void;
}

const NotesContext = createContext<NotesContextValue | null>(null);

export function useNotes(): NotesContextValue {
  const value = useContext(NotesContext);
  if (!value) throw new Error("useNotes must be used inside <NotesProvider>");
  return value;
}

function readExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeExpanded(ids: Set<string>) {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Private mode or blocked storage: expansion just won't survive a reload.
  }
}

type Pending = PendingDelete & { removed: NoteNode[] };

export function NotesProvider({
  initialTree,
  children,
}: {
  initialTree: NoteNode[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const backend = useBackend();
  const { href, refresh: reload } = backend;
  const params = useParams<{ id?: string }>();
  const activeId = params?.id ?? null;

  // The client copy is authoritative between server renders; take a fresh server tree
  // whenever the layout re-renders with one.
  const [tree, setTree] = useState(initialTree);
  const [serverTree, setServerTree] = useState(initialTree);
  if (initialTree !== serverTree) {
    setServerTree(initialTree);
    setTree(initialTree);
  }

  // The last page sent to the trash, while its undo toast is up.
  const [pendingDelete, setPendingDelete] = useState<Pending | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  useEffect(() => setExpanded(readExpanded()), []);

  const byId = useMemo(() => new Map(tree.map((node) => [node.id, node])), [tree]);

  const childrenOf = useCallback(
    (parentId: string | null) =>
      tree
        .filter((node) => node.parentId === parentId)
        .sort((a, b) => a.position - b.position),
    [tree]
  );

  const ancestorsOf = useCallback(
    (id: string) => {
      const chain: NoteNode[] = [];
      let current = byId.get(id)?.parentId ?? null;
      while (current && chain.length < 50) {
        const node = byId.get(current);
        if (!node) break;
        chain.unshift(node);
        current = node.parentId;
      }
      return chain;
    },
    [byId]
  );

  const setExpandedPersisted = useCallback((update: (prev: Set<string>) => Set<string>) => {
    setExpanded((prev) => {
      const next = update(prev);
      writeExpanded(next);
      return next;
    });
  }, []);

  // Keep the active page visible in the sidebar.
  useEffect(() => {
    if (!activeId) return;
    const hidden = ancestorsOf(activeId).filter((node) => !expanded.has(node.id));
    if (hidden.length) {
      setExpandedPersisted((prev) => new Set(Array.from(prev).concat(hidden.map((node) => node.id))));
    }
  }, [activeId, ancestorsOf, expanded, setExpandedPersisted]);

  // Pages change from outside too (Claude over MCP, another tab). Coming back to the tab
  // re-reads the tree and the open page; the page view decides what to do with a newer copy.
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < REFRESH_GAP) return;
      last = Date.now();
      reload();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reload]);

  const patchNode = useCallback<NotesContextValue["patchNode"]>((id, patch) => {
    setTree((prev) => prev.map((node) => (node.id === id ? { ...node, ...patch } : node)));
  }, []);

  const createPage = useCallback(
    async (parentId: string | null, title?: string) => {
      const node = await backend.createPage(parentId, title);
      // The new tree may already hold it (the demo store updates the tree as it writes).
      setTree((prev) => (prev.some((other) => other.id === node.id) ? prev : [...prev, node]));
      if (parentId) setExpandedPersisted((prev) => new Set(prev).add(parentId));
      return node;
    },
    [backend, setExpandedPersisted]
  );

  const addPage = useCallback(
    async (parentId: string | null, title?: string) => {
      const node = await createPage(parentId, title);
      router.push(href(`/${node.id}`));
    },
    [router, href, createPage]
  );

  const subtreeOf = useCallback(
    (id: string) => {
      const ids = new Set([id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const node of tree) {
          if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
            ids.add(node.id);
            grew = true;
          }
        }
      }
      return ids;
    },
    [tree]
  );

  const removePage = useCallback(
    (id: string) => {
      const node = byId.get(id);
      if (!node) return;
      const doomed = subtreeOf(id);
      const removed = tree.filter((other) => doomed.has(other.id));

      setTree((prev) => prev.filter((other) => !doomed.has(other.id)));
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setPendingDelete({ id, title: node.title.trim() || "Untitled", removed });
      toastTimer.current = setTimeout(() => setPendingDelete(null), UNDO_WINDOW);

      if (activeId && doomed.has(activeId)) {
        const fallback =
          node.parentId ?? tree.find((other) => other.parentId === null && !doomed.has(other.id))?.id;
        router.push(href(fallback ? `/${fallback}` : "/"));
      }

      backend.trashPage(id).catch(() => {
        // Nothing was trashed: put the pages back and drop the toast.
        setTree((prev) => [...prev, ...removed.filter((r) => !prev.some((p) => p.id === r.id))]);
        setPendingDelete(null);
        reload();
      });
    },
    [activeId, backend, byId, href, reload, router, subtreeOf, tree]
  );

  const undoDelete = useCallback(() => {
    const pending = pendingDelete;
    if (!pending) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setPendingDelete(null);
    setTree((prev) => [...prev, ...pending.removed.filter((r) => !prev.some((p) => p.id === r.id))]);
    backend
      .restorePage(pending.id)
      .then(() => reload())
      .catch(() => reload());
  }, [backend, pendingDelete, reload]);

  const movePage = useCallback(
    (id: string, parentId: string | null, position: number) => {
      setTree((prev) => prev.map((node) => (node.id === id ? { ...node, parentId, position } : node)));
      if (parentId) setExpandedPersisted((prev) => new Set(prev).add(parentId));
      backend
        .movePage(id, parentId, position)
        .then((result) => {
          if (!result.ok) reload();
        })
        .catch(() => reload());
    },
    [backend, reload, setExpandedPersisted]
  );

  const publicPending = useMemo(
    () => (pendingDelete ? { id: pendingDelete.id, title: pendingDelete.title } : null),
    [pendingDelete]
  );

  const value = useMemo<NotesContextValue>(
    () => ({
      tree,
      activeId,
      childrenOf,
      ancestorsOf,
      patchNode,
      createPage,
      addPage,
      removePage,
      pendingDelete: publicPending,
      undoDelete,
      movePage,
      subtreeOf,
      isExpanded: (id) => expanded.has(id),
      toggleExpanded: (id) =>
        setExpandedPersisted((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
    }),
    [
      tree,
      activeId,
      childrenOf,
      ancestorsOf,
      patchNode,
      createPage,
      addPage,
      removePage,
      publicPending,
      undoDelete,
      movePage,
      subtreeOf,
      expanded,
      setExpandedPersisted,
    ]
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}
