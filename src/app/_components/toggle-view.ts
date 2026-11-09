import { Extension } from "@tiptap/core";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, Selection, TextSelection, type EditorState } from "@tiptap/pm/state";
import type { ResolvedPos } from "@tiptap/pm/model";
import { Toggle } from "@/lib/toggle";

const SVG = "http://www.w3.org/2000/svg";

/** A small right-pointing chevron; CSS turns it down while the toggle is open. */
function chevron(): SVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", "m9 18 6-6-6-6");
  svg.append(path);
  return svg;
}

/**
 * The toggle as the editor shows it: an arrow beside the blocks. Opening or closing it
 * changes the node's `open` attribute, so the state is saved with the page, but stays out
 * of undo: Ctrl+Z should take back typing, not fold the toggle you just read.
 */
export const ToggleBlock = Toggle.extend({
  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node;
      const dom = document.createElement("div");
      dom.className = "notes-toggle";

      const arrow = document.createElement("button");
      arrow.type = "button";
      arrow.className = "notes-toggle-arrow";
      arrow.contentEditable = "false";
      arrow.append(chevron());

      const contentDOM = document.createElement("div");
      contentDOM.className = "notes-toggle-content";
      dom.append(arrow, contentDOM);

      const sync = () => {
        const open = Boolean(current.attrs.open);
        dom.dataset.open = String(open);
        dom.dataset.level = String(current.attrs.level);
        arrow.setAttribute("aria-expanded", String(open));
        arrow.setAttribute("aria-label", open ? "Close toggle" : "Open toggle");
        arrow.title = open ? "Close toggle" : "Open toggle";
      };
      sync();

      // The click would otherwise move the cursor (and focus) away from the text.
      arrow.addEventListener("mousedown", (event) => event.preventDefault());
      arrow.addEventListener("click", () => {
        const pos = getPos();
        if (pos === undefined) return;
        editor.view.dispatch(setOpen(editor.state, pos, !current.attrs.open));
      });

      return {
        dom,
        contentDOM,
        update(next) {
          if (next.type !== current.type) return false;
          current = next;
          sync();
          return true;
        },
        // Only the arrow's own events are ours; everything in the content is ProseMirror's.
        stopEvent: (event) => event.target instanceof Node && arrow.contains(event.target),
        ignoreMutation: (mutation) => !contentDOM.contains(mutation.target),
      };
    };
  },
});

function setOpen(state: EditorState, pos: number, open: boolean) {
  const node = state.doc.nodeAt(pos);
  return state.tr.setNodeMarkup(pos, undefined, { ...node?.attrs, open }).setMeta("addToHistory", false);
}

/** The toggle holding `$pos`, innermost first. */
function enclosingToggle($pos: ResolvedPos): { depth: number; node: PMNode; pos: number } | null {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === "toggle") return { depth, node, pos: $pos.before(depth) };
  }
  return null;
}

/**
 * Where the cursor goes when `pos` is inside a closed toggle's hidden blocks: the end of
 * its summary, the last thing on screen. Null when `pos` is in plain sight.
 */
function hiddenAt(doc: PMNode, pos: number): number | null {
  const $pos = doc.resolve(pos);
  for (let depth = 1; depth <= $pos.depth; depth++) {
    const node = $pos.node(depth);
    if (node.type.name === "toggle" && !node.attrs.open && $pos.index(depth) > 0) {
      return $pos.start(depth) + (node.firstChild?.nodeSize ?? 0) - 1;
    }
  }
  return null;
}

/** The closed toggle whose summary holds the (empty) selection, if any. */
function inClosedSummary(state: EditorState) {
  const { selection } = state;
  if (!selection.empty || selection.$from.parent.type.name !== "toggleSummary") return null;
  const found = enclosingToggle(selection.$from);
  return found && !found.node.attrs.open ? found : null;
}

/**
 * Keys and cursor rules that go with toggles. Kept apart from the node: raising a node's
 * priority would also move it ahead of paragraph in the schema.
 */
export const ToggleBehavior = Extension.create({
  name: "toggleBehavior",
  priority: 1000,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        // A cursor can't rest in a block the toggle hides: arrow keys, a click on the arrow
        // while the cursor was inside, or an undo could all leave it there, typing unseen.
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((tr) => tr.selectionSet || tr.docChanged)) return null;
          const { selection } = state;
          if (!(selection instanceof TextSelection)) return null;
          const head = hiddenAt(state.doc, selection.head);
          if (head === null) return null;
          const anchor = hiddenAt(state.doc, selection.anchor) === null ? selection.anchor : head;
          return state.tr.setSelection(TextSelection.create(state.doc, anchor, head));
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    const { editor } = this;

    // Down or Right from the end of a closed toggle's summary goes to what follows it,
    // not into the blocks it hides.
    const pastClosed = (key: "down" | "right") => () => {
      const { state, view } = editor;
      const found = inClosedSummary(state);
      if (!found) return false;
      const { $from } = state.selection;
      const atEnd = key === "down" ? view.endOfTextblock("down") : $from.parentOffset === $from.parent.content.size;
      if (!atEnd) return false;
      const next = Selection.findFrom(state.doc.resolve(found.pos + found.node.nodeSize), 1);
      if (next) view.dispatch(state.tr.setSelection(next).scrollIntoView());
      return true;
    };

    // Enter in a summary: at the end it starts the body (or the next block, when closed);
    // in the middle it moves the rest of the text down into the body.
    const enter = () => {
      const { state, view } = editor;
      if (state.selection.$from.parent.type.name !== "toggleSummary") return false;
      const tr = state.tr;
      if (!state.selection.empty) tr.deleteSelection();
      const $pos = tr.doc.resolve(tr.selection.from);
      const summary = $pos.parent;
      const found = enclosingToggle($pos);
      if (summary.type.name !== "toggleSummary" || !found) return false;
      const { paragraph } = state.schema.nodes;
      const atStart = $pos.parentOffset === 0;
      const atEnd = $pos.parentOffset === summary.content.size;

      if (atStart && !atEnd) {
        // Text after the cursor: an empty line goes in above, as it does anywhere else.
        tr.insert(found.pos, paragraph.create());
      } else if (atEnd && !found.node.attrs.open) {
        const after = found.pos + found.node.nodeSize;
        tr.insert(after, paragraph.create());
        tr.setSelection(TextSelection.create(tr.doc, after + 1));
      } else {
        const rest = summary.content.cut($pos.parentOffset);
        const bodyStart = $pos.after();
        // A new toggle already holds one empty line: the text goes in that, not above it.
        const spare = found.node.childCount === 2 ? found.node.child(1) : null;
        const line = paragraph.create(null, rest);
        if (spare?.type === paragraph && !spare.content.size) tr.replaceWith(bodyStart, bodyStart + spare.nodeSize, line);
        else tr.insert(bodyStart, line);
        if (rest.size) tr.delete($pos.pos, bodyStart - 1);
        tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, open: true });
        tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(bodyStart, -1) + 1));
      }
      view.dispatch(tr.scrollIntoView());
      return true;
    };

    // Backspace at the very start of a summary undoes the toggle: its text becomes a
    // paragraph (or heading) again and the blocks inside come out after it.
    const unwrap = () => {
      const { state, view } = editor;
      const { selection } = state;
      const { $from } = selection;
      if (!selection.empty || $from.parent.type.name !== "toggleSummary" || $from.parentOffset !== 0) return false;
      const found = enclosingToggle($from);
      if (!found) return false;
      const { node, pos } = found;
      const { paragraph, heading } = state.schema.nodes;
      const level = node.attrs.level as number;
      const head = level ? heading.create({ level }, node.firstChild?.content) : paragraph.create(null, node.firstChild?.content);
      const body: PMNode[] = [];
      node.forEach((child, _offset, index) => {
        if (index > 0) body.push(child);
      });
      // A body that is only the empty line a new toggle starts with was never content.
      if (body.length === 1 && body[0].type === paragraph && body[0].content.size === 0) body.length = 0;
      const parent = state.doc.resolve(pos).parent;
      const index = state.doc.resolve(pos).index();
      const replacement = Fragment.from([head, ...body]);
      if (!parent.canReplace(index, index + 1, replacement)) return false;
      const tr = state.tr.replaceWith(pos, pos + node.nodeSize, replacement);
      tr.setSelection(TextSelection.create(tr.doc, pos + 1));
      view.dispatch(tr.scrollIntoView());
      return true;
    };

    // Backspace at the start of a line right under a closed toggle must not pull the line
    // into the blocks the toggle hides: an empty line goes, text selects the toggle.
    const underClosed = () => {
      const { state, view } = editor;
      const { selection } = state;
      const { $from } = selection;
      if (!selection.empty || $from.parentOffset !== 0 || !$from.parent.isTextblock || $from.depth < 1) return false;
      const index = $from.index($from.depth - 1);
      if (index === 0) return false;
      const previous = $from.node($from.depth - 1).child(index - 1);
      if (previous.type.name !== "toggle" || previous.attrs.open) return false;
      const togglePos = $from.before($from.depth) - previous.nodeSize;
      const tr = state.tr;
      if ($from.parent.content.size === 0) {
        tr.delete($from.before(), $from.after());
        tr.setSelection(TextSelection.create(tr.doc, togglePos + 1 + (previous.firstChild?.nodeSize ?? 1) - 1));
      } else {
        tr.setSelection(NodeSelection.create(state.doc, togglePos));
      }
      view.dispatch(tr.scrollIntoView());
      return true;
    };

    // Ctrl or Cmd Enter opens and closes the toggle holding the cursor, from its summary or
    // from a block inside it.
    const flip = () => {
      const { state, view } = editor;
      if (state.selection.$from.parent.type.spec.code) return false;
      const found = enclosingToggle(state.selection.$from);
      if (!found) return false;
      view.dispatch(setOpen(state, found.pos, !found.node.attrs.open));
      return true;
    };

    return {
      Enter: enter,
      "Shift-Enter": enter,
      Backspace: () => unwrap() || underClosed(),
      "Mod-Enter": flip,
      ArrowDown: pastClosed("down"),
      ArrowRight: pastClosed("right"),
    };
  },
});
