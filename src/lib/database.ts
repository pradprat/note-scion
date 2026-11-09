import { Node } from "@tiptap/core";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { TextSelection, type EditorState } from "@tiptap/pm/state";
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
          const plan = planDatabaseInsert(state);
          if (!plan) return false;
          if (dispatch) {
            tr.replaceWith(plan.from, plan.to, Fragment.from(plan.nodes));
            if (plan.caret !== null) tr.setSelection(TextSelection.create(tr.doc, plan.caret));
            dispatch(tr.scrollIntoView());
          }
          return true;
        },
    };
  },
});

/** Where and what insertDatabase puts into the document; null when the block can't go anywhere here. */
export interface DatabasePlan {
  from: number;
  to: number;
  nodes: PMNode[];
  /** Where the cursor goes, when it needs a new line to land on; null to leave it. */
  caret: number | null;
}

/**
 * An empty line is replaced by the database. Where it can't be (the first line of a
 * bullet or to-do item must stay a paragraph), or when the line has text, the database
 * goes in after the line, as a toggle does. The cursor needs a line below an atom, so one
 * is added when nothing follows.
 */
export function planDatabaseInsert(state: EditorState): DatabasePlan | null {
  const { $from } = state.selection;
  if ($from.depth < 1) return null;
  const parent = $from.node(-1);
  const database = state.schema.nodes.database.create(toAttrs(newDatabase()));
  const index = $from.index(-1);
  const empty = $from.parent.isTextblock && $from.parent.content.size === 0;
  const replace = empty && parent.canReplaceWith(index, index + 1, database.type);
  const at = replace ? index : $from.indexAfter(-1);
  if (!replace && !parent.canReplaceWith(at, at, database.type)) return null;

  const from = replace ? $from.before() : $from.after();
  const last = (replace ? index + 1 : at) >= parent.childCount;
  return {
    from,
    to: replace ? $from.after() : from,
    nodes: last ? [database, state.schema.nodes.paragraph.create()] : [database],
    caret: last ? from + database.nodeSize + 1 : null,
  };
}
