import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import SlashMenu, { filterSlashItems, type SlashItem, type SlashMenuHandle } from "./slash-menu";

type Props = SuggestionProps<SlashItem, SlashItem>;

/** Lets other key handlers stand aside while the menu is open. */
export const slashKey = new PluginKey<{ active?: boolean }>("slashCommand");

/** Hangs a suggestion menu below the text being typed, kept on screen. */
export function placeMenu(element: HTMLElement, props: Pick<SuggestionProps<unknown>, "clientRect">) {
  const rect = props.clientRect?.();
  if (!rect) return;
  computePosition({ getBoundingClientRect: () => rect }, element, {
    placement: "bottom-start",
    strategy: "fixed",
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
  }).then(({ x, y }) => {
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
  });
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
        // Not inside code, where "/" is just a character.
        allow: ({ state }) => !state.selection.$from.parent.type.spec.code,
        items: ({ query }) => filterSlashItems(query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          let renderer: ReactRenderer<SlashMenuHandle, Props> | null = null;

          const close = () => {
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
              placeMenu(element, props);
            },
            onUpdate: (props) => {
              if (!renderer) return;
              renderer.updateProps(props);
              placeMenu(renderer.element as HTMLElement, props);
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
