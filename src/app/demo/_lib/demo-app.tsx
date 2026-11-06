"use client";

import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BackendProvider } from "../../_components/backend";
import { NotesProvider } from "../../_components/notes-provider";
import NotesShell from "../../_components/notes-shell";
import { createDemoBackend, DEMO_BASE, getTree, loadDemo, subscribe } from "./demo-store";

/**
 * The demo workspace: the real shell and views over the in-browser store. Pages live in
 * localStorage, which only exists in the browser, so nothing renders until it's read.
 * Every demo route is a static file; the open page comes from `?page=`.
 */
export default function DemoApp({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void loadDemo().then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  // Blank while loading (a few milliseconds; the first visit also writes the samples).
  const blank = <div className="h-dvh bg-background" aria-busy="true" />;
  if (!ready) return blank;
  return (
    <Suspense fallback={blank}>
      <DemoWorkspace>{children}</DemoWorkspace>
    </Suspense>
  );
}

function DemoWorkspace({ children }: { children: React.ReactNode }) {
  const backend = useMemo(() => createDemoBackend(), []);
  const tree = useSyncExternalStore(subscribe, getTree, getTree);
  const pathname = usePathname();
  const page = useSearchParams().get("page");
  const activeId = pathname === DEMO_BASE ? page : null;
  // Written by the shadcn SidebarProvider, as in the real app.
  const [sidebarOpen] = useState(() => !document.cookie.includes("sidebar_state=false"));

  return (
    <BackendProvider backend={backend}>
      <NotesProvider initialTree={tree} activeId={activeId}>
        <NotesShell sidebarOpen={sidebarOpen}>{children}</NotesShell>
      </NotesProvider>
    </BackendProvider>
  );
}
