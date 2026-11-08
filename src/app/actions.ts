"use server";

import { requireSession } from "@/lib/auth";
import {
  createPage,
  deleteForever,
  emptyTrash,
  isPageId,
  loadPage,
  MoveError,
  movePage,
  restorePage,
  searchPages,
  trashPage,
  updatePage,
  type UpdateResult,
} from "@/lib/db";
import { disconnectClient } from "@/lib/oauth";
import type { NoteNode, NotePage, NotePatch, SearchHit } from "@/lib/types";

// Login and logout are route handlers in ../session, not actions: Next 15.1 runs a
// form action submitted without JavaScript outside the request scope, so cookies()
// throws there.

const MAX_TITLE = 500;
const MAX_ICON = 16;
const MAX_CONTENT_BYTES = 2_000_000;
const MAX_QUERY = 200;

export async function createPageAction(
  parentId: string | null,
  title?: string
): Promise<NoteNode> {
  await requireSession();
  if (parentId !== null && !isPageId(parentId)) throw new Error("Invalid parent");
  const node = await createPage(parentId);
  const clean = typeof title === "string" ? title.replace(/\n/g, " ").trim().slice(0, MAX_TITLE) : "";
  if (!clean) return node;
  await updatePage(node.id, { title: clean }, "owner");
  return { ...node, title: clean };
}

/** The stored copy, for resolving a save conflict, so it never comes from the cache. */
export async function getPageAction(id: string): Promise<NotePage | null> {
  await requireSession();
  return loadPage(id);
}

/**
 * Saves a patch made on top of version `baseUpdatedAt`. Pass null to overwrite whatever
 * is stored (the "keep my version" choice after a conflict).
 */
export async function updatePageAction(
  id: string,
  patch: NotePatch,
  baseUpdatedAt: string | null
): Promise<UpdateResult> {
  await requireSession();
  if (!isPageId(id)) throw new Error("Invalid page");
  if (baseUpdatedAt !== null && (typeof baseUpdatedAt !== "string" || Number.isNaN(Date.parse(baseUpdatedAt)))) {
    throw new Error("Invalid version");
  }

  const clean: NotePatch = {};
  if (patch.title !== undefined) {
    if (typeof patch.title !== "string") throw new Error("Invalid title");
    clean.title = patch.title.slice(0, MAX_TITLE);
  }
  if (patch.icon !== undefined) {
    if (patch.icon !== null && (typeof patch.icon !== "string" || patch.icon.length > MAX_ICON)) {
      throw new Error("Invalid icon");
    }
    clean.icon = patch.icon;
  }
  if (patch.content !== undefined) {
    if (
      typeof patch.content !== "object" ||
      patch.content === null ||
      Object.getPrototypeOf(patch.content) !== Object.prototype ||
      patch.content.type !== "doc"
    ) {
      throw new Error("Invalid content");
    }
    if (JSON.stringify(patch.content).length > MAX_CONTENT_BYTES) {
      throw new Error("Page is too large to save");
    }
    clean.content = patch.content;
  }
  return updatePage(id, clean, "owner", baseUpdatedAt);
}

/** Sends a page and its sub-pages to the trash. */
export async function trashPageAction(id: string): Promise<void> {
  await requireSession();
  if (!isPageId(id)) throw new Error("Invalid page");
  await trashPage(id);
}

export async function restorePageAction(id: string): Promise<NoteNode | null> {
  await requireSession();
  if (!isPageId(id)) throw new Error("Invalid page");
  return restorePage(id);
}

export async function deleteForeverAction(id: string): Promise<void> {
  await requireSession();
  if (!isPageId(id)) throw new Error("Invalid page");
  await deleteForever(id);
}

export async function emptyTrashAction(): Promise<void> {
  await requireSession();
  await emptyTrash();
}

export type MoveResult = { ok: true } | { ok: false; message: string };

/** Drag and drop in the sidebar: a new parent (null = top level) and an exact slot. */
export async function movePageAction(
  id: string,
  parentId: string | null,
  position: number
): Promise<MoveResult> {
  await requireSession();
  if (!isPageId(id)) throw new Error("Invalid page");
  if (parentId !== null && !isPageId(parentId)) throw new Error("Invalid parent");
  if (typeof position !== "number" || !Number.isFinite(position)) throw new Error("Invalid position");
  try {
    await movePage(id, parentId, position);
    return { ok: true };
  } catch (error) {
    if (error instanceof MoveError) return { ok: false, message: error.message };
    throw error;
  }
}

/** Full-text matches for the quick switcher; titles are matched in the browser. */
export async function searchPagesAction(query: string): Promise<SearchHit[]> {
  await requireSession();
  if (typeof query !== "string") return [];
  const q = query.trim().slice(0, MAX_QUERY);
  if (q.length < 2) return [];
  return searchPages(q, 12);
}

/** Revokes every token a connected app holds (Connected apps page). */
export async function disconnectAppAction(clientId: string): Promise<void> {
  await requireSession();
  if (typeof clientId !== "string" || !clientId || clientId.length > 200) throw new Error("Invalid app");
  await disconnectClient(clientId);
}
