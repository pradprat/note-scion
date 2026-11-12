import { InputRule, Node, mergeAttributes, type JSONContent, type MarkdownToken } from "@tiptap/core";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

/** What a toggle's summary line looks like: plain text, or Heading 1 to 3. */
export type ToggleLevel = 0 | 1 | 2 | 3;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    toggle: {
      /** Makes the paragraph or heading holding the cursor into a toggle; its text becomes the summary. */
      wrapInToggle: (level: ToggleLevel) => ReturnType;
      /**
       * Adds a toggle: in place of the empty line holding the cursor, or after the line
       * when it has text.
       */
      insertToggle: (level: ToggleLevel) => ReturnType;
      /**
       * Undoes the toggle around the cursor: its summary becomes a line again (a heading for
       * a toggle heading) and the blocks inside follow it.
       */
      unwrapToggle: () => ReturnType;
    };
  }
}

/**
 * The line that stays visible when a toggle is closed. Its own node, rather than a
 * paragraph or heading, so the heading look is a property of the toggle (`level`) and a
 * stray "# " typed in it can't turn it into something a toggle can't open and close.
 */
export const ToggleSummary = Node.create({
  name: "toggleSummary",
  content: "inline*",
  defining: true,
  selectable: false,

  parseHTML() {
    return [{ tag: "summary" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["summary", HTMLAttributes, 0];
  },
});

const OPEN_TAG = /^ {0,3}<details((?:\s[^>\n]*)?)>[ \t]*/i;
const SUMMARY = /^\s*<summary(?:\s[^>]*)?>([\s\S]*?)<\/summary>[ \t]*/i;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const TAG = /<(\/?)details(?=[\s>])/gi;

/**
 * Where the `<details>` that opens at `from` closes: the index its closing line starts at
 * and the index just past that line. Counts nested `<details>` and skips fenced code, so a
 * code block that shows `</details>` doesn't end the toggle early.
 */
function findClose(src: string, from: number): { bodyEnd: number; end: number } | null {
  let depth = 1;
  let fence: string | null = null;
  let lineStart = from;
  while (lineStart <= src.length) {
    const next = src.indexOf("\n", lineStart);
    const lineEnd = next === -1 ? src.length : next;
    const line = src.slice(lineStart, lineEnd);
    const fenceMark = FENCE.exec(line)?.[1];
    if (fence) {
      if (fenceMark && fenceMark[0] === fence[0] && fenceMark.length >= fence.length && !line.replace(FENCE, "").trim()) {
        fence = null;
      }
    } else if (fenceMark) {
      fence = fenceMark;
    } else {
      const tags = new RegExp(TAG);
      for (let tag = tags.exec(line); tag; tag = tags.exec(line)) {
        if (!tag[1]) {
          depth++;
          continue;
        }
        depth--;
        // A closing tag counts when nothing else follows it on its line.
        const after = line.slice(tag.index + tag[0].length).replace(/^[^>]*>/, "");
        if (depth === 0 && after.trim() === "") {
          return { bodyEnd: lineStart, end: next === -1 ? src.length : next + 1 };
        }
        if (depth === 0) depth = 1;
      }
    }
    if (next === -1) break;
    lineStart = next + 1;
  }
  return null;
}

/** A summary's text as it goes inside `<summary>`: one line, and a leading `#` escaped. */
function summaryText(text: string, level: ToggleLevel): string {
  // The serializer already writes a literal `<` as `&lt;`, so text can't close the tag.
  const oneLine = text.replace(/\s*\n\s*/g, " ").trim();
  if (level) return `${"#".repeat(level)} ${oneLine}`.trim();
  return oneLine.startsWith("#") ? `\\${oneLine}` : oneLine;
}

/** True when a block is only an empty paragraph, the placeholder body of a toggle with nothing in it. */
const isEmptyParagraph = (node: JSONContent | undefined) =>
  node?.type === "paragraph" && !node.content?.length;

/**
 * A block that opens and closes: a summary line, and blocks of any kind inside it
 * (including more toggles). Whether it is open is saved with the page.
 *
 * In Markdown it is HTML, which GitHub and most viewers already show as a toggle:
 *
 *     <details open><summary>## Heading toggle</summary>
 *
 *     Any blocks, as Markdown.
 *
 *     </details>
 *
 * `open` is present while it is open. A summary that starts with `#`, `##` or `###` and a
 * space makes it a toggle heading of that level; otherwise it is a plain toggle.
 */
export const Toggle = Node.create({
  name: "toggle",
  group: "block",
  content: "toggleSummary block+",
  defining: true,

  addAttributes() {
    return {
      level: {
        default: 0,
        validate: (value) => value === 0 || value === 1 || value === 2 || value === 3,
        parseHTML: (element) => {
          const level = Number(element.getAttribute("data-level"));
          return level >= 1 && level <= 3 ? level : 0;
        },
        renderHTML: (attributes) => (attributes.level ? { "data-level": attributes.level } : {}),
      },
      open: {
        default: false,
        parseHTML: (element) => element.hasAttribute("open"),
        renderHTML: (attributes) => (attributes.open ? { open: "" } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "details" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["details", mergeAttributes(HTMLAttributes), 0];
  },

  markdownTokenName: "toggle",

  markdownTokenizer: {
    name: "toggle",
    level: "block",
    // Without its own `start`, @tiptap/markdown probes with a throwaway lexer (see page-link.ts).
    start: (src) => /^ {0,3}<details[\s>]/im.exec(src)?.index ?? -1,
    tokenize(src, _tokens, lexer) {
      const open = OPEN_TAG.exec(src);
      if (!open) return undefined;
      let at = open[0].length;
      const summary = SUMMARY.exec(src.slice(at));
      if (summary) at += summary[0].length;
      const close = findClose(src, at);
      if (!close) return undefined;

      const heading = /^(#{1,3})(?:[ \t]+([\s\S]*))?$/.exec((summary?.[1] ?? "").trim());
      const title = heading ? (heading[2] ?? "") : (summary?.[1] ?? "").trim();
      return {
        type: "toggle",
        raw: src.slice(0, close.end),
        level: heading ? heading[1].length : 0,
        open: /(?:^|\s)open(?:[\s=]|$)/i.test(open[1]),
        summaryTokens: lexer.inlineTokens(title.trim()),
        // The blank lines around the body are the syntax, not empty paragraphs.
        tokens: lexer.blockTokens(src.slice(at, close.bodyEnd).replace(/^\n+|\s+$/g, "")),
      } satisfies MarkdownToken;
    },
  },

  parseMarkdown: (token, helpers) => {
    const parseBlocks = helpers.parseBlockChildren ?? helpers.parseChildren;
    // Inside a list item or quote marked lexes loose lines as bare "text", not paragraphs.
    const body = parseBlocks((token.tokens ?? []).map((t) => (t.type === "text" ? { ...t, type: "paragraph" } : t)));
    const title = helpers.parseInline(token.summaryTokens ?? []);
    return helpers.createNode("toggle", { level: token.level as number, open: token.open as boolean }, [
      title.length ? helpers.createNode("toggleSummary", undefined, title) : { type: "toggleSummary" },
      ...(body.length ? body : [{ type: "paragraph" }]),
    ]);
  },

  renderMarkdown: (node, h) => {
    const [summary, ...body] = node.content ?? [];
    const level = (node.attrs?.level ?? 0) as ToggleLevel;
    const title = summaryText(h.renderChildren(summary?.content ?? []), level);
    const inside = body.length === 1 && isEmptyParagraph(body[0]) ? "" : h.renderChildren(body, "\n\n");
    const tag = `<details${node.attrs?.open ? " open" : ""}><summary>${title}</summary>`;
    return `${tag}\n\n${inside ? `${inside}\n\n` : ""}</details>`;
  },

  addCommands() {
    // A toggle takes the place of a paragraph or heading: look for where it fits.
    const build = (state: { schema: PMNode["type"]["schema"] }, level: ToggleLevel, summary: Fragment, body?: Fragment) => {
      const { toggle, toggleSummary, paragraph } = state.schema.nodes;
      return toggle.create({ level, open: true }, [
        toggleSummary.create(null, summary),
        ...(body ? body.content : [paragraph.create()]),
      ]);
    };
    const textBlock = (state: { selection: { $from: { parent: PMNode } } }) => {
      const parent = state.selection.$from.parent;
      return parent.type.name === "paragraph" || parent.type.name === "heading" ? parent : null;
    };

    return {
      wrapInToggle:
        (level) =>
        ({ state, tr, dispatch }) => {
          const block = textBlock(state);
          if (!block) return false;
          const { $from } = state.selection;
          const parent = $from.node(-1);
          const toggle = build(state, level, block.content);
          if (!parent.canReplaceWith($from.index(-1), $from.indexAfter(-1), toggle.type)) return false;
          if (dispatch) {
            tr.replaceWith($from.before(), $from.after(), toggle);
            // The cursor goes where it was in the text, now in the summary.
            tr.setSelection(TextSelection.create(tr.doc, $from.before() + 2 + $from.parentOffset));
            dispatch(tr.scrollIntoView());
          }
          return true;
        },

      insertToggle:
        (level) =>
        ({ state, tr, dispatch, commands }) => {
          const block = textBlock(state);
          if (!block) return false;
          // An empty line is replaced; where it can't be (the first line of a list item),
          // the toggle goes in after it.
          if (block.content.size === 0 && commands.wrapInToggle(level)) return true;
          const { $from } = state.selection;
          const toggle = build(state, level, Fragment.empty);
          const index = $from.indexAfter(-1);
          if (!$from.node(-1).canReplaceWith(index, index, toggle.type)) return false;
          if (dispatch) {
            const at = $from.after();
            tr.insert(at, toggle);
            tr.setSelection(TextSelection.create(tr.doc, at + 2));
            dispatch(tr.scrollIntoView());
          }
          return true;
        },

      unwrapToggle:
        () =>
        ({ state, tr, dispatch }) => {
          const { $from } = state.selection;
          let depth = $from.depth;
          while (depth > 0 && $from.node(depth).type.name !== "toggle") depth--;
          if (!depth) return false;
          const toggle = $from.node(depth);
          const { paragraph, heading } = state.schema.nodes;
          const level = toggle.attrs.level as ToggleLevel;
          const summary = toggle.firstChild?.content ?? Fragment.empty;
          const line = level ? heading.create({ level }, summary) : paragraph.create(null, summary);
          const body: PMNode[] = [];
          toggle.forEach((child, _offset, index) => {
            if (index > 0) body.push(child);
          });
          // The placeholder line of a toggle with nothing in it goes with the toggle.
          const empty = body.length === 1 && body[0].type === paragraph && body[0].content.size === 0;
          const blocks = Fragment.from(empty ? [line] : [line, ...body]);
          const index = $from.index(depth - 1);
          if (!$from.node(depth - 1).canReplace(index, index + 1, blocks)) return false;
          if (dispatch) {
            const start = $from.before(depth);
            tr.replaceWith(start, start + toggle.nodeSize, blocks);
            // The cursor goes to the end of the line that was the summary.
            tr.setSelection(TextSelection.create(tr.doc, start + 1 + line.content.size));
            dispatch(tr.scrollIntoView());
          }
          return true;
        },
    };
  },

  addInputRules() {
    // "> " is a toggle, and "# >", "## >", "### >" a toggle heading: the "# " has already
    // made a heading by the time the ">" is typed, so the rule reads its level from it.
    return [
      new InputRule({
        find: /^>\s$/,
        handler: ({ state, range, chain }) => {
          const parent = state.doc.resolve(range.from).parent;
          const level = parent.type.name === "heading" ? (parent.attrs.level as ToggleLevel) : 0;
          const done = chain().deleteRange(range).wrapInToggle(level).run();
          return done ? undefined : null;
        },
      }),
    ];
  },
});
