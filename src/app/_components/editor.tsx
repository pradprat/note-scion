"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { offset, type ComputePositionConfig } from "@floating-ui/dom";
import type { Node as PMNode } from "@tiptap/pm/model";
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Placeholder } from "@tiptap/extensions";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import type { NestedOptions } from "@tiptap/extension-drag-handle";
import { Selection, TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";
import { noteExtensions } from "@/lib/schema";
import { PageLink } from "@/lib/page-link";
import { DateMention } from "@/lib/date-mention";
import { Toggle } from "@/lib/toggle";
import {
  Bold,
  Check,
  Code,
  ExternalLink,
  GripVertical,
  Italic,
  Link as LinkIcon,
  Minus,
  Plus,
  Strikethrough,
  Trash2,
  Underline,
  Unlink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { SlashCommand, slashKey } from "./slash-command";
import { PageBlock } from "./page-link-view";
import { DateChip, DateCommand, dateKey } from "./date-mention";
import { ToggleBehavior, ToggleBlock } from "./toggle-view";

/**
 * Up from the first line, or Backspace at the very start of a leading paragraph, hands the
 * cursor back to the title, the way it would move between lines of one document.
 */
function leavesTop(view: EditorView, event: KeyboardEvent): boolean {
  if (event.key !== "ArrowUp" && event.key !== "Backspace") return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return false;
  const { state } = view;
  if (!state.selection.empty || slashKey.getState(state)?.active || dateKey.getState(state)?.active) return false;
  const { $from } = state.selection;
  // Only from the first text block in the page.
  if ($from.start() !== Selection.atStart(state.doc).$from.start()) return false;

  if (event.key === "ArrowUp") return view.endOfTextblock("up");

  // Backspace: headings and list items keep their own "turn back into text" behaviour.
  if ($from.parentOffset !== 0 || $from.depth !== 1 || $from.parent.type.name !== "paragraph") return false;
  // An empty first line goes away with the step back, as a line break would.
  if ($from.parent.content.size === 0 && state.doc.childCount > 1) {
    view.dispatch(state.tr.delete($from.before(), $from.after()));
  }
  return true;
}

export default function NoteEditor({
  content,
  onChange,
  onReady,
  onExitTop,
  onCreateChild,
  onOpenPage,
}: {
  content: JSONContent | null;
  onChange: (content: JSONContent) => void;
  onReady?: (editor: Editor) => void;
  /** The cursor left the top of the page (see leavesTop). */
  onExitTop?: () => void;
  /** "/page": makes a page inside this one and returns its id (null if it failed). */
  onCreateChild?: () => Promise<string | null>;
  onOpenPage?: (id: string) => void;
}) {
  // The editor is created once; read the latest callbacks through refs.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onExitTopRef = useRef(onExitTop);
  onExitTopRef.current = onExitTop;
  const onCreateChildRef = useRef(onCreateChild);
  onCreateChildRef.current = onCreateChild;
  const onOpenPageRef = useRef(onOpenPage);
  onOpenPageRef.current = onOpenPage;

  const editor = useEditor({
    // Required with server rendering: the editor only exists on the client.
    immediatelyRender: false,
    extensions: [
      // The shared sub-page block, date and toggle, with editor-only views (and "/page") on top.
      ...noteExtensions.filter(
        (extension) => extension !== PageLink && extension !== DateMention && extension !== Toggle
      ),
      DateChip,
      ToggleBlock,
      ToggleBehavior,
      PageBlock.configure({
        createChild: () => onCreateChildRef.current?.() ?? Promise.resolve(null),
        openPage: (id) => onOpenPageRef.current?.(id),
      }),
      Placeholder.configure({
        placeholder: ({ node, pos, editor }) => {
          if (node.type.name === "heading") return "Heading";
          if (node.type.name === "toggleSummary") {
            const level = editor.state.doc.resolve(pos).parent.attrs.level as number;
            return level ? `Toggle heading ${level}` : "Toggle";
          }
          return "Type '/' for commands";
        },
      }),
      SlashCommand,
      DateCommand,
    ],
    content: content ?? "",
    editorProps: {
      attributes: { class: "notes-editor", "aria-label": "Page content" },
      handleKeyDown: (view, event) => {
        if (!onExitTopRef.current || !leavesTop(view, event)) return false;
        event.preventDefault();
        onExitTopRef.current();
        return true;
      },
      // A plain click places the cursor in a link to edit it; Mod+click follows it.
      handleClick: (_view, _pos, event) => {
        if (!(event.metaKey || event.ctrlKey)) return false;
        const link = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
        // A sub-page block is a real link: the browser opens it in a new tab itself.
        if (!link || link.closest("[data-page-link]")) return false;
        window.open(link.href, "_blank", "noopener,noreferrer");
        return true;
      },
    },
    onUpdate: ({ editor }) => onChangeRef.current(editor.getJSON()),
  });

  useEffect(() => {
    if (editor && onReady) onReady(editor);
  }, [editor, onReady]);

  if (!editor) return <div className="notes-editor min-h-40" aria-hidden />;

  return (
    // Positioned so the grip and its outline measure from the editor, not the page.
    <div className="relative">
      <BlockHandle editor={editor} />
      <FormatMenu editor={editor} />
      <TableMenu editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

/** Space between a block's left edge and its grip. */
const GRIP_GAP = 4;

/**
 * Which block a grip moves. The extension's default edge detection skips list items when
 * the pointer is in the top 12px of the line (or near their left edge), and since it also
 * never offers a whole list, nothing qualifies there and the grip stays on the previous
 * block. Without it the innermost list or to-do item wins, as in Notion. A quote moves
 * as one block rather than paragraph by paragraph, and so does a table: its rows,
 * cells and the text in them have no grips of their own.
 */
const NESTED_GRIPS: NestedOptions = {
  edgeDetection: "none",
  rules: [
    {
      id: "quoteMovesWhole",
      evaluate: ({ parent }) => (parent?.type.name === "blockquote" ? 1000 : 0),
    },
    {
      // The summary is the toggle's first line: its grip moves the toggle. Blocks inside
      // keep their own grips, so they can be reordered or taken out.
      id: "summaryMovesToggle",
      evaluate: ({ node }) => (node.type.name === "toggleSummary" ? 1000 : 0),
    },
    {
      id: "tableMovesWhole",
      // `$pos` is the pointer's position, shared by every candidate: look above this one.
      evaluate: ({ $pos, depth }) => {
        for (let d = Math.min(depth, $pos.depth + 1) - 1; d > 0; d--) {
          if ($pos.node(d).type.name === "table") return 1000;
        }
        return 0;
      },
    },
  ],
};

interface GripTarget {
  pos: number;
  dom: HTMLElement | null;
  /** List items: room the bullet or number takes, so the grip sits clear of it. */
  marker: number;
}

/**
 * The grip left of the block under the pointer: drag it to move the block, click it to
 * select the block. Hovering it outlines exactly what will move (a list item or the
 * whole list, for instance).
 */
function BlockHandle({ editor }: { editor: Editor }) {
  const gripRef = useRef<HTMLDivElement>(null);
  const outlineRef = useRef<HTMLDivElement>(null);
  const target = useRef<GripTarget | null>(null);

  // Kept stable: DragHandle registers its plugin again whenever this object changes.
  const position = useMemo<ComputePositionConfig>(
    () => ({
      placement: "left-start",
      strategy: "absolute",
      middleware: [offset(() => GRIP_GAP + (target.current?.marker ?? 0))],
    }),
    []
  );

  const onNodeChange = useCallback(
    ({ node, pos }: { node: PMNode | null; pos: number }) => {
      if (!node || pos < 0) {
        target.current = null;
        return;
      }
      const found = editor.view.nodeDOM(pos);
      const dom = found instanceof HTMLElement ? found : null;
      const isItem = node.type.name === "listItem" || node.type.name === "taskItem";
      const list = isItem ? dom?.parentElement : null;
      const marker = dom && list ? dom.getBoundingClientRect().left - list.getBoundingClientRect().left : 0;
      target.current = { pos, dom, marker };
      // The grip's height follows the block's first line so the dots sit level with it.
      if (gripRef.current) {
        const level = node.type.name === "heading" || node.type.name === "toggle" ? (node.attrs.level as number) : 0;
        gripRef.current.dataset.block = level ? `heading-${level}` : node.type.name;
      }
    },
    [editor]
  );

  const showOutline = () => {
    const box = outlineRef.current;
    const { dom, marker = 0 } = target.current ?? {};
    const frame = box?.offsetParent;
    if (!box || !dom?.isConnected || !frame) return;
    const block = dom.getBoundingClientRect();
    const origin = frame.getBoundingClientRect();
    // A list item's bullet or number sits outside its box; it moves with it, so include it.
    Object.assign(box.style, {
      top: `${block.top - origin.top}px`,
      left: `${block.left - origin.left - marker}px`,
      width: `${block.width + marker}px`,
      height: `${block.height}px`,
    });
    box.dataset.visible = "true";
  };
  const hideOutline = () => {
    if (outlineRef.current) outlineRef.current.dataset.visible = "false";
  };

  return (
    <>
      <div ref={outlineRef} aria-hidden className="notes-drag-outline" data-visible="false" />
      <DragHandle
        editor={editor}
        nested={NESTED_GRIPS}
        computePositionConfig={position}
        onNodeChange={onNodeChange}
        onElementDragStart={hideOutline}
      >
        <div
          ref={gripRef}
          className="notes-drag-handle"
          title="Drag to move, click to select"
          onMouseEnter={showOutline}
          onMouseLeave={hideOutline}
          onClick={() => {
            const pos = target.current?.pos;
            if (pos === undefined) return;
            hideOutline();
            editor.chain().focus().setNodeSelection(pos).run();
          }}
        >
          <GripVertical size={16} />
        </div>
      </DragHandle>
    </>
  );
}


/** Adds a scheme to bare domains ("example.com" → "https://example.com"). */
function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("/") || url.startsWith("#")) return url;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) return `mailto:${url}`;
  return `https://${url}`;
}

/** A shadcn ghost icon button, sized for the toolbar. */
const MENU_BUTTON = cn(
  buttonVariants({ variant: "ghost", size: "icon" }),
  "h-8 w-8 text-muted-foreground hover:text-accent-foreground"
);
/** The pressed state of a toolbar toggle. */
const MENU_ACTIVE = "bg-accent text-accent-foreground";

function FormatMenu({ editor }: { editor: Editor }) {
  const [editingLink, setEditingLink] = useState(false);
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      strike: editor.isActive("strike"),
      code: editor.isActive("code"),
      link: editor.isActive("link"),
      href: (editor.getAttributes("link").href as string | undefined) ?? "",
      empty: editor.state.selection.empty,
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    }),
  });

  // Moving the cursor or selection starts back on the buttons, or on the link preview.
  useEffect(() => {
    setEditingLink(false);
  }, [state.from, state.to]);

  // Mod+K with text selected edits its link; with nothing selected it stays the quick
  // switcher (the shell skips events already handled here).
  useEffect(() => {
    const dom = editor.view.dom;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== "k" || editor.state.selection.empty) return;
      if (editor.isActive("codeBlock")) return;
      event.preventDefault();
      setEditingLink(true);
    };
    dom.addEventListener("keydown", onKey);
    return () => dom.removeEventListener("keydown", onKey);
  }, [editor]);

  const buttons = [
    { key: "bold", label: "Bold", icon: Bold, run: () => editor.chain().focus().toggleBold().run() },
    { key: "italic", label: "Italic", icon: Italic, run: () => editor.chain().focus().toggleItalic().run() },
    {
      key: "underline",
      label: "Underline",
      icon: Underline,
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      key: "strike",
      label: "Strikethrough",
      icon: Strikethrough,
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    { key: "code", label: "Inline code", icon: Code, run: () => editor.chain().focus().toggleCode().run() },
  ] as const;

  return (
    <BubbleMenu
      editor={editor}
      // A selection gets the format buttons; a cursor resting in a link gets its preview.
      // A whole block picked by its grip (or just dropped) is not text to format.
      shouldShow={({ editor, state: editorState }) =>
        editor.isEditable &&
        editorState.selection instanceof TextSelection &&
        !editor.isActive("codeBlock") &&
        (!editorState.selection.empty || editor.isActive("link"))
      }
      // The preview hangs below the line so it never covers the text being typed.
      options={{ placement: state.empty ? "bottom-start" : "top", offset: 8, flip: true }}
      className="flex items-center gap-0.5 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {!editingLink && state.empty ? (
        state.link && (
          <LinkPreview
            href={state.href}
            onEdit={() => setEditingLink(true)}
            onRemove={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
          />
        )
      ) : editingLink ? (
        <LinkForm
          key={state.href}
          href={state.href}
          onDone={() => {
            setEditingLink(false);
            editor.commands.focus();
          }}
          onApply={(href) => {
            const chain = editor.chain().focus().extendMarkRange("link");
            if (href) chain.setLink({ href }).run();
            else chain.unsetLink().run();
            setEditingLink(false);
          }}
        />
      ) : (
        <>
          {buttons.map(({ key, label, icon: Icon, run }) => (
            <button
              key={key}
              type="button"
              aria-label={label}
              title={label}
              aria-pressed={state[key]}
              onClick={run}
              className={cn(MENU_BUTTON, state[key] && MENU_ACTIVE)}
            >
              <Icon size={15} />
            </button>
          ))}
          <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
          <button
            type="button"
            aria-label={state.link ? "Edit link" : "Add link"}
            title={state.link ? "Edit link" : "Add link"}
            aria-pressed={state.link}
            onClick={() => setEditingLink(true)}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "h-8 gap-1.5 px-2 text-muted-foreground hover:text-accent-foreground",
              state.link && MENU_ACTIVE
            )}
          >
            <LinkIcon size={15} />
            <span className="pr-0.5">Link</span>
          </button>
        </>
      )}
    </BubbleMenu>
  );
}

/** The table holding the selection, and where it starts. */
function selectedTable(editor: Editor): { pos: number; node: PMNode } | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === "table") return { pos: $from.before(depth), node };
  }
  return null;
}

/** A labelled toolbar button: "+ Row", "− Column". */
const TABLE_BUTTON = cn(
  buttonVariants({ variant: "ghost", size: "sm" }),
  "h-8 gap-1 px-2 font-normal text-muted-foreground hover:text-accent-foreground"
);

/**
 * Rows and columns for the table holding the cursor, above its top edge. It stands aside
 * while text is selected (the format menu's turn) or the cursor rests in a link.
 */
function TableMenu({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      headerRow: selectedTable(editor)?.node.firstChild?.firstChild?.type.name === "tableHeader",
      canDeleteRow: editor.can().deleteRow(),
      canDeleteColumn: editor.can().deleteColumn(),
    }),
  });

  const buttons = [
    { label: "Row", title: "Add a row below", icon: Plus, run: () => editor.chain().focus().addRowAfter().run() },
    {
      label: "Column",
      title: "Add a column to the right",
      icon: Plus,
      run: () => editor.chain().focus().addColumnAfter().run(),
    },
    null,
    {
      label: "Row",
      title: "Delete this row",
      icon: Minus,
      disabled: !state.canDeleteRow,
      run: () => editor.chain().focus().deleteRow().run(),
    },
    {
      label: "Column",
      title: "Delete this column",
      icon: Minus,
      disabled: !state.canDeleteColumn,
      run: () => editor.chain().focus().deleteColumn().run(),
    },
  ];

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableMenu"
      shouldShow={({ editor, state: editorState }) => {
        if (!editor.isEditable || !editor.isActive("table") || editor.isActive("link")) return false;
        const { selection } = editorState;
        return selection instanceof CellSelection || (selection instanceof TextSelection && selection.empty);
      }}
      getReferencedVirtualElement={() => {
        const table = selectedTable(editor);
        const dom = table && editor.view.nodeDOM(table.pos);
        if (!(dom instanceof HTMLElement)) return null;
        return { getBoundingClientRect: () => dom.getBoundingClientRect() };
      }}
      options={{ placement: "top-start", offset: 6, flip: true }}
      className="flex items-center gap-0.5 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {buttons.map((button, index) =>
        button ? (
          <button
            key={`${button.title}`}
            type="button"
            title={button.title}
            aria-label={button.title}
            disabled={button.disabled}
            onClick={button.run}
            className={cn(TABLE_BUTTON, "disabled:opacity-40")}
          >
            <button.icon size={14} />
            {button.label}
          </button>
        ) : (
          <span key={`sep-${index}`} aria-hidden className="mx-0.5 h-5 w-px bg-border" />
        )
      )}
      <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
      <button
        type="button"
        title="Show the first row as headings"
        aria-pressed={state.headerRow}
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
        className={cn(TABLE_BUTTON, state.headerRow && MENU_ACTIVE)}
      >
        Header
      </button>
      <button
        type="button"
        aria-label="Delete table"
        title="Delete table"
        onClick={() => editor.chain().focus().deleteTable().run()}
        className={MENU_BUTTON}
      >
        <Trash2 size={15} />
      </button>
    </BubbleMenu>
  );
}

/** "https://www.example.com/path/" reads as "example.com/path". */
function displayUrl(href: string): string {
  return href.replace(/^(https?:\/\/|mailto:)/i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

/** Where the link under the cursor goes, with ways to follow, change or remove it. */
function LinkPreview({ href, onEdit, onRemove }: { href: string; onEdit: () => void; onRemove: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open ${href}`}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "h-8 min-w-0 max-w-72 justify-start gap-1.5 px-2 font-normal text-muted-foreground hover:text-accent-foreground"
        )}
      >
        <ExternalLink size={14} className="shrink-0" />
        <span className="truncate">{displayUrl(href)}</span>
      </a>
      <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />
      <button
        type="button"
        onClick={onEdit}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "h-8 shrink-0 px-2 text-muted-foreground hover:text-accent-foreground"
        )}
      >
        Edit
      </button>
      <button type="button" aria-label="Remove link" title="Remove link" onClick={onRemove} className={MENU_BUTTON}>
        <Unlink size={15} />
      </button>
    </div>
  );
}

function LinkForm({
  href,
  onApply,
  onDone,
}: {
  href: string;
  onApply: (href: string) => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState(href);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <form
      className="flex items-center gap-0.5"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(normalizeUrl(value));
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onDone();
        }
      }}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Paste or type a link"
        aria-label="Link address"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        className="h-8 w-56 min-w-0 rounded bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground [@media(pointer:coarse)]:text-base"
      />
      <button type="submit" aria-label="Apply link" title="Apply (Enter)" className={MENU_BUTTON}>
        <Check size={15} />
      </button>
      {href && (
        <>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open link in a new tab"
            title="Open link"
            className={MENU_BUTTON}
          >
            <ExternalLink size={15} />
          </a>
          <button
            type="button"
            aria-label="Remove link"
            title="Remove link"
            onClick={() => onApply("")}
            className={MENU_BUTTON}
          >
            <Unlink size={15} />
          </button>
        </>
      )}
    </form>
  );
}
