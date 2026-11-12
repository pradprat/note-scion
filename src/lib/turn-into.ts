import type { ChainedCommands, Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { ToggleLevel } from "./toggle";

/** What a block can be turned into from its grip. */
export type BlockKind =
  | "text"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "toggle0"
  | "toggle1"
  | "toggle2"
  | "toggle3"
  | "blockquote"
  | "codeBlock";

const toggleLevel = (kind: BlockKind): ToggleLevel | null =>
  kind.startsWith("toggle") ? (Number(kind.slice(6)) as ToggleLevel) : null;

/**
 * What the block at `pos` is, as one of the kinds it can be turned into, or null for a
 * block without a line of text to keep (a table, a database, a sub-page, a divider).
 */
export function blockKind(doc: PMNode, pos: number): BlockKind | null {
  const node = doc.nodeAt(pos);
  if (!node) return null;
  switch (node.type.name) {
    case "paragraph":
      return "text";
    case "heading":
      return `heading${node.attrs.level as 1 | 2 | 3}`;
    case "codeBlock":
      return "codeBlock";
    case "blockquote":
      return "blockquote";
    case "toggle":
      return `toggle${node.attrs.level as ToggleLevel}`;
    case "taskItem":
      return "taskList";
    case "listItem": {
      const list = doc.resolve(pos).parent.type.name;
      return list === "orderedList" ? "orderedList" : list === "bulletList" ? "bulletList" : null;
    }
    default:
      return null;
  }
}

/** The start and end of the block's first and last lines of text. */
function lines(node: PMNode, pos: number): { first: number; last: number } | null {
  if (node.isTextblock) return { first: pos + 1 + node.content.size, last: pos + 1 + node.content.size };
  let first = -1;
  let last = -1;
  node.descendants((child, offset) => {
    if (!child.isTextblock) return true;
    const start = pos + 1 + offset + 1;
    if (first < 0) first = start + child.content.size;
    last = start + child.content.size;
    return false;
  });
  return first < 0 ? null : { first, last };
}

/**
 * Makes the selected lines paragraphs first, where the new kind needs one: a list item
 * starts with a paragraph, and a toggle's summary can't come from code. Unlike
 * `setParagraph`, it succeeds when they already are.
 */
const asParagraph = (chain: ChainedCommands, unless: string[]) =>
  chain.command(({ state, tr }) => {
    const { $from, $to } = state.selection;
    if (!unless.includes($from.parent.type.name)) tr.setBlockType($from.pos, $to.pos, state.schema.nodes.paragraph);
    return true;
  });

/** Steps that turn the line(s) holding the selection into `kind`. */
function apply(chain: ChainedCommands, kind: BlockKind): ChainedCommands {
  const level = toggleLevel(kind);
  if (level !== null) return asParagraph(chain, ["paragraph", "heading"]).wrapInToggle(level);
  switch (kind) {
    case "text":
      return chain.setParagraph();
    case "heading1":
    case "heading2":
    case "heading3":
      return chain.setNode("heading", { level: Number(kind.slice(7)) });
    // Wrapped rather than toggled: a nested item lifted out of its list is still inside
    // the outer list, where toggling would change (or unwrap) that list instead.
    case "bulletList":
    case "orderedList":
    case "taskList":
      return asParagraph(chain, ["paragraph"]).wrapInList(kind);
    case "blockquote":
      return chain.wrapIn("blockquote");
    case "codeBlock":
      return chain.setNode("codeBlock");
    default:
      return chain;
  }
}

/**
 * Turns the block at `pos` into another kind, keeping its text, in one undoable step.
 * A list item leaves its list (only it changes, as in Notion), a quote lets go of its
 * lines, and a toggle's summary becomes a line again with its inside following it; then
 * the line becomes the new kind. Returns whether anything changed.
 */
export function turnInto(editor: Editor, pos: number, kind: BlockKind): boolean {
  const { doc } = editor.state;
  const node = doc.nodeAt(pos);
  const from = blockKind(doc, pos);
  const at = node && lines(node, pos);
  if (!node || !from || !at || from === kind) return false;

  // A toggle that stays a toggle only changes how its summary looks.
  const level = toggleLevel(kind);
  const steps = (chain: ChainedCommands) => {
    if (node.type.name === "toggle" && level !== null) {
      return chain.command(({ tr }) => {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, level });
        tr.setSelection(TextSelection.create(tr.doc, at.first));
        return true;
      });
    }
    // A quote's lines all take the new kind (a list gets one item per line).
    const select = node.type.name === "blockquote" ? { from: at.first, to: at.last } : at.first;
    let next = chain.setTextSelection(select);
    // What the line is once let out: a toggle heading's summary is a heading, any other a paragraph.
    let unwrapped: BlockKind = from;
    if (node.type.name === "toggle") {
      next = next.unwrapToggle();
      unwrapped = node.attrs.level ? (`heading${node.attrs.level as 1 | 2 | 3}` as const) : "text";
    } else if (node.type.name === "listItem" || node.type.name === "taskItem") {
      next = next.liftListItem(node.type.name);
      unwrapped = "text";
    } else if (node.type.name === "blockquote") {
      next = next.lift("blockquote");
      unwrapped = "text";
    }
    // Setting a line to what it already is counts as failing, so it's skipped.
    return (unwrapped === kind ? next : apply(next, kind)).command(({ tr }) => {
      // The cursor rests at the end of the (first) line it turned into.
      tr.setSelection(TextSelection.create(tr.doc, tr.selection.$from.end()));
      return true;
    });
  };

  // All the steps go into one transaction, sent only if every one of them worked, so a
  // step that can't be done doesn't leave the block half changed.
  const done = editor.commands.command(({ tr, chain }) => {
    const ok = steps(chain()).run();
    if (!ok) tr.setMeta("preventDispatch", true);
    return ok;
  });
  if (done) editor.commands.focus();
  return done;
}
