"use client";

import Link from "next/link";
import type { Range } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { FileText, FileX } from "lucide-react";
import { PageLink } from "@/lib/page-link";
import { useNotes } from "./notes-provider";
import { useBackend } from "./backend";
import TitleText from "./title-text";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBlock: {
      /** Replaces the typed "/page" with a new sub-page of this one, then opens it. */
      insertChildPage: (range: Range) => ReturnType;
    };
  }
}

interface PageBlockOptions {
  /** Makes a page inside the open one and returns its id, or null if it failed. */
  createChild: () => Promise<string | null>;
  openPage: (id: string) => void;
}

/** The sub-page block as the editor shows it: the page's live icon and title. */
function PageLinkView({ node }: ReactNodeViewProps) {
  const { tree } = useNotes();
  const { href } = useBackend();
  const id = node.attrs.id as string | null;
  const page = id ? tree.find((other) => other.id === id) : undefined;

  return (
    <NodeViewWrapper className="notes-page-link" data-page-link={id ?? ""}>
      {page ? (
        <Link href={href(`/${page.id}`)} prefetch={false} className="notes-page-link-row" draggable={false}>
          <span aria-hidden className="notes-page-link-icon">
            {page.icon ?? <FileText size={18} strokeWidth={1.75} />}
          </span>
          <span className="notes-page-link-title">
            <TitleText title={page.title} />
          </span>
        </Link>
      ) : (
        // Trashed or deleted. Restoring the page from the trash brings the link back.
        <span className="notes-page-link-row" data-missing="">
          <span aria-hidden className="notes-page-link-icon">
            <FileX size={18} strokeWidth={1.75} />
          </span>
          <span className="notes-page-link-title">Deleted page</span>
        </span>
      )}
    </NodeViewWrapper>
  );
}

export const PageBlock = PageLink.extend<PageBlockOptions, { busy: boolean }>({
  addOptions() {
    return { createChild: async () => null, openPage: () => {} };
  },

  addStorage() {
    return { busy: false };
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageLinkView);
  },

  addCommands() {
    return {
      insertChildPage:
        (range) =>
        ({ editor, tr, dispatch }) => {
          if (this.storage.busy) return false;
          if (!dispatch) return true;
          this.storage.busy = true;
          tr.delete(range.from, range.to);

          void this.options
            .createChild()
            .then((id) => {
              if (!id || editor.isDestroyed) return;
              const { doc } = editor.state;
              const $at = doc.resolve(Math.min(range.from, doc.content.size));
              const block = { type: this.name, attrs: { id } };
              // On a line of its own the block takes the line's place; otherwise it goes
              // in after the text, splitting the line there.
              const at =
                $at.parent.isTextblock && $at.parent.content.size === 0 && $at.depth > 0
                  ? { from: $at.before(), to: $at.after() }
                  : $at.pos;
              editor.chain().insertContentAt(at, block).run();
              this.options.openPage(id);
            })
            .finally(() => {
              this.storage.busy = false;
            });
          return true;
        },
    };
  },
});
