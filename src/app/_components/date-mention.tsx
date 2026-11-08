"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { DateMention } from "@/lib/date-mention";
import { dateLabel, fullDate, shortDate, suggestDates, type DateSuggestion } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { floatMenu } from "./slash-command";

/* ---------- The chip ---------- */

/** Every date on screen, so "Today" turns into "Yesterday" at midnight without a reload. */
const chips = new Set<() => void>();
let midnightTimer: ReturnType<typeof setTimeout> | null = null;

function refreshChips() {
  chips.forEach((update) => update());
}

function scheduleMidnight() {
  if (midnightTimer || !chips.size) return;
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  midnightTimer = setTimeout(() => {
    midnightTimer = null;
    refreshChips();
    scheduleMidnight();
  }, next.getTime() - now.getTime());
}

// A laptop that slept through midnight doesn't fire the timer on time.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshChips();
  });
}

/** The shared date node, drawn as "@Today" and kept current. */
export const DateChip = DateMention.extend({
  addNodeView() {
    return ({ node }) => {
      let date = node.attrs.date as string;
      const dom = document.createElement("span");
      dom.className = "notes-date";
      dom.contentEditable = "false";
      const label = document.createElement("span");
      // The "@" marks the chip for the eye only; read aloud it would be "Dentist at Tomorrow".
      const at = Object.assign(document.createElement("span"), { className: "notes-date-at", textContent: "@" });
      at.setAttribute("aria-hidden", "true");
      dom.append(at, label);

      const render = () => {
        dom.dataset.date = date;
        dom.title = fullDate(date);
        label.textContent = dateLabel(date);
      };
      render();
      chips.add(render);
      scheduleMidnight();

      return {
        dom,
        update: (updated) => {
          if (updated.type !== node.type) return false;
          date = updated.attrs.date as string;
          render();
          return true;
        },
        destroy: () => {
          chips.delete(render);
        },
      };
    };
  },
});

/* ---------- The "@" menu ---------- */

type Props = SuggestionProps<DateSuggestion, DateSuggestion>;

export const dateKey = new PluginKey<{ active?: boolean }>("dateMention");

export interface DateMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/** The list of dates; the editor's "@" and the page title's "@" both use it. */
export const DateMenu = forwardRef<DateMenuHandle, Pick<Props, "items" | "command">>(function DateMenu(
  { items, command },
  ref
) {
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSelected(0), [items]);

  // The list scrolls when there is little room around the caret (a phone keyboard).
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
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

  // Nothing understood ("@ noon", an email being typed): stay out of the way.
  if (!items.length) return null;

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Insert date"
      className="max-h-[var(--menu-max-h,none)] w-72 overflow-y-auto overscroll-contain rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Date</p>
      {items.map((item, index) => {
        const exact = shortDate(item.date);
        return (
          <button
            key={item.date}
            type="button"
            role="option"
            aria-selected={index === selected}
            data-index={index}
            onMouseEnter={() => setSelected(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => command(item)}
            className={cn(
              "flex w-full items-baseline justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-sm outline-none [@media(pointer:coarse)]:py-2.5",
              index === selected && "bg-accent text-accent-foreground"
            )}
          >
            <span className="truncate">{item.label}</span>
            {item.label !== exact && <span className="shrink-0 text-xs text-muted-foreground">{exact}</span>}
          </button>
        );
      })}
    </div>
  );
});

/** "@today", "@fri", "@next monday", "@nov 12" … insert a date, as in Notion. */
export const DateCommand = Extension.create({
  name: "dateCommand",

  addProseMirrorPlugins() {
    return [
      Suggestion<DateSuggestion, DateSuggestion>({
        editor: this.editor,
        pluginKey: dateKey,
        char: "@",
        // "next friday" has a space in it. The menu hides once nothing matches.
        allowSpaces: true,
        allow: ({ state }) => !state.selection.$from.parent.type.spec.code,
        items: ({ query }) => suggestDates(query),
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: "dateMention", attrs: { date: props.date } },
              { type: "text", text: " " },
            ])
            .run();
        },
        render: () => {
          let renderer: ReactRenderer<DateMenuHandle, Props> | null = null;
          let menu: ReturnType<typeof floatMenu> | null = null;
          let open = false;

          const close = () => {
            menu?.destroy();
            menu = null;
            renderer?.element.remove();
            renderer?.destroy();
            renderer = null;
          };

          return {
            onStart: (props) => {
              open = props.items.length > 0;
              renderer = new ReactRenderer<DateMenuHandle, Props>(DateMenu, { props, editor: props.editor });
              const element = renderer.element as HTMLElement;
              element.style.position = "fixed";
              element.style.zIndex = "50";
              document.body.appendChild(element);
              menu = floatMenu(element, props.editor.view.dom);
              menu.update(props.clientRect);
            },
            onUpdate: (props) => {
              if (!renderer) return;
              open = props.items.length > 0;
              renderer.updateProps(props);
              menu?.update(props.clientRect);
            },
            onKeyDown: ({ event }) => {
              if (!open) return false;
              if (event.key === "Escape") {
                close();
                open = false;
                return true;
              }
              return renderer?.ref?.onKeyDown(event) ?? false;
            },
            onExit: close,
          };
        },
      }),
    ];
  },
});
