/**
 * Moving a block up or down from the keyboard (src/lib/block-move.ts), on a headless editor:
 *
 *   bun test
 */
import { describe, expect, test } from "bun:test";
import { Editor, type JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { noteExtensions } from "@/lib/schema";
import { BlockMove, moveBlockTr } from "@/lib/block-move";

const text = (value: string): JSONContent => ({ type: "text", text: value });
const p = (value: string): JSONContent => ({ type: "paragraph", content: [text(value)] });
const li = (...content: JSONContent[]): JSONContent => ({ type: "listItem", content });
const bullets = (...items: JSONContent[]): JSONContent => ({ type: "bulletList", content: items });
const quote = (...content: JSONContent[]): JSONContent => ({ type: "blockquote", content });
const toggle = (summary: string, ...body: JSONContent[]): JSONContent => ({
  type: "toggle",
  attrs: { level: 0, open: true },
  content: [{ type: "toggleSummary", content: [text(summary)] }, ...body],
});

function setup(...blocks: JSONContent[]) {
  const editor = new Editor({
    element: null,
    extensions: [...noteExtensions, BlockMove],
    content: { type: "doc", content: blocks },
  });
  /** Puts the cursor `offset` characters into the first text that reads `needle`. */
  const cursorIn = (needle: string, offset = 0) => {
    let at = -1;
    editor.state.doc.descendants((node, pos) => {
      if (at < 0 && node.isText && node.text?.includes(needle)) at = pos + node.text.indexOf(needle) + offset;
    });
    if (at < 0) throw new Error(`no "${needle}"`);
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)));
  };
  /** The page's text, block by block, nested lists and toggles flattened in order. */
  const lines = () => {
    const out: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.isTextblock) out.push(node.textContent);
    });
    return out;
  };
  const cursorText = () => editor.state.selection.$from.parent.textContent;
  return { editor, cursorIn, lines, cursorText };
}

describe("moveBlock", () => {
  test("swaps a paragraph with its neighbours and keeps the cursor in it", () => {
    const { editor, cursorIn, lines, cursorText } = setup(p("one"), p("two"), p("three"));
    cursorIn("two", 2);
    expect(editor.commands.moveBlock("up")).toBe(true);
    expect(lines()).toEqual(["two", "one", "three"]);
    expect(cursorText()).toBe("two");
    expect(editor.state.selection.$from.parentOffset).toBe(2);
    expect(editor.commands.moveBlock("down")).toBe(true);
    expect(editor.commands.moveBlock("down")).toBe(true);
    expect(lines()).toEqual(["one", "three", "two"]);
  });

  test("stops at the ends of the page", () => {
    const { editor, cursorIn, lines } = setup(p("one"), p("two"));
    cursorIn("one");
    expect(editor.commands.moveBlock("up")).toBe(false);
    cursorIn("two");
    expect(editor.commands.moveBlock("down")).toBe(false);
    expect(lines()).toEqual(["one", "two"]);
  });

  test("moves a list item within its list, the innermost one when nested", () => {
    const { editor, cursorIn, lines } = setup(
      bullets(li(p("a")), li(p("b"), bullets(li(p("b1")), li(p("b2"))))),
      p("after")
    );
    cursorIn("b2");
    expect(editor.commands.moveBlock("up")).toBe(true);
    expect(lines()).toEqual(["a", "b", "b2", "b1", "after"]);
    // The item takes its nested list along.
    cursorIn("b", 0);
    expect(editor.commands.moveBlock("up")).toBe(true);
    expect(lines()).toEqual(["b", "b2", "b1", "a", "after"]);
    // Past the end of its list it doesn't go.
    cursorIn("a");
    expect(editor.commands.moveBlock("down")).toBe(false);
  });

  test("moves a quote whole, and a toggle from its summary", () => {
    const { editor, cursorIn, lines } = setup(p("top"), quote(p("q1"), p("q2")), toggle("sum", p("inside")));
    cursorIn("q2");
    expect(editor.commands.moveBlock("up")).toBe(true);
    expect(lines()).toEqual(["q1", "q2", "top", "sum", "inside"]);
    cursorIn("sum");
    expect(editor.commands.moveBlock("up")).toBe(true);
    expect(lines()).toEqual(["q1", "q2", "sum", "inside", "top"]);
  });

  test("keeps a block inside a toggle from going above its summary", () => {
    const { editor, cursorIn, lines } = setup(toggle("sum", p("x"), p("y")));
    cursorIn("x");
    expect(moveBlockTr(editor.state, "up")).toBeNull();
    cursorIn("y");
    expect(editor.commands.moveBlock("up")).toBe(true);
    expect(lines()).toEqual(["sum", "y", "x"]);
  });
});
