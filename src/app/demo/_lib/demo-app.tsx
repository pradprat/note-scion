"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { BackendProvider } from "../../_components/backend";
import { NotesProvider } from "../../_components/notes-provider";
import NotesShell from "../../_components/notes-shell";
import { createDemoBackend, getTree, loadDemo, subscribe } from "./demo-store";

/**
 * The demo workspace: the real shell and views over the in-browser store. Pages live in
 * localStorage, which only exists in the browser, so nothing renders until it's read.
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
  if (!ready) return <div className="h-dvh bg-background" aria-busy="true" />;
  return <DemoWorkspace>{children}</DemoWorkspace>;
}

function DemoWorkspace({ children }: { children: React.ReactNode }) {
  const backend = useMemo(() => createDemoBackend(), []);
  const tree = useSyncExternalStore(subscribe, getTree, getTree);
  // Written by the shadcn SidebarProvider, as in the real app.
  const [sidebarOpen] = useState(() => !document.cookie.includes("sidebar_state=false"));

  return (
    <BackendProvider backend={backend}>
      <NotesProvider initialTree={tree}>
        <NotesShell sidebarOpen={sidebarOpen}>{children}</NotesShell>
      </NotesProvider>
    </BackendProvider>
  );
}
