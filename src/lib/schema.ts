import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { DateMention } from "./date-mention";
import { PageLink } from "./page-link";

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
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  PageLink,
  DateMention,
];
