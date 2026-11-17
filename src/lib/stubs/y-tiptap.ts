// Stands in for @tiptap/y-tiptap in the browser bundle (see next.config.js).
//
// @tiptap/extension-drag-handle imports Yjs's editor binding even though it only uses it
// when real-time collaboration is on. note-scion has none, so every call here is the
// "no collaboration" answer: the plugin state is missing and positions don't convert.
// Without this stand-in, Yjs and lib0 (about 110 KB minified) ship with the editor.
import type { PluginKey } from "@tiptap/pm/state";

export const ySyncPluginKey = {
  getState: () => undefined,
} as unknown as PluginKey;

export function absolutePositionToRelativePosition(): null {
  return null;
}

export function relativePositionToAbsolutePosition(): null {
  return null;
}
