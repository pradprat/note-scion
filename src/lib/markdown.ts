import { MarkdownManager } from "@tiptap/markdown";
import type { JSONContent } from "@tiptap/core";
import { noteExtensions } from "./schema";

let manager: MarkdownManager | null = null;

function md(): MarkdownManager {
  manager ??= new MarkdownManager({ extensions: noteExtensions });
  return manager;
}

/** Gives each sub-page block the title of its page, so the Markdown link reads well. */
function labelPageLinks(node: JSONContent, titleOf: (id: string) => string | undefined): JSONContent {
  if (node.type === "pageLink") {
    const id = node.attrs?.id as string | undefined;
    return { ...node, attrs: { ...node.attrs, label: (id && titleOf(id)) || null } };
  }
  if (!node.content) return node;
  return { ...node, content: node.content.map((child) => labelPageLinks(child, titleOf)) };
}

export function toMarkdown(
  content: JSONContent | null,
  titleOf?: (id: string) => string | undefined
): string {
  if (!content?.content?.length) return "";
  return md()
    .serialize(titleOf ? labelPageLinks(content, titleOf) : content)
    .trim();
}

const unescapeLinkText = (text: string) => text.replace(/\\(.)/g, "$1");

/**
 * Sub-page blocks belong at the top of a page. A page line inside a list or quote
 * (`- [Title](/<id>)`) stays an ordinary link in that item, filling the item's empty
 * first line rather than leaving a blank bullet above a block.
 */
function settlePageLinks(nodes: JSONContent[], top: boolean): JSONContent[] {
  const out: JSONContent[] = [];
  for (const node of nodes) {
    if (node.type === "pageLink") {
      const { id, label } = (node.attrs ?? {}) as { id?: string; label?: string | null };
      if (top) {
        out.push({ type: "pageLink", attrs: { id } });
        continue;
      }
      const text = unescapeLinkText(label ?? "").trim() || "Untitled";
      const link: JSONContent = {
        type: "paragraph",
        content: [{ type: "text", text, marks: [{ type: "link", attrs: { href: `/${id}` } }] }],
      };
      const prev = out[out.length - 1];
      if (prev?.type === "paragraph" && !prev.content?.length) out[out.length - 1] = link;
      else out.push(link);
      continue;
    }
    // A toggle's body holds blocks as the page does, so a sub-page block stays one there.
    out.push(
      node.content ? { ...node, content: settlePageLinks(node.content, top && node.type === "toggle") } : node
    );
  }
  return out;
}

export function fromMarkdown(markdown: string): JSONContent {
  const doc = md().parse(markdown);
  const content = settlePageLinks(doc.content ?? [], true);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/** Joins two documents, dropping a trailing empty paragraph from the first. */
export function appendContent(base: JSONContent | null, extra: JSONContent): JSONContent {
  const head = [...(base?.content ?? [])];
  const last = head[head.length - 1];
  if (last?.type === "paragraph" && !last.content?.length) head.pop();
  return { type: "doc", content: [...head, ...(extra.content ?? [])] };
}
