"use client";

import { cn } from "@/lib/utils";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useShell } from "./notes-shell";

/**
 * The strip above every workspace view: the sidebar trigger (always on mobile, where the
 * sidebar is a sheet; on desktop only once the sidebar is folded), the breadcrumb, and an
 * end slot.
 */
export default function TopBar({ children, end }: { children?: React.ReactNode; end?: React.ReactNode }) {
  const { state } = useSidebar();
  const { modKey } = useShell();
  const hint = modKey ? ` (${modKey}+\\)` : "";

  return (
    <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 bg-background px-3 sm:px-4">
      <SidebarTrigger
        aria-label="Show sidebar"
        title={`Show sidebar${hint}`}
        className={cn(
          "-ml-1 shrink-0 text-muted-foreground [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10",
          state === "expanded" && "md:hidden"
        )}
      />
      <div className="min-w-0 flex-1">{children}</div>
      {end && <div className="flex shrink-0 items-center gap-2">{end}</div>}
    </div>
  );
}
