"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import EmptyState from "../_components/empty-state";
import { DEMO_BASE, firstRootId, subscribe } from "./_lib/demo-store";

/** Opens the first page, as the real workspace does. */
export default function DemoIndexPage() {
  const router = useRouter();
  const first = useSyncExternalStore(subscribe, firstRootId, firstRootId);

  useEffect(() => {
    if (first) router.replace(`${DEMO_BASE}/${first}`);
  }, [first, router]);

  return first ? null : <EmptyState />;
}
