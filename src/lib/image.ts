import { Node, mergeAttributes } from "@tiptap/core";
import { IMAGE_PATH, imageIdOf } from "./images";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * A line that is only an image kept by the app, `![description](/api/images/<id>)`,
 * optionally with the site's origin in front. Other image links stay ordinary text, so
 * nothing is ever fetched from another site.
 */
const LINE = `^ {0,3}!\\[((?:\\\\.|[^\\]\\\\\\n])*)\\]\\((?:https?://[^\\s/)]+)?(${IMAGE_PATH}${UUID})\\)[ \\t]*`;
const IMAGE_LINE = new RegExp(`${LINE}(?:\\n|$)`, "i");
const ANY_IMAGE_LINE = new RegExp(`${LINE}$`, "im");

const altText = (alt: string) => alt.replace(/[\\[\]]/g, "\\$&").replace(/\s+/g, " ").trim();
const unescapeAlt = (text: string) => text.replace(/\\(.)/g, "$1");

/** Where an image may come from: the app's own storage, or (in the in-browser demo) the page itself. */
const okSrc = (src: unknown) => imageIdOf(src) !== null || (typeof src === "string" && /^data:image\/(png|jpeg|webp|gif);base64,/.test(src));

/**
 * An image on its own line, between blocks. Only where it is stored is kept (`src`), a
 * short description and the size it was saved at, so the page reserves its room before
 * the picture arrives.
 */
export const NoteImage = Node.create({
  name: "noteImage",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
      width: { default: null },
      height: { default: null },
    };
  },

  // Pasted HTML only becomes an image if it already points at the app's own storage, so
  // a copied web page never makes the editor load pictures from elsewhere.
  parseHTML() {
    return [
      {
        tag: "img[src]",
        getAttrs: (element) => {
          const src = (element as HTMLElement).getAttribute("src");
          if (!okSrc(src)) return false;
          const num = (name: string) => Number((element as HTMLElement).getAttribute(name)) || null;
          return { src, alt: (element as HTMLElement).getAttribute("alt") ?? "", width: num("width"), height: num("height") };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes, { loading: "lazy", decoding: "async", draggable: "false" })];
  },

  markdownTokenName: "noteImage",

  markdownTokenizer: {
    name: "noteImage",
    level: "block",
    // Without its own `start`, @tiptap/markdown probes with a throwaway lexer (see page-link.ts).
    start: (src) => ANY_IMAGE_LINE.exec(src)?.index ?? -1,
    tokenize(src) {
      const match = IMAGE_LINE.exec(src);
      if (!match) return undefined;
      return { type: "noteImage", raw: match[0], text: match[1], src: match[2].toLowerCase() };
    },
  },

  parseMarkdown: (token, helpers) =>
    helpers.createNode("noteImage", { src: token.src as string, alt: unescapeAlt((token.text as string) ?? "") }),

  renderMarkdown: (node) => `![${altText(String(node.attrs?.alt ?? ""))}](${node.attrs?.src})`,
});
