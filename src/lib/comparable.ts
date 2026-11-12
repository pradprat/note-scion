import { getSchema, type JSONContent } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import { noteExtensions } from "./schema";

let schema: Schema | null = null;

/** Writes an object's keys in sorted order, so the same content always reads the same. */
const sortKeys = (_key: string, value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : value;

/**
 * The content as the editor holds it. A page parsed from Markdown leaves out attributes
 * the editor fills in with their defaults (a link's `rel` and `target`, say) and writes a
 * text node's keys in another order; read through the schema, both come out alike.
 */
function asEditorHolds(content: JSONContent): unknown {
  try {
    schema ??= getSchema(noteExtensions);
    return schema.nodeFromJSON(content).toJSON();
  } catch {
    // Not valid for this schema (written by another version): compare it as it is.
    return content;
  }
}

/**
 * A page body as it compares for saving, so the editor tidying a page doesn't pass for an
 * edit (and save it, which could even read as a conflict with an edit from Claude):
 *
 * - as the editor holds it, with its default attributes and its key order, so a page
 *   written in Markdown (by Claude, or the demo's sample pages) isn't "edited" by the
 *   first click in it;
 * - without the empty line the editor keeps at the end. A page stored ending in a list or
 *   a heading gets that line added by the editor at its first transaction.
 */
export function comparable(content: JSONContent | null | undefined): string {
  const held = content ? (asEditorHolds({ type: "doc", ...content }) as JSONContent) : null;
  const blocks = [...(held?.content ?? [])];
  while (blocks.length) {
    const last = blocks[blocks.length - 1];
    if (last.type !== "paragraph" || last.content?.length) break;
    blocks.pop();
  }
  return JSON.stringify(blocks, sortKeys);
}
