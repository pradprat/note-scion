import type { JSONContent } from "@tiptap/core";

/** A page as the sidebar needs it: everything except the body. */
export interface NoteNode {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  position: number;
}

export interface NotePage extends NoteNode {
  content: JSONContent | null;
  updatedAt: string;
}

export interface NotePatch {
  title?: string;
  icon?: string | null;
  content?: JSONContent;
}

/** One delete in the trash: the page that was deleted, with what it took along. */
export interface TrashItem {
  id: string;
  title: string;
  icon: string | null;
  deletedAt: string;
  /** Title of the page it was inside, if that page still exists. */
  parentTitle: string | null;
  subPageCount: number;
}
