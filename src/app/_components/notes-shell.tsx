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
  sidebarWidth,
  children,
}: {
  /** The folded state remembered in the sidebar cookie. */
  sidebarOpen: boolean;
  /** The desktop width in px remembered in the sidebar_width cookie. */
  sidebarWidth?: number;
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
    <SidebarProvider defaultOpen={sidebarOpen} defaultWidth={sidebarWidth} className="h-dvh overflow-hidden">
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
      {/* First stop for the keyboard: past the page tree, straight to the page title. */}
      <a
        href="#main"
        onClick={(event) => {
          const title = document.querySelector<HTMLElement>("#main [aria-label='Page title']");
          if (!title) return;
          event.preventDefault();
          title.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-2 focus:z-50 focus:rounded-md focus:border focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
      >
        Skip to page
      </a>
      <Sidebar />
      {/* The main column scrolls on its own, so the sidebar and top bar stay put. Its
          scrollbar's room is kept even on short pages, so the page column doesn't shift
          sideways when you move between a short page and a long one. */}
      <SidebarInset
        id="main"
        tabIndex={-1}
        className="min-h-0 min-w-0 overflow-y-auto outline-none [scrollbar-gutter:stable]"
      >
        {children}
      </SidebarInset>
    </ShellContext.Provider>
  );
}
