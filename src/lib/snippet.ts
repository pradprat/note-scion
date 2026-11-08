import type { Snippet } from "./types";

/**
 * A line of text around the first place `query` appears, split so the match can be
 * marked: a little context before it, more after, cut at word edges. Null when the
 * text doesn't contain the query.
 */
export function snippetAround(text: string, query: string, before = 24, after = 64): Snippet | null {
  const flat = text.replace(/\s+/g, " ").trim();
  const q = query.trim();
  const at = q ? flat.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return null;
  const start = Math.max(0, at - before);
  const end = Math.min(flat.length, at + q.length + after);
  let head = flat.slice(start, at);
  if (start > 0) head = `…${head.replace(/^\S*\s/, "")}`;
  let tail = flat.slice(at + q.length, end);
  if (end < flat.length) tail = `${tail.replace(/\s\S*$/, "")}…`;
  return { before: head, match: flat.slice(at, at + q.length), after: tail };
}
