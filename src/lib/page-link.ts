import { Node, mergeAttributes } from "@tiptap/core";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * A line that is only a link to a page, `[Title](/<id>)`, optionally with the site's
 * origin in front. Anything else on the line keeps it an ordinary text link. The older
 * `/notes/<id>` form (from when the app lived under /notes) is still read.
 */
const LINE = `^ {0,3}\\[((?:\\\\.|[^\\]\\\\\\n])*)\\]\\((?:https?://[^\\s/)]+)?(?:/notes)?/(${UUID})\\)[ \\t]*`;
const PAGE_LINE = new RegExp(`${LINE}(?:\\n|$)`, "i");
const ANY_PAGE_LINE = new RegExp(`${LINE}$`, "im");

/** Turns the label of a page block into Markdown link text that can't break out. */
function linkText(label: string): string {
  return label.replace(/[\\[\]]/g, "\\$&").replace(/\s+/g, " ").trim() || "Untitled";
}

/**
 * A block that stands for a sub-page: in the app it shows that page's current icon and
 * title and opens it. Only the id is stored; titles change on the page itself.
 *
 * `label` is never stored. The server fills it in just before writing Markdown, so the
 * link Claude reads carries the page's title.
 */
export const PageLink = Node.create({
  name: "pageLink",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-page-link"),
        renderHTML: (attributes) => ({ "data-page-link": attributes.id }),
      },
      label: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-page-link]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes),
      ["a", { href: `/${node.attrs.id}` }, node.attrs.label || "Untitled"],
    ];
  },

  markdownTokenName: "pageLink",

  markdownTokenizer: {
    name: "pageLink",
    level: "block",
    // Without its own `start`, @tiptap/markdown probes with a throwaway lexer, which takes
    // over marked's shared tokenizer and leaves every paragraph's inline content empty.
    start: (src) => ANY_PAGE_LINE.exec(src)?.index ?? -1,
    tokenize(src) {
      const match = PAGE_LINE.exec(src);
      if (!match) return undefined;
      return { type: "pageLink", raw: match[0], text: match[1], id: match[2].toLowerCase() };
    },
  },

  // The link text rides along so a page line nested in a list can turn back into a link
  // (see settlePageLinks); top-level blocks drop it.
  parseMarkdown: (token, helpers) =>
    helpers.createNode("pageLink", { id: token.id as string, label: token.text ?? null }),

  renderMarkdown: (node) => `[${linkText(node.attrs?.label ?? "")}](/${node.attrs?.id})`,
});
