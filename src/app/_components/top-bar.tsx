"use client";

import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEPLOY_URL } from "@/lib/links";
import { Button } from "@/components/ui/button";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useBackend } from "./backend";
import { useShell } from "./notes-shell";

/**
 * The strip above every workspace view: the sidebar trigger (always on mobile, where the
 * sidebar is a sheet; on desktop only once the sidebar is folded), the breadcrumb, and an
 * end slot. In the demo it ends with the way to a copy of your own, on every view and on
 * phones too, where the sidebar is closed.
 */
export default function TopBar({ children, end }: { children?: React.ReactNode; end?: React.ReactNode }) {
  const { state } = useSidebar();
  const { modKey } = useShell();
  const { demo } = useBackend();
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
      {demo && (
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-mr-1 h-8 shrink-0 gap-1 px-2 [@media(pointer:coarse)]:h-10 [&_svg]:size-3.5 [&_svg]:text-muted-foreground"
        >
          <a href={DEPLOY_URL} target="_blank" rel="noopener noreferrer">
            {/* "Deploy" on phones, where the breadcrumb needs the room. */}
            Deploy<span className="hidden sm:inline"> your own</span>
            <ArrowUpRight aria-hidden />
            <span className="sr-only">(opens GitHub)</span>
          </a>
        </Button>
      )}
    </div>
  );
}
