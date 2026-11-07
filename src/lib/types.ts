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
  /** Set when the last edit to the title, icon or body came over MCP, not from the owner. */
  mcpEdit: McpEdit | null;
}

export interface McpEdit {
  /** The client's registered name ("Claude", "Claude Code"); null for the static token. */
  client: string | null;
  at: string;
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
