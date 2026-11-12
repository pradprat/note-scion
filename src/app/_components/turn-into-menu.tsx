"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { turnInto, type BlockKind } from "@/lib/turn-into";
import { BlockMenuList, SLASH_ITEMS, matchesQuery, type BlockMenuHandle, type SlashItem } from "./slash-menu";
import { floatMenu } from "./slash-command";

/** The kinds a block can turn into, in menu order, each shown as its "/" entry. */
const KINDS: [BlockKind, string][] = [
  ["text", "Text"],
  ["heading1", "Heading 1"],
  ["heading2", "Heading 2"],
  ["heading3", "Heading 3"],
  ["bulletList", "Bulleted list"],
  ["orderedList", "Numbered list"],
  ["taskList", "To-do list"],
  ["toggle0", "Toggle list"],
  ["toggle1", "Toggle heading 1"],
  ["toggle2", "Toggle heading 2"],
  ["toggle3", "Toggle heading 3"],
  ["blockquote", "Quote"],
  ["codeBlock", "Code"],
];

type TurnIntoItem = SlashItem & { kind: BlockKind };

const ITEMS: TurnIntoItem[] = KINDS.flatMap(([kind, title]) => {
  const item = SLASH_ITEMS.find((entry) => entry.title === title && !entry.suffix);
  return item ? [{ ...item, kind }] : [];
});

/**
 * The block types a block can become, opened from its grip. It looks and works like the
 * "/" menu: arrow keys, Enter or Tab, and typing narrows the list. Escape, a click
 * elsewhere, or the page changing closes it.
 */
export function TurnIntoMenu({
  editor,
  pos,
  current,
  anchor,
  onClose,
}: {
  editor: Editor;
  /** Where the block starts. */
  pos: number;
  /** What it is now. */
  current: BlockKind;
  /** The grip it hangs from. */
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<BlockMenuHandle>(null);

  const items = useMemo(() => (query ? ITEMS.filter((item) => matchesQuery(item, query)) : ITEMS), [query]);
  const checked = items.findIndex((item) => item.kind === current);

  const onPick = useCallback(
    (index: number) => {
      const item = items[index];
      onClose();
      if (item && item.kind !== current) turnInto(editor, pos, item.kind);
      else editor.commands.focus();
    },
    [items, current, editor, pos, onClose]
  );

  // Hangs below the grip, or above it when there's more room there.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const menu = floatMenu(box, editor.view.dom);
    menu.update(() => anchor.getBoundingClientRect());
    return () => menu.destroy();
  }, [anchor, editor]);

  // The editor keeps focus (the block stays selected), so keys are caught before it sees them.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
      let handled = true;
      if (event.key === "Escape") {
        onClose();
        editor.commands.focus();
      } else if (listRef.current?.onKeyDown(event)) {
        // Moved or picked.
      } else if (plain && event.key === "Backspace") {
        setQuery((q) => q.slice(0, -1));
      } else if (plain && event.key.length === 1) {
        // A leading space would match nothing new.
        if (query || event.key !== " ") setQuery((q) => q + event.key);
      } else if (event.key === "Enter" || event.key === "Tab") {
        // Nothing matches: stay put rather than typing into the block.
      } else {
        handled = false;
        // Anything else (a shortcut, say) is for the page.
        if (!["Shift", "Control", "Alt", "Meta"].includes(event.key)) onClose();
      }
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      // The grip toggles the menu itself.
      if (target && (boxRef.current?.contains(target) || anchor.contains(target))) return;
      onClose();
    };
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    editor.on("transaction", onTransaction);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
      editor.off("transaction", onTransaction);
    };
  }, [editor, anchor, onClose, query]);

  return createPortal(
    // The list comes first: floatMenu measures the box's first child.
    <div ref={boxRef} style={{ position: "fixed", top: 0, left: 0, zIndex: 50 }}>
      <BlockMenuList
        ref={listRef}
        items={items}
        onPick={onPick}
        label="Turn into"
        heading={query ? `Turn into · ${query}` : "Turn into"}
        checked={checked < 0 ? undefined : checked}
      />
    </div>,
    document.body
  );
}
