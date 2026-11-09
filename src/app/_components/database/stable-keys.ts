import { useState } from "react";

/**
 * React keys for things the database knows by a name that can change (a property, an
 * option). A key that is the name itself would remount the item, and close its menu, when
 * the name is edited; a key that is the position would hand one item's open menu and
 * focus to the next when an item goes. Each name gets an id of its own instead, and a
 * rename carries the id over.
 */
export function createStableKeys() {
  const ids = new Map<string, string>();
  let next = 0;
  return {
    keyOf(name: string): string {
      let id = ids.get(name);
      if (!id) {
        id = `k${next++}`;
        ids.set(name, id);
      }
      return id;
    },
    renamed(from: string, to: string) {
      const id = ids.get(from);
      if (!id) return;
      ids.delete(from);
      ids.set(to, id);
    },
  };
}

export const useStableKeys = () => useState(createStableKeys)[0];
