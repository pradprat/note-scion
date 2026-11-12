import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { autoUpdate, computePosition, offset, shift } from "@floating-ui/dom";
import SlashMenu, { filterSlashItems, type SlashItem, type SlashMenuHandle } from "./slash-menu";

type Props = SuggestionProps<SlashItem, SlashItem>;
type ClientRect = SuggestionProps<unknown>["clientRect"];

/** Lets other key handlers stand aside while the menu is open. */
export const slashKey = new PluginKey<{ active?: boolean }>("slashCommand");

type Side = "bottom" | "top";
const GAP = 6; // between the line and the menu
const EDGE = 8; // kept clear at the screen's edges

/**
 * Hangs a suggestion menu below the text being typed, or above it when it doesn't fit
 * below and there is more room above, and never over the line itself. It keeps that side
 * while it fits there. Its height is capped at the room on that side (as `--menu-max-h`,
 * for the menu's scrolling list).
 *
 * The side is chosen from the list's full height, not its capped height: otherwise a
 * menu first measured while React was still filling it in (0px tall, so "fits below")
 * gets capped to the room below and then keeps "fitting" there. It is placed again when
 * its content renders or changes size and when the page scrolls. The room is measured
 * in the visual viewport, so a phone's on-screen keyboard counts.
 */
export function floatMenu(element: HTMLElement, scrollContext: Element) {
  let clientRect: ClientRect = null;
  let last = new DOMRect();
  let side: Side | null = null;
  element.classList.add("notes-float-menu");
  // The caret's rect; the last one we had, while the suggestion is being torn down.
  const reference = {
    contextElement: scrollContext,
    getBoundingClientRect: () => (last = clientRect?.() ?? last),
  };

  const place = () => {
    const caret = reference.getBoundingClientRect();
    const view = window.visualViewport;
    const top = (view?.offsetTop ?? 0) + EDGE;
    const bottom = (view ? view.offsetTop + view.height : window.innerHeight) - EDGE;
    const below = bottom - caret.bottom - GAP;
    const above = caret.top - GAP - top;

    const list = element.firstElementChild as HTMLElement | null;
    const full = list ? list.scrollHeight + (list.offsetHeight - list.clientHeight) : 0;
    const room = (s: Side) => (s === "bottom" ? below : above);
    const fits = (s: Side) => full <= room(s);
    const preferred: Side = fits("bottom") || below >= above ? "bottom" : "top";
    // Once open, stay on that side while the list fits there, so filtering it down to a
    // few items doesn't make it jump across the line mid-word. Move only to more room.
    let next = side ?? preferred;
    if (side && !fits(side) && room(preferred) > room(side)) next = preferred;
    if (full > 0) side = next; // not settled while React is still filling it in
    element.style.setProperty("--menu-max-h", `${Math.max(96, Math.floor(room(next)))}px`);
    element.dataset.side = next;

    void computePosition(reference, element, {
      placement: `${next}-start`,
      strategy: "fixed",
      middleware: [offset(GAP), shift({ padding: EDGE })],
    }).then(({ x, y }) => {
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
    });
  };

  let stop: (() => void) | null = null;
  return {
    update(rect: ClientRect) {
      clientRect = rect;
      if (stop) return place();
      const stopFollowing = autoUpdate(reference, element, place);
      // A phone keyboard opening resizes the visual viewport, not the window.
      const view = window.visualViewport;
      view?.addEventListener("resize", place);
      view?.addEventListener("scroll", place);
      stop = () => {
        stopFollowing();
        view?.removeEventListener("resize", place);
        view?.removeEventListener("scroll", place);
      };
    },
    destroy() {
      stop?.();
      stop = null;
    },
  };
}

/** Notion-style "/" menu for inserting blocks. */
export const SlashCommand = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        pluginKey: slashKey,
        char: "/",
        // Not inside code, where "/" is just a character, and not in a toggle's summary,
        // which can only hold text.
        allow: ({ state }) => {
          const parent = state.selection.$from.parent;
          return !parent.type.spec.code && parent.type.name !== "toggleSummary";
        },
        items: ({ query }) => filterSlashItems(query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          let renderer: ReactRenderer<SlashMenuHandle, Props> | null = null;
          let menu: ReturnType<typeof floatMenu> | null = null;

          const close = () => {
            menu?.destroy();
            menu = null;
            renderer?.element.remove();
            renderer?.destroy();
            renderer = null;
          };

          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashMenu, { props, editor: props.editor });
              const element = renderer.element as HTMLElement;
              element.style.position = "fixed";
              element.style.zIndex = "50";
              document.body.appendChild(element);
              menu = floatMenu(element, props.editor.view.dom);
              menu.update(props.clientRect);
            },
            onUpdate: (props) => {
              if (!renderer) return;
              renderer.updateProps(props);
              menu?.update(props.clientRect);
            },
            onKeyDown: ({ event }) => {
              if (event.key === "Escape") {
                close();
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
