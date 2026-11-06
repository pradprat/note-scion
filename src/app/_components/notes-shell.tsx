"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { useNotes } from "./notes-provider";
import Sidebar from "./sidebar";
import QuickSwitcher from "./quick-switcher";
import UndoToast from "./undo-toast";

interface ShellContextValue {
  openSwitcher: () => void;
  /** "⌘" on Apple platforms, "Ctrl" elsewhere. Empty until mounted. */
  modKey: string;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell must be used inside <NotesShell>");
  return value;
}

/**
 * The workspace frame: shadcn's sidebar (folds away on desktop with Mod+\, a sheet on
 * mobile), the scrolling main column, the Mod+K switcher and the undo toast.
 */
export default function NotesShell({
  sidebarOpen,
  children,
}: {
  /** The folded state remembered in the sidebar cookie. */
  sidebarOpen: boolean;
  children: React.ReactNode;
}) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [modKey, setModKey] = useState("");
  const showSwitcher = useCallback(() => setSwitcherOpen(true), []);

  useEffect(() => {
    setModKey(/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl");
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // The editor claims Mod+K for links while text is selected and marks it handled.
      if (event.defaultPrevented || event.altKey) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSwitcherOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <SidebarProvider defaultOpen={sidebarOpen} className="h-dvh overflow-hidden">
      <ShellBody openSwitcher={showSwitcher} modKey={modKey}>
        {children}
      </ShellBody>
      <QuickSwitcher open={switcherOpen} onOpenChange={setSwitcherOpen} />
      <UndoToast />
      <Toaster position="bottom-center" />
    </SidebarProvider>
  );
}

function ShellBody({
  openSwitcher: open,
  modKey,
  children,
}: {
  openSwitcher: () => void;
  modKey: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { activeId } = useNotes();
  const { setOpenMobile } = useSidebar();

  // Close the mobile sheet once a page is picked (the demo changes the page, not the path).
  useEffect(() => setOpenMobile(false), [pathname, activeId, setOpenMobile]);

  // The switcher takes over from the mobile sheet rather than stacking on it.
  const openSwitcher = useCallback(() => {
    setOpenMobile(false);
    open();
  }, [open, setOpenMobile]);

  return (
    <ShellContext.Provider value={{ openSwitcher, modKey }}>
      <Sidebar />
      {/* The main column scrolls on its own, so the sidebar and top bar stay put. */}
      <SidebarInset className="min-h-0 min-w-0 overflow-y-auto">{children}</SidebarInset>
    </ShellContext.Provider>
  );
}
