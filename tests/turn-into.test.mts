/**
 * "Turn into" from a block's grip (src/lib/turn-into.ts), on a headless editor:
 *
 *   bun test
 */
import { describe, expect, test } from "bun:test";
import { Editor, type JSONContent } from "@tiptap/core";
import { noteExtensions } from "@/lib/schema";
import { blockKind, turnInto, type BlockKind } from "@/lib/turn-into";

const text = (value: string): JSONContent => ({ type: "text", text: value });
const p = (value = ""): JSONContent => ({ type: "paragraph", ...(value ? { content: [text(value)] } : {}) });
const h = (level: number, value: string): JSONContent => ({ type: "heading", attrs: { level }, content: [text(value)] });
const li = (...content: JSONContent[]): JSONContent => ({ type: "listItem", content });
const bullets = (...items: string[]): JSONContent => ({ type: "bulletList", content: items.map((i) => li(p(i))) });
const toggle = (level: number, summary: string, ...body: JSONContent[]): JSONContent => ({
  type: "toggle",
  attrs: { level, open: true },
  content: [{ type: "toggleSummary", content: [text(summary)] }, ...body],
});

/** A headless editor holding `blocks`; `turn` converts the top-level block at `index`. */
function setup(...blocks: JSONContent[]) {
  const editor = new Editor({ element: null, extensions: noteExtensions, content: { type: "doc", content: blocks } });
  const posOf = (index: number) => {
    let pos = 0;
    for (let i = 0; i < index; i++) pos += editor.state.doc.child(i).nodeSize;
    return pos;
  };
  return {
    editor,
    posOf,
    turn: (index: number, kind: BlockKind) => turnInto(editor, posOf(index), kind),
    blocks: () => editor.getJSON().content ?? [],
    types: () => (editor.getJSON().content ?? []).map((b) => b.type),
  };
}

/** Drops attrs a test doesn't care about (toggle `open`, list `start`, task `checked`...). */
const shape = (node: JSONContent): unknown =>
  node.type === "text"
    ? node.text
    : {
        type: node.type,
        ...(node.attrs?.level !== undefined && node.type !== "codeBlock" ? { level: node.attrs.level } : {}),
        ...(node.content ? { content: node.content.map(shape) } : {}),
      };

describe("blockKind", () => {
  test("names text blocks and refuses the rest", () => {
    const { editor, posOf } = setup(p("a"), h(2, "b"), bullets("c"), toggle(1, "d", p()), { type: "horizontalRule" });
    const { doc } = editor.state;
    expect(blockKind(doc, posOf(0))).toBe("text");
    expect(blockKind(doc, posOf(1))).toBe("heading2");
    expect(blockKind(doc, posOf(2) + 1)).toBe("bulletList"); // the list item
    expect(blockKind(doc, posOf(2))).toBeNull(); // the whole list
    expect(blockKind(doc, posOf(3))).toBe("toggle1");
    expect(blockKind(doc, posOf(4))).toBeNull();
  });
});

describe("turnInto", () => {
  test("a line becomes each kind, keeping its text", () => {
    const cases: [BlockKind, unknown][] = [
      ["heading1", { type: "heading", level: 1, content: ["hello"] }],
      ["heading3", { type: "heading", level: 3, content: ["hello"] }],
      ["bulletList", { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: ["hello"] }] }] }],
      ["orderedList", { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: ["hello"] }] }] }],
      ["taskList", { type: "taskList", content: [{ type: "taskItem", content: [{ type: "paragraph", content: ["hello"] }] }] }],
      ["blockquote", { type: "blockquote", content: [{ type: "paragraph", content: ["hello"] }] }],
      ["codeBlock", { type: "codeBlock", content: ["hello"] }],
      ["toggle2", { type: "toggle", level: 2, content: [{ type: "toggleSummary", content: ["hello"] }, { type: "paragraph" }] }],
    ];
    for (const [kind, expected] of cases) {
      const t = setup(p("hello"));
      expect(t.turn(0, kind)).toBe(true);
      expect(shape(t.blocks()[0])).toEqual(expected);
    }
  });

  test("a heading goes back to text", () => {
    const t = setup(h(1, "Title"));
    expect(t.turn(0, "text")).toBe(true);
    expect(t.blocks().map(shape)).toEqual([{ type: "paragraph", content: ["Title"] }]);
  });

  test("turning a block into what it already is does nothing", () => {
    const t = setup(h(2, "Same"));
    expect(t.turn(0, "heading2")).toBe(false);
  });

  test("a list item in the middle of a list changes alone", () => {
    const t = setup(bullets("one", "two", "three"));
    const second = t.posOf(0) + 1 + t.editor.state.doc.child(0).child(0).nodeSize;
    expect(turnInto(t.editor, second, "orderedList")).toBe(true);
    expect(t.types()).toEqual(["bulletList", "orderedList", "bulletList"]);
    expect(t.editor.state.doc.child(1).textContent).toBe("two");
  });

  test("a list item becomes a heading", () => {
    const t = setup(bullets("only"));
    expect(turnInto(t.editor, 1, "heading2")).toBe(true);
    expect(t.blocks().map(shape)).toEqual([{ type: "heading", level: 2, content: ["only"] }]);
  });

  test("a toggle becomes text, with what was inside following it", () => {
    const t = setup(toggle(0, "Summary", p("inside")));
    expect(t.turn(0, "text")).toBe(true);
    expect(t.blocks().map(shape)).toEqual([
      { type: "paragraph", content: ["Summary"] },
      { type: "paragraph", content: ["inside"] },
    ]);
  });

  test("an empty toggle leaves no empty line behind", () => {
    const t = setup(toggle(2, "Section", p()));
    expect(t.turn(0, "heading2")).toBe(true);
    expect(t.blocks().map(shape)).toEqual([{ type: "heading", level: 2, content: ["Section"] }]);
  });

  test("a toggle changing level stays the same toggle", () => {
    const t = setup(toggle(0, "Fold", p("kept")));
    expect(t.turn(0, "toggle3")).toBe(true);
    expect(t.blocks().map(shape)).toEqual([
      { type: "toggle", level: 3, content: [{ type: "toggleSummary", content: ["Fold"] }, { type: "paragraph", content: ["kept"] }] },
    ]);
  });

  test("every line of a quote takes the new kind", () => {
    const t = setup({ type: "blockquote", content: [p("first"), p("second")] });
    expect(t.turn(0, "heading2")).toBe(true);
    expect(t.blocks().map(shape)).toEqual([
      { type: "heading", level: 2, content: ["first"] },
      { type: "heading", level: 2, content: ["second"] },
    ]);
  });

  test("code becomes text", () => {
    const t = setup({ type: "codeBlock", content: [text("let a = 1")] });
    expect(t.turn(0, "text")).toBe(true);
    expect(t.blocks().map(shape)).toEqual([{ type: "paragraph", content: ["let a = 1"] }]);
  });

  test("is one change, so one undo step brings the block back", () => {
    for (const block of [p("hello"), bullets("a", "b"), toggle(1, "t", p("in")), { type: "blockquote", content: [p("q")] }]) {
      const t = setup(block);
      let changes = 0;
      t.editor.on("transaction", ({ transaction }) => {
        if (transaction.docChanged) changes++;
      });
      const pos = block.type === "bulletList" ? 1 : 0;
      expect(turnInto(t.editor, pos, block.type === "toggle" ? "taskList" : "toggle1")).toBe(true);
      expect(changes).toBe(1);
    }
  });

  test("blocks without a line of text are left alone", () => {
    const t = setup({ type: "horizontalRule" }, p("after"));
    expect(t.turn(0, "heading1")).toBe(false);
  });
});

test("every kind turns into every other kind", () => {
  const kinds: BlockKind[] = [
    "text", "heading1", "heading2", "heading3", "bulletList", "orderedList", "taskList",
    "toggle0", "toggle1", "toggle2", "toggle3", "blockquote", "codeBlock",
  ];
  // Each block, and where its grip points (inside the list, for a list item).
  const sources: [JSONContent, number][] = [
    [p("x"), 0],
    [h(2, "x"), 0],
    [{ type: "codeBlock", content: [text("x\ny")] }, 0],
    [{ type: "blockquote", content: [p("x"), p("y")] }, 0],
    [bullets("x"), 1],
    [{ type: "orderedList", content: [li(p("x"))] }, 1],
    [{ type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p("x")] }] }, 1],
    [toggle(0, "x", p("in")), 0],
    [toggle(2, "x", p("in")), 0],
  ];
  const failed: string[] = [];
  for (const [block, pos] of sources) {
    for (const kind of kinds) {
      const { editor } = setup(block, p());
      const from = blockKind(editor.state.doc, pos);
      if (kind !== from && !turnInto(editor, pos, kind)) failed.push(`${from} → ${kind}`);
    }
  }
  expect(failed).toEqual([]);
});
