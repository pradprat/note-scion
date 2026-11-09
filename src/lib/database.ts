import { Node } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { newDatabase, normalizeDatabase, type DatabaseData } from "./database-model";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    database: {
      /** Adds an empty database: in place of the empty line holding the cursor, or after the line. */
      insertDatabase: () => ReturnType;
    };
  }
}

/** The block's attributes for a database; the attributes are the database. */
export const toAttrs = (db: DatabaseData) => ({
  title: db.title,
  properties: db.properties,
  rows: db.rows,
  views: db.views,
});

export const fromAttrs = (attrs: Record<string, unknown>): DatabaseData => normalizeDatabase(attrs);

/** The name of the fenced block's info string: ```note-database */
const INFO = "note-database";
const FENCE = new RegExp(`^ {0,3}(\`{3,}|~{3,})${INFO}[ \\t]*\\n([\\s\\S]*?)\\n {0,3}\\1[ \\t]*(?:\\n|$)`);
const ANY_FENCE = new RegExp(`^ {0,3}(?:\`{3,}|~{3,})${INFO}[ \\t]*$`, "m");

/**
 * The database as Markdown text: JSON with a property, and a row, to a line, so it reads
 * as a list and a change to one row is a one-line change.
 */
export function databaseJson(db: DatabaseData): string {
  const lines = (items: unknown[]) =>
    items.length ? `[\n${items.map((item) => `    ${JSON.stringify(item)}`).join(",\n")}\n  ]` : "[]";
  return [
    "{",
    `  "title": ${JSON.stringify(db.title)},`,
    `  "properties": ${lines(db.properties)},`,
    `  "rows": ${lines(db.rows)},`,
    `  "views": ${JSON.stringify(db.views)}`,
    "}",
  ].join("\n");
}

/**
 * A table with typed properties and rows, shown as a Table or a Kanban board. The whole
 * database is the attributes of this one block: no table in the database, no migration,
 * and it saves, versions and conflicts with the page like the rest of it.
 *
 * In Markdown it is a fenced block whose content is that data as JSON, written whole and
 * read whole, so a page goes out over MCP and comes back the same:
 *
 *     ```note-database
 *     { "title": "Tasks", "properties": [...], "rows": [...], "views": {...} }
 *     ```
 *
 * JSON that doesn't parse leaves an ordinary code block, with the text intact.
 */
export const Database = Node.create({
  name: "database",
  group: "block",
  atom: true,
  selectable: true,
  // Not draggable as a whole: cards inside have their own drag, and text can't be
  // selected in a draggable block. Its grip moves it.
  draggable: false,

  addAttributes() {
    return {
      title: { default: "", rendered: false },
      properties: { default: [], rendered: false },
      rows: { default: [], rendered: false },
      views: { default: { active: "table" }, rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-database]",
        getAttrs: (element) => {
          try {
            return toAttrs(normalizeDatabase(JSON.parse(element.getAttribute("data-database") ?? "")));
          } catch {
            return false;
          }
        },
      },
    ];
  },

  // Copy and paste inside the app carry the whole database in this attribute.
  renderHTML({ node }) {
    return ["div", { "data-database": JSON.stringify(toAttrs(fromAttrs(node.attrs))) }];
  },

  renderText: ({ node }) => {
    const db = fromAttrs(node.attrs);
    return `${db.title || "Database"} (${db.rows.length} ${db.rows.length === 1 ? "row" : "rows"})`;
  },

  markdownTokenName: "database",

  markdownTokenizer: {
    name: "database",
    level: "block",
    // Without its own `start`, @tiptap/markdown probes with a throwaway lexer (see page-link.ts).
    start: (src) => ANY_FENCE.exec(src)?.index ?? -1,
    tokenize(src) {
      const match = FENCE.exec(src);
      if (!match) return undefined;
      try {
        const data: unknown = JSON.parse(match[2]);
        if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
        return { type: "database", raw: match[0], data };
      } catch {
        return undefined;
      }
    },
  },

  parseMarkdown: (token, helpers) => helpers.createNode("database", toAttrs(normalizeDatabase(token.data))),

  renderMarkdown: (node) => `\`\`\`${INFO}\n${databaseJson(fromAttrs(node.attrs ?? {}))}\n\`\`\``,

  addCommands() {
    return {
      insertDatabase:
        () =>
        ({ state, tr, dispatch }) => {
          const { $from } = state.selection;
          const parent = $from.node(-1);
          const block = $from.parent;
          const database = state.schema.nodes.database.create(toAttrs(newDatabase()));
          const empty = block.isTextblock && block.content.size === 0 && $from.depth > 0;
          const index = empty ? $from.index(-1) : $from.indexAfter(-1);
          if (!parent.canReplaceWith(index, empty ? index + 1 : index, database.type)) return false;
          if (dispatch) {
            const from = empty ? $from.before() : $from.after();
            // The cursor needs a line to land on below an atom.
            const last = index + (empty ? 1 : 0) >= parent.childCount;
            const after = Fragment.from(last ? [database, state.schema.nodes.paragraph.create()] : [database]);
            if (empty) tr.replaceWith(from, $from.after(), after);
            else tr.insert(from, after);
            if (last) tr.setSelection(TextSelection.create(tr.doc, from + database.nodeSize + 1));
            dispatch(tr.scrollIntoView());
          }
          return true;
        },
    };
  },
});
