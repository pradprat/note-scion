import { Extension } from "@tiptap/core";
import { Fragment, type Node as PMNode, type ResolvedPos } from "@tiptap/pm/model";
import { NodeSelection, Selection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

export type MoveDirection = "up" | "down";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    blockMove: {
      /** Swaps the block holding the cursor with the one above or below it. */
      moveBlock: (direction: MoveDirection) => ReturnType;
    };
  }
}

/**
 * The depth of the block the cursor's block moves as, the same block a grip would move: a
 * quote or a table moves whole, a toggle's summary moves the toggle, and a line in a list
 * moves its item (the innermost one, so nested items move within their own list).
 */
export function movableDepth($pos: ResolvedPos): number | null {
  let depth = $pos.depth;
  for (let d = 1; d <= $pos.depth; d++) {
    const name = $pos.node(d).type.name;
    if (name === "table" || name === "blockquote") {
      depth = d;
      break;
    }
  }
  while (depth > 0) {
    const name = $pos.node(depth).type.name;
    const parent = $pos.node(depth - 1).type.name;
    if (name === "toggleSummary" || parent === "listItem" || parent === "taskItem") depth -= 1;
    else break;
  }
  return depth > 0 ? depth : null;
}

/** The block that moves: where it starts, and the node itself. */
function blockAt(state: EditorState): { pos: number; node: PMNode } | null {
  const { selection } = state;
  if (selection instanceof NodeSelection) return { pos: selection.from, node: selection.node };
  const { $from } = selection;
  const depth = movableDepth($from);
  if (depth === null) return null;
  return { pos: $from.before(depth), node: $from.node(depth) };
}

/**
 * Moves the block one place up or down among its siblings, and keeps the selection where
 * it was inside it. Returns null where it can't go: at either end of its list or page, or
 * above a toggle's summary.
 */
export function moveBlockTr(state: EditorState, direction: MoveDirection): Transaction | null {
  const block = blockAt(state);
  if (!block) return null;
  const { pos, node } = block;
  const $at = state.doc.resolve(pos);
  const parent = $at.parent;
  const index = $at.index();
  const otherIndex = direction === "up" ? index - 1 : index + 1;
  if (otherIndex < 0 || otherIndex >= parent.childCount) return null;
  const other = parent.child(otherIndex);

  const first = Math.min(index, otherIndex);
  const swapped = direction === "up" ? Fragment.from([node, other]) : Fragment.from([other, node]);
  if (!parent.canReplace(first, first + 2, swapped)) return null;

  const from = direction === "up" ? pos - other.nodeSize : pos;
  const to = from + node.nodeSize + other.nodeSize;
  const start = direction === "up" ? from : from + other.nodeSize;
  const tr = state.tr.replaceWith(from, to, swapped);

  const { selection } = state;
  const shift = (at: number) => start + Math.min(Math.max(at - pos, 0), node.nodeSize);
  if (selection instanceof NodeSelection) {
    tr.setSelection(NodeSelection.create(tr.doc, start));
  } else if (selection instanceof TextSelection) {
    tr.setSelection(TextSelection.create(tr.doc, shift(selection.anchor), shift(selection.head)));
  } else {
    // Cells picked in a table: the cursor goes to the nearest text where the head was.
    tr.setSelection(Selection.near(tr.doc.resolve(shift(selection.head))));
  }
  return tr.scrollIntoView();
}

/**
 * Alt+Shift+Up and Down move the block holding the cursor, the same keys that move a page
 * in the sidebar. With a mouse the grip does this by dragging; this is the way from the
 * keyboard, and with "/move" the way on a touch screen.
 */
export const BlockMove = Extension.create({
  name: "blockMove",

  addCommands() {
    return {
      moveBlock:
        (direction) =>
        ({ state, dispatch }) => {
          const tr = moveBlockTr(state, direction);
          if (!tr) return false;
          dispatch?.(tr);
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    // Consumed even where the block can't go further, so the keys never fall through to
    // the browser's own Alt+Shift+arrow (select to the paragraph's edge on a Mac).
    const move = (direction: MoveDirection) => () => {
      this.editor.commands.moveBlock(direction);
      return true;
    };
    return {
      "Alt-Shift-ArrowUp": move("up"),
      "Alt-Shift-ArrowDown": move("down"),
    };
  },
});
