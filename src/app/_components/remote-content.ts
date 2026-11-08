import type { Editor, JSONContent } from "@tiptap/react";
import { Selection, TextSelection, type Transaction } from "@tiptap/pm/state";

const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

/**
 * Puts a newer copy of the document in the editor (an edit from Claude over MCP, or from
 * another tab) by replacing only the part that differs. The owner's cursor, selection and
 * undo history stay where they were. A whole-document swap (`setContent`) would send the
 * cursor to the end of the new text, so the next keystrokes would land in the other
 * author's words.
 */
export function applyRemoteContent(editor: Editor, content: JSONContent | null): void {
  const { state } = editor;
  let next;
  try {
    next = editor.schema.nodeFromJSON(content ?? EMPTY_DOC);
    next.check();
  } catch {
    editor.commands.setContent(content ?? "", { emitUpdate: false });
    return;
  }

  const start = state.doc.content.findDiffStart(next.content);
  if (start == null) return;
  let { a: endA, b: endB } = state.doc.content.findDiffEnd(next.content)!;
  // Repeated content around the change can make the two ends overlap the start.
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) {
    endA += overlap;
    endB += overlap;
  }

  const before = state.selection;
  let tr: Transaction = state.tr.replace(start, endA, next.slice(start, endB));
  if (!tr.doc.eq(next)) {
    // The narrow replace didn't rebuild the same tree: take the whole copy, and keep the
    // cursor as near its old place as the new text allows.
    tr = state.tr.replaceWith(0, state.doc.content.size, next.content);
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(before.head, tr.doc.content.size))));
  } else if (before.to <= start) {
    // Text before the change is untouched, so a selection there stays exactly as it was.
    // (Mapping would carry a cursor sitting right at an insertion to after the new text.)
    tr.setSelection(Selection.fromJSON(tr.doc, before.toJSON()));
  }

  // Not the owner's edit: keep it out of their undo history and out of the autosave.
  tr.setMeta("addToHistory", false).setMeta("preventUpdate", true);
  editor.view.dispatch(tr);
}
