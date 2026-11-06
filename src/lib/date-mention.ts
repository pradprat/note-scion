import { Node } from "@tiptap/core";
import { fullDate, parseISODate } from "./dates";

/** `@2026-11-12` as a word of its own: not part of an email address or a longer token. */
const MENTION = /^@(\d{4}-\d{2}-\d{2})(?![\w-])/;
const ANY_MENTION = /(?:^|[^\w@.-])@\d{4}-\d{2}-\d{2}(?![\w-])/;

/**
 * An "@" date in running text. Only the day is stored; the editor shows it as Today,
 * Yesterday or Tomorrow while that is true, and as the date otherwise.
 *
 * In Markdown it is `@YYYY-MM-DD`, which reads plainly for Claude and turns back into a
 * date when written.
 */
export const DateMention = Node.create({
  name: "dateMention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      date: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-date"),
        renderHTML: (attributes) => ({ "data-date": attributes.date }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-date]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["span", HTMLAttributes, `@${fullDate(node.attrs.date)}`];
  },

  // Copied as plain text, a date has to stay right tomorrow: no "Today".
  renderText: ({ node }) => fullDate(node.attrs.date),

  markdownTokenName: "dateMention",

  markdownTokenizer: {
    name: "dateMention",
    level: "inline",
    start: (src) => {
      const match = ANY_MENTION.exec(src);
      if (!match) return -1;
      return match.index + match[0].indexOf("@");
    },
    tokenize(src, tokens) {
      // marked's text rule stops just before "x@…" (it looks for email addresses), so the
      // character before has to be checked here too.
      const before = tokens?.at(-1)?.raw?.slice(-1);
      if (before && /[\w@.-]/.test(before)) return undefined;
      const match = MENTION.exec(src);
      if (!match || !parseISODate(match[1])) return undefined;
      return { type: "dateMention", raw: match[0], date: match[1] };
    },
  },

  parseMarkdown: (token, helpers) => helpers.createNode("dateMention", { date: token.date as string }),

  renderMarkdown: (node) => `@${node.attrs?.date}`,
});
