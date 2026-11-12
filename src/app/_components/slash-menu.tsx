"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Editor, Range } from "@tiptap/core";
import type { SuggestionProps } from "@tiptap/suggestion";
import {
  Check,
  Code2,
  Database,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListCollapse,
  ListTodo,
  Minus,
  Quote,
  Table,
  Type,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SlashItem {
  title: string;
  /** Said after the title in muted text: "Turn into". */
  suffix?: string;
  /** What typing at the start of a line does instead, shown on the right: "## >". */
  shortcut?: string;
  /** Only offered once something is typed, so the default list stays short. */
  searchOnly?: boolean;
  description: string;
  keywords: string[];
  icon: LucideIcon;
  run: (editor: Editor, range: Range) => void;
}

export const SLASH_ITEMS: SlashItem[] = [
  {
    title: "Text",
    description: "Plain paragraph",
    keywords: ["paragraph", "p", "plain"],
    icon: Type,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: "Page",
    description: "Add a page inside this one",
    keywords: ["subpage", "child", "new", "doc"],
    icon: FileText,
    run: (editor, range) => editor.commands.insertChildPage(range),
  },
  {
    title: "Heading 1",
    description: "Big section heading",
    keywords: ["h1", "title"],
    icon: Heading1,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    keywords: ["h2", "subtitle"],
    icon: Heading2,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    keywords: ["h3"],
    icon: Heading3,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
  },
  {
    title: "Bulleted list",
    description: "Simple bulleted list",
    keywords: ["ul", "bullet", "unordered"],
    icon: List,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: "Numbered list",
    description: "List with numbering",
    keywords: ["ol", "ordered", "number"],
    icon: ListOrdered,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: "To-do list",
    description: "Track tasks with checkboxes",
    keywords: ["todo", "task", "check", "checkbox"],
    icon: ListTodo,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: "Toggle list",
    shortcut: ">",
    description: "Hide blocks inside a line",
    keywords: ["collapse", "collapsible", "details", "dropdown", "fold"],
    icon: ListCollapse,
    run: (editor, range) => editor.chain().focus().deleteRange(range).insertToggle(0).run(),
  },
  ...([1, 2, 3] as const).map(
    (level): SlashItem => ({
      title: `Toggle heading ${level}`,
      shortcut: `${"#".repeat(level)} >`,
      description: "Collapsible heading",
      keywords: ["collapse", "collapsible", "details", "dropdown", `h${level}`],
      icon: [Heading1, Heading2, Heading3][level - 1],
      run: (editor, range) => editor.chain().focus().deleteRange(range).insertToggle(level).run(),
    })
  ),
  {
    title: "Quote",
    description: "Capture a quote",
    keywords: ["blockquote", "citation"],
    icon: Quote,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: "Table",
    description: "Rows and columns",
    keywords: ["grid", "columns", "rows", "spreadsheet"],
    icon: Table,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    title: "Database",
    description: "Rows with properties, as a table or a board",
    keywords: ["table", "board", "kanban", "tracker", "tasks", "list", "view", "db"],
    icon: Database,
    run: (editor, range) => editor.chain().focus().deleteRange(range).insertDatabase().run(),
  },
  {
    title: "Code",
    description: "Code block",
    keywords: ["codeblock", "pre", "snippet"],
    icon: Code2,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: "Divider",
    description: "Separate sections",
    keywords: ["hr", "rule", "separator", "line"],
    icon: Minus,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  // The same four, for the line that's already there: its text becomes the toggle's.
  ...([0, 1, 2, 3] as const).map(
    (level): SlashItem => ({
      title: level ? `Toggle heading ${level}` : "Toggle list",
      suffix: "Turn into",
      searchOnly: true,
      description: "Keep this line's text",
      keywords: ["toggle", "turn into", "convert", "collapse", ...(level ? [`h${level}`] : [])],
      icon: level ? [Heading1, Heading2, Heading3][level - 1] : ListCollapse,
      run: (editor, range) => editor.chain().focus().deleteRange(range).wrapInToggle(level).run(),
    })
  ),
];

/** Whether an item answers what was typed after "/" (or into the "Turn into" menu). */
export function matchesQuery(item: Pick<SlashItem, "title" | "keywords">, query: string): boolean {
  const q = query.trim().toLowerCase();
  return item.title.toLowerCase().includes(q) || item.keywords.some((keyword) => keyword.startsWith(q));
}

export function filterSlashItems(query: string): SlashItem[] {
  if (!query.trim()) return SLASH_ITEMS.filter((item) => !item.searchOnly);
  return SLASH_ITEMS.filter((item) => matchesQuery(item, query));
}

/** One row of a block menu. */
export type BlockMenuItem = Pick<SlashItem, "title" | "suffix" | "shortcut" | "description" | "icon">;

export interface BlockMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/**
 * The list of block types behind "/" and a block's grip: arrow keys move through it, Enter
 * or Tab picks. The item marked `checked` is what the block already is.
 */
export const BlockMenuList = forwardRef<
  BlockMenuHandle,
  {
    items: BlockMenuItem[];
    onPick: (index: number) => void;
    /** Read out for the list: "Insert block". */
    label: string;
    /** Shown above the items: "Blocks". */
    heading: string;
    checked?: number;
  }
>(function BlockMenuList({ items, onPick, label, heading, checked }, ref) {
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSelected(0), [items]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (event) => {
        if (!items.length) return false;
        if (event.key === "ArrowDown") {
          setSelected((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelected((i) => (i - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          if (items[selected]) onPick(selected);
          return true;
        }
        return false;
      },
    }),
    [items, selected, onPick]
  );

  if (!items.length) {
    return (
      <div className="w-64 rounded-md border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-md">
        No matching blocks
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={label}
      className="max-h-[min(20rem,var(--menu-max-h,20rem))] w-64 overflow-y-auto overscroll-contain rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{heading}</p>
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <button
            key={`${item.title}${item.suffix ?? ""}`}
            type="button"
            role="option"
            aria-selected={index === selected}
            aria-current={index === checked || undefined}
            data-index={index}
            onMouseEnter={() => setSelected(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(index)}
            className={cn(
              "flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left outline-none",
              index === selected && "bg-accent text-accent-foreground"
            )}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background">
              <Icon size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">
                {item.title}
                {item.suffix && <span className="text-muted-foreground"> · {item.suffix}</span>}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
            </span>
            {index === checked ? (
              <Check size={15} aria-label="Current" className="shrink-0 text-muted-foreground" />
            ) : (
              item.shortcut && (
                // A key hint: there is no keyboard to type it on a phone.
                <span className="shrink-0 font-mono text-[0.625rem] font-medium text-muted-foreground [@media(hover:none)]:hidden">
                  {item.shortcut}
                </span>
              )
            )}
          </button>
        );
      })}
    </div>
  );
});

export type SlashMenuHandle = BlockMenuHandle;

const SlashMenu = forwardRef<SlashMenuHandle, SuggestionProps<SlashItem, SlashItem>>(function SlashMenu(
  { items, command },
  ref
) {
  const onPick = useCallback((index: number) => command(items[index]), [items, command]);
  return <BlockMenuList ref={ref} items={items} onPick={onPick} label="Insert block" heading="Blocks" />;
});

export default SlashMenu;
