import type { JSONContent } from "@tiptap/core";
import type { UpdateResult } from "@/lib/db";
import type { NoteNode, NotePage, NotePatch, TrashItem } from "@/lib/types";
import type { MoveResult } from "../../actions";
import type { NotesBackend } from "../../_components/backend";

/**
 * The demo's database: every page lives in this browser's localStorage, nothing leaves
 * it. Mirrors what src/lib/db.ts does in Postgres (versions, trash, moves, search) so the
 * shared views behave the same. Another tab on the demo sees changes through the storage
 * event, just as the real app sees Claude's edits.
 */

const KEY = "note-scion:demo:v1";
export const DEMO_BASE = "/demo";

/**
 * Demo URLs. A page is `/demo?page=<id>` rather than `/demo/<id>`: every demo route is then
 * a static file, so visitors never cost a server render.
 */
export function demoHref(path: string): string {
  if (path === "/") return DEMO_BASE;
  const id = /^\/([0-9a-f-]{36})$/i.exec(path)?.[1];
  return id ? `${DEMO_BASE}?page=${id}` : `${DEMO_BASE}${path}`;
}
const TRASH_DAYS = 30;
const SEARCH_LIMIT = 12;

interface StoredPage extends NotePage {
  deletedAt: string | null;
}

interface State {
  pages: StoredPage[];
}

let state: State | null = null;
let ready: Promise<void> | null = null;
let lastStamp = 0;
let cachedTree: { key: string; tree: NoteNode[] } | null = null;
const listeners = new Set<() => void>();

/** A strictly increasing time, so two saves in one millisecond still differ as versions. */
function stamp(): string {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return new Date(lastStamp).toISOString();
}

function notify() {
  listeners.forEach((listener) => listener());
}

function read(): State | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as State;
    return Array.isArray(parsed?.pages) ? parsed : null;
  } catch {
    return null;
  }
}

function commit(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full quota: the demo keeps working until the tab closes.
  }
  notify();
}

function current(): State {
  if (!state) throw new Error("The demo store isn't loaded yet");
  return state;
}

function purge(pages: StoredPage[]): StoredPage[] {
  const cutoff = Date.now() - TRASH_DAYS * 86_400_000;
  const gone = new Set(pages.filter((p) => p.deletedAt && Date.parse(p.deletedAt) < cutoff).map((p) => p.id));
  if (!gone.size) return pages;
  // Sub-pages go with them, as the cascade does in Postgres.
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of pages) {
      if (p.parentId && gone.has(p.parentId) && !gone.has(p.id)) {
        gone.add(p.id);
        grew = true;
      }
    }
  }
  return pages.filter((p) => !gone.has(p.id));
}

/** Loads the saved demo, or writes the sample workspace the first time. */
export function loadDemo(): Promise<void> {
  ready ??= (async () => {
    const saved = read();
    if (saved) {
      state = { pages: purge(saved.pages) };
    } else {
      await reseed();
    }
    window.addEventListener("storage", (event) => {
      if (event.key !== KEY) return;
      const fresh = read();
      if (fresh) {
        state = fresh;
        notify();
      } else {
        // Cleared elsewhere: start over here too.
        void reseed();
      }
    });
  })();
  return ready;
}

/** Throws the demo away and writes the sample workspace again. */
export async function reseed(): Promise<void> {
  const { samplePages } = await import("./seed");
  const now = stamp();
  commit({
    pages: samplePages().map((page) => ({ ...page, updatedAt: now, deletedAt: null })),
  });
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const isLoaded = () => state !== null;

const live = (pages: StoredPage[]) => pages.filter((p) => !p.deletedAt);
const toNode = ({ id, parentId, title, icon, position }: StoredPage): NoteNode => ({
  id,
  parentId,
  title,
  icon,
  position,
});
const toPage = ({ deletedAt: _deleted, ...page }: StoredPage): NotePage => page;

/** The sidebar tree. The same array comes back until a title, icon or place changes. */
export function getTree(): NoteNode[] {
  const nodes = live(current().pages).map(toNode);
  const key = JSON.stringify(nodes);
  if (cachedTree?.key !== key) cachedTree = { key, tree: nodes };
  return cachedTree.tree;
}

/** The stored page; the same object until it is saved again. */
export function peekPage(id: string): NotePage | null {
  const page = current().pages.find((p) => p.id === id && !p.deletedAt);
  return page ? (pageCache.get(page) ?? cachePage(page)) : null;
}

const pageCache = new WeakMap<StoredPage, NotePage>();
function cachePage(page: StoredPage): NotePage {
  const view = toPage(page);
  pageCache.set(page, view);
  return view;
}

export function firstRootId(): string | null {
  const roots = getTree()
    .filter((n) => n.parentId === null)
    .sort((a, b) => a.position - b.position);
  return roots[0]?.id ?? null;
}

function nextPosition(pages: StoredPage[], parentId: string | null, except?: string): number {
  const siblings = live(pages).filter((p) => p.parentId === parentId && p.id !== except);
  return siblings.reduce((max, p) => Math.max(max, p.position), 0) + 1;
}

function descendants(pages: StoredPage[], id: string, sameDelete?: string | null): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of pages) {
      if (p.parentId && ids.has(p.parentId) && !ids.has(p.id)) {
        if (sameDelete !== undefined && p.deletedAt !== sameDelete) continue;
        ids.add(p.id);
        grew = true;
      }
    }
  }
  return ids;
}

function textOf(node: JSONContent | null | undefined): string {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  return (node.content ?? []).map(textOf).join(" ");
}

let cachedTrash: { state: State; items: TrashItem[] } | null = null;

/** The trash, one entry per delete; the same array until the pages change. */
export function getTrash(): TrashItem[] {
  const now = current();
  if (cachedTrash?.state !== now) cachedTrash = { state: now, items: listTrash(now.pages) };
  return cachedTrash.items;
}

function listTrash(pages: StoredPage[]): TrashItem[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  return pages
    .filter((p) => {
      if (!p.deletedAt) return false;
      const parent = p.parentId ? byId.get(p.parentId) : undefined;
      return !parent || parent.deletedAt !== p.deletedAt;
    })
    .sort((a, b) => Date.parse(b.deletedAt!) - Date.parse(a.deletedAt!))
    .map((p) => {
      const parent = p.parentId ? byId.get(p.parentId) : undefined;
      return {
        id: p.id,
        title: p.title,
        icon: p.icon,
        deletedAt: p.deletedAt!,
        parentTitle: parent && !parent.deletedAt ? parent.title : null,
        subPageCount: descendants(pages, p.id, p.deletedAt).size - 1,
      };
    });
}

// --------------------------------------------------------------- the backend

class DemoError extends Error {}

const MAX_TITLE = 500;

export function createDemoBackend(): NotesBackend {
  return {
    demo: true,
    href: demoHref,
    // The views subscribe to the store, so changes (from other tabs too) arrive on their own.
    refresh: () => {},
    reset: reseed,

    async createPage(parentId, title) {
      const { pages } = current();
      if (parentId && !live(pages).some((p) => p.id === parentId)) {
        throw new DemoError("The parent page doesn't exist or is in the trash");
      }
      const page: StoredPage = {
        id: crypto.randomUUID(),
        parentId,
        title: (title ?? "").replace(/\n/g, " ").trim().slice(0, MAX_TITLE),
        icon: null,
        position: nextPosition(pages, parentId),
        content: null,
        updatedAt: stamp(),
        deletedAt: null,
      };
      commit({ pages: [...pages, page] });
      return toNode(page);
    },

    async getPage(id) {
      return peekPage(id);
    },

    async updatePage(id, patch: NotePatch, baseUpdatedAt): Promise<UpdateResult> {
      const { pages } = current();
      const page = pages.find((p) => p.id === id && !p.deletedAt);
      if (!page) return { status: "missing" };
      if (baseUpdatedAt !== null && Date.parse(page.updatedAt) !== Date.parse(baseUpdatedAt)) {
        return { status: "conflict" };
      }
      const next: StoredPage = {
        ...page,
        ...(patch.title !== undefined && { title: patch.title.slice(0, MAX_TITLE) }),
        ...(patch.icon !== undefined && { icon: patch.icon }),
        ...(patch.content !== undefined && { content: patch.content }),
        updatedAt: stamp(),
      };
      commit({ pages: pages.map((p) => (p.id === id ? next : p)) });
      return { status: "saved", updatedAt: next.updatedAt };
    },

    async trashPage(id) {
      const { pages } = current();
      if (!pages.some((p) => p.id === id && !p.deletedAt)) return;
      const doomed = descendants(pages, id, null);
      const at = stamp();
      commit({ pages: pages.map((p) => (doomed.has(p.id) ? { ...p, deletedAt: at } : p)) });
    },

    async restorePage(id) {
      const { pages } = current();
      const target = pages.find((p) => p.id === id && p.deletedAt);
      if (!target) return null;
      const back = descendants(pages, id, target.deletedAt);
      let restored = pages.map((p) => (back.has(p.id) ? { ...p, deletedAt: null } : p));
      // Its old parent is gone or still in the trash: it comes back at the top level.
      const parent = target.parentId ? restored.find((p) => p.id === target.parentId) : undefined;
      if (target.parentId && (!parent || parent.deletedAt)) {
        const position = nextPosition(restored, null, id);
        restored = restored.map((p) => (p.id === id ? { ...p, parentId: null, position } : p));
      }
      commit({ pages: restored });
      const page = restored.find((p) => p.id === id);
      return page ? toNode(page) : null;
    },

    async deleteForever(id) {
      const { pages } = current();
      if (!pages.some((p) => p.id === id && p.deletedAt)) return;
      const gone = descendants(pages, id);
      commit({ pages: pages.filter((p) => !gone.has(p.id)) });
    },

    async emptyTrash() {
      const { pages } = current();
      const trashed = pages.filter((p) => p.deletedAt);
      const gone = new Set<string>();
      for (const p of trashed) descendants(pages, p.id).forEach((d) => gone.add(d));
      commit({ pages: pages.filter((p) => !gone.has(p.id)) });
    },

    async movePage(id, parentId, position): Promise<MoveResult> {
      const { pages } = current();
      if (parentId === id) return { ok: false, message: "A page can't be moved inside itself" };
      if (parentId) {
        if (!live(pages).some((p) => p.id === parentId)) {
          return { ok: false, message: "The target page doesn't exist or is in the trash" };
        }
        if (descendants(pages, id).has(parentId)) {
          return { ok: false, message: "A page can't be moved inside its own sub-page" };
        }
      }
      if (!pages.some((p) => p.id === id && !p.deletedAt)) {
        return { ok: false, message: "That page doesn't exist or is in the trash" };
      }
      // Unlike Postgres, the version stays: a move doesn't touch the page body, and a new
      // version would stop an open copy of the page from saving.
      commit({ pages: pages.map((p) => (p.id === id ? { ...p, parentId, position } : p)) });
      return { ok: true };
    },

    async searchPages(query) {
      const q = query.trim().toLowerCase();
      if (q.length < 2) return [];
      return live(current().pages)
        .filter((p) => p.title.toLowerCase().includes(q) || textOf(p.content).toLowerCase().includes(q))
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, SEARCH_LIMIT)
        .map(toNode);
    },
  };
}
