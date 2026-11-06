"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Editor, Range } from "@tiptap/core";
import type { SuggestionProps } from "@tiptap/suggestion";
import {
  Code2,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Type,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SlashItem {
  title: string;
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
    title: "Quote",
    description: "Capture a quote",
    keywords: ["blockquote", "citation"],
    icon: Quote,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
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
];

export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter(
    (item) =>
      item.title.toLowerCase().includes(q) || item.keywords.some((keyword) => keyword.startsWith(q))
  );
}

export interface SlashMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const SlashMenu = forwardRef<SlashMenuHandle, SuggestionProps<SlashItem, SlashItem>>(
  function SlashMenu({ items, command }, ref) {
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
            const item = items[selected];
            if (item) command(item);
            return true;
          }
          return false;
        },
      }),
      [items, selected, command]
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
        aria-label="Insert block"
        className="max-h-80 w-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Blocks</p>
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              key={item.title}
              type="button"
              role="option"
              aria-selected={index === selected}
              data-index={index}
              onMouseEnter={() => setSelected(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => command(item)}
              className={cn(
                "flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left outline-none",
                index === selected && "bg-accent text-accent-foreground"
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background">
                <Icon size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }
);

export default SlashMenu;
