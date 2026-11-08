"use client";

import { createContext, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { UpdateResult } from "@/lib/db";
import type { NoteNode, NotePage, NotePatch, SearchHit } from "@/lib/types";
import {
  createPageAction,
  deleteForeverAction,
  emptyTrashAction,
  getPageAction,
  movePageAction,
  restorePageAction,
  searchPagesAction,
  trashPageAction,
  updatePageAction,
  type MoveResult,
} from "../actions";

/**
 * Where the workspace reads and writes pages. The real app talks to the server through
 * server actions; the demo at /demo keeps everything in the browser. The views only see
 * this, so both run the same editor, sidebar and switcher.
 */
export interface NotesBackend {
  /** True for the in-browser demo. */
  demo: boolean;
  /** An app path ("/", "/trash", "/<id>") as a URL under this workspace. */
  href: (path: string) => string;
  /** Re-reads pages that may have changed elsewhere. */
  refresh: () => void;
  createPage: (parentId: string | null, title?: string) => Promise<NoteNode>;
  /** The stored copy, never a cached one: used to resolve save conflicts. */
  getPage: (id: string) => Promise<NotePage | null>;
  updatePage: (id: string, patch: NotePatch, baseUpdatedAt: string | null) => Promise<UpdateResult>;
  trashPage: (id: string) => Promise<void>;
  restorePage: (id: string) => Promise<NoteNode | null>;
  deleteForever: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  movePage: (id: string, parentId: string | null, position: number) => Promise<MoveResult>;
  /** Pages whose title or text contains the query, with a snippet of a text match. */
  searchPages: (query: string) => Promise<SearchHit[]>;
  /** Demo only: puts the sample workspace back. */
  reset?: () => Promise<void>;
}

const BackendContext = createContext<NotesBackend | null>(null);

export function useBackend(): NotesBackend {
  const value = useContext(BackendContext);
  if (!value) throw new Error("useBackend must be used inside a backend provider");
  return value;
}

export function BackendProvider({ backend, children }: { backend: NotesBackend; children: React.ReactNode }) {
  return <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>;
}

/** The real workspace: pages live in Postgres, reached through server actions. */
export function ServerBackendProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const backend = useMemo<NotesBackend>(
    () => ({
      demo: false,
      href: (path) => path,
      refresh: () => router.refresh(),
      createPage: createPageAction,
      getPage: getPageAction,
      updatePage: updatePageAction,
      trashPage: trashPageAction,
      restorePage: restorePageAction,
      deleteForever: deleteForeverAction,
      emptyTrash: emptyTrashAction,
      movePage: movePageAction,
      searchPages: searchPagesAction,
    }),
    [router]
  );
  return <BackendProvider backend={backend}>{children}</BackendProvider>;
}
