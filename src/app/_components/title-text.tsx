"use client";

import { useSyncExternalStore } from "react";
import { toISODate } from "@/lib/dates";
import { titleText } from "@/lib/title-dates";

/** Calls `onChange` just after each midnight, and when the tab comes back into view. */
function subscribeDay(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    timer = setTimeout(() => {
      onChange();
      schedule();
    }, next.getTime() - now.getTime());
  };
  // A laptop that slept through midnight doesn't fire the timer on time.
  const onVisible = () => {
    if (document.visibilityState === "visible") onChange();
  };
  schedule();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/**
 * Today's date in the browser, kept current across midnight; null while rendering on
 * the server and hydrating, where the visitor's clock and time zone aren't known.
 */
export function useNow(): Date | null {
  const day = useSyncExternalStore(
    subscribeDay,
    () => toISODate(new Date()),
    () => null
  );
  return day ? new Date() : null;
}

/** A page title as words, with its dates relative to today ("Standup Today"). */
export function useTitle(title: string): string {
  return titleText(title, useNow());
}

export default function TitleText({ title }: { title: string }) {
  return <>{useTitle(title)}</>;
}
