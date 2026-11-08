import { useEffect, useRef } from "react";

/**
 * For an inline confirm that replaces the button that opened it: when the confirm closes
 * without its action removing the row, focus goes back to that button rather than
 * falling to the page body.
 */
export function useReturnFocus<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  const was = useRef(open);
  useEffect(() => {
    if (was.current && !open) ref.current?.focus();
    was.current = open;
  }, [open]);
  return ref;
}
