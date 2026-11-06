"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { longDate, suggestDates, type DateSuggestion } from "@/lib/dates";
import { DateMenu, type DateMenuHandle } from "./date-mention";

/** "@" + what's typed after it, ending at the caret: "@tod", "@next fri". */
const TRIGGER = /(?:^|\s)@([^@\n]{0,24})$/;
const MENU_WIDTH = 288;

/** The CSS a hidden copy of the title needs to wrap its text exactly as the title does. */
const MIRRORED = [
  "box-sizing",
  "width",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "font-family",
  "font-size",
  "font-weight",
  "font-feature-settings",
  "letter-spacing",
  "line-height",
  "text-wrap",
  "white-space",
  "word-break",
  "overflow-wrap",
  "tab-size",
];

/** Where character `index` of a textarea sits, relative to the textarea's box. */
function caretPoint(el: HTMLTextAreaElement, index: number): { left: number; bottom: number } {
  const style = getComputedStyle(el);
  const mirror = document.createElement("div");
  for (const name of MIRRORED) mirror.style.setProperty(name, style.getPropertyValue(name));
  Object.assign(mirror.style, { position: "absolute", visibility: "hidden", top: "0", left: "0", border: "0 solid" });
  mirror.textContent = el.value.slice(0, index);
  const marker = document.createElement("span");
  // The rest of the text too, so a balanced title wraps where the real one does.
  marker.textContent = el.value.slice(index) || ".";
  mirror.append(marker);
  document.body.append(mirror);
  const lineHeight = parseFloat(style.lineHeight) || marker.offsetHeight;
  const point = { left: marker.offsetLeft, bottom: marker.offsetTop + lineHeight };
  mirror.remove();
  return point;
}

/**
 * "@today" in the page title. A title is plain text (it is what the sidebar, search and
 * breadcrumbs show), so the date goes in as words, "November 3, 2026", not as a live chip.
 */
export function useTitleDates(
  titleRef: RefObject<HTMLTextAreaElement | null>,
  onInsert: (value: string, caret: number) => void
): {
  sync: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
  close: () => void;
  menu: ReactNode;
} {
  const [match, setMatch] = useState<{ start: number; query: string } | null>(null);
  const [point, setPoint] = useState({ left: 0, top: 0 });
  const dismissedAt = useRef<number | null>(null);
  const menuRef = useRef<DateMenuHandle>(null);

  const items = useMemo(() => (match ? suggestDates(match.query) : []), [match]);
  const open = items.length > 0;

  const close = useCallback(() => setMatch(null), []);

  /** Looks at the text before the caret and opens, moves or closes the menu. */
  const sync = useCallback(() => {
    const el = titleRef.current;
    if (!el || el.selectionStart !== el.selectionEnd) return setMatch(null);
    const found = TRIGGER.exec(el.value.slice(0, el.selectionStart));
    if (!found) {
      dismissedAt.current = null;
      return setMatch(null);
    }
    const start = el.selectionStart - found[1].length - 1;
    if (dismissedAt.current === start) return setMatch(null);
    setMatch((prev) => (prev?.start === start && prev.query === found[1] ? prev : { start, query: found[1] }));
    const caret = caretPoint(el, start);
    const room = el.clientWidth - MENU_WIDTH;
    setPoint({ left: Math.max(0, Math.min(caret.left, room)), top: caret.bottom + 6 });
  }, [titleRef]);

  const choose = useCallback(
    (item: DateSuggestion) => {
      const el = titleRef.current;
      if (!el || !match) return;
      const end = match.start + 1 + match.query.length;
      const after = el.value.slice(end);
      const text = longDate(item.date) + (after && !/^\s/.test(after) ? " " : "");
      const value = el.value.slice(0, match.start) + text + after;
      setMatch(null);
      onInsert(value, match.start + text.length);
    },
    [match, onInsert, titleRef]
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || !match || event.nativeEvent.isComposing) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      dismissedAt.current = match.start;
      setMatch(null);
      return true;
    }
    if (menuRef.current?.onKeyDown(event.nativeEvent)) {
      event.preventDefault();
      return true;
    }
    return false;
  };

  const menu = open ? (
    <div className="absolute z-50" style={{ left: point.left, top: point.top }}>
      <DateMenu ref={menuRef} items={items} command={choose} />
    </div>
  ) : null;

  return { sync, onKeyDown, close, menu };
}
