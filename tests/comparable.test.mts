/**
 * How a page body compares for saving (src/lib/comparable.ts):
 *
 *   bun test
 */
import { describe, expect, test } from "bun:test";
import { Editor } from "@tiptap/core";
import { comparable } from "@/lib/comparable";
import { fromMarkdown } from "@/lib/markdown";
import { noteExtensions } from "@/lib/schema";
import { samplePages } from "@/app/demo/_lib/seed";

describe("comparable", () => {
  test("the same content with its keys in another order compares equal", () => {
    const stored = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "#", marks: [{ type: "code" }] }] }] };
    const edited = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", marks: [{ type: "code" }], text: "#" }] }] };
    expect(comparable(edited)).toBe(comparable(stored));
  });

  test("a page from Markdown compares equal to the editor's copy of it", () => {
    const stored = fromMarkdown("A line with `code`, **bold** and a [link](https://example.com).\n\n- [ ] A to-do\n\n## A heading");
    const editor = new Editor({ element: null, extensions: noteExtensions, content: stored });
    expect(comparable(editor.getJSON())).toBe(comparable(stored));
    editor.destroy();
  });

  test("no demo page reads as edited just by opening it", () => {
    for (const page of samplePages().pages) {
      const editor = new Editor({ element: null, extensions: noteExtensions, content: page.content });
      expect(`${page.title}: ${comparable(editor.getJSON())}`).toBe(`${page.title}: ${comparable(page.content)}`);
      editor.destroy();
    }
  });

  test("the editor's empty last line isn't an edit, but text is", () => {
    const stored = { type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Hi" }] }] };
    expect(comparable({ ...stored, content: [...stored.content, { type: "paragraph" }] })).toBe(comparable(stored));
    const typed = { ...stored, content: [...stored.content, { type: "paragraph", content: [{ type: "text", text: "x" }] }] };
    expect(comparable(typed)).not.toBe(comparable(stored));
  });

  test("a changed mark or attribute is an edit", () => {
    const a = { type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Hi" }] }] };
    const b = { type: "doc", content: [{ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Hi" }] }] };
    expect(comparable(a)).not.toBe(comparable(b));
  });
});
