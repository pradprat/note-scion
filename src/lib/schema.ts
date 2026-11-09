import { wrappingInputRule } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Blockquote } from "@tiptap/extension-blockquote";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { DateMention } from "./date-mention";
import { PageLink } from "./page-link";
import { Toggle, ToggleSummary } from "./toggle";

/**
 * The block and mark types a note can hold. Shared by the browser editor and the
 * server-side Markdown conversion used by the MCP endpoint, so both agree on the
 * document schema. Editor-only behaviour (placeholder, slash menu) is added on top.
 */
export const noteExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
    // Tab indents inside code instead of leaving the editor. Keyboard only: no schema change.
    codeBlock: { enableTabIndentation: true, tabSize: 2 },
    // Replaced just below: only its typing shortcut differs.
    blockquote: false,
  }),
  // "> " starts a toggle now, so a quote is typed as `" ` (as in Notion). The block, its
  // Markdown and its "/" entry are the stock ones.
  Blockquote.extend({
    addInputRules() {
      return [wrappingInputRule({ find: /^\s*"\s$/, type: this.type })];
    },
  }),
  TaskList,
  // A screen reader hears the to-do itself ("Book the cabin, checkbox, checked"), not
  // "Task item checkbox for Book the cabin".
  TaskItem.configure({ nested: true, a11y: { checkboxLabel: (node) => node.textContent || "Empty to-do" } }),
  // Tables read and write as GitHub-flavoured Markdown tables over MCP. Columns size to
  // their content: no drag-to-resize, since Markdown couldn't keep the widths anyway.
  TableKit.configure({ table: { resizable: false, renderWrapper: true } }),
  PageLink,
  DateMention,
  // Toggles read and write as <details> over MCP (see toggle.ts).
  ToggleSummary,
  Toggle,
];
