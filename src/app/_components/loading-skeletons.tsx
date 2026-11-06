import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import TopBar from "./top-bar";

/** A skeleton bar that holds still for people who asked for less motion. */
function Bar({ className }: { className?: string }) {
  return <Skeleton className={cn("motion-reduce:animate-none", className)} />;
}

/**
 * Shown the moment a page is clicked, while the server loads it. Same column, title and
 * line rhythm as <PageView>, so the real page lands without a jump.
 */
export function PageSkeleton() {
  return (
    <>
      <TopBar
        end={
          <>
            <Bar className="h-3 w-10" />
            {/* Where the copy-link button lands. */}
            <span className="h-8 w-8 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10" />
          </>
        }
      >
        <Bar className="h-4 w-40" />
      </TopBar>
      <div role="status" aria-label="Loading page" className="mx-auto w-full max-w-3xl px-6 pt-10 sm:px-16 sm:pt-16">
        <span className="sr-only">Loading page…</span>
        {/* The icon row, then the 4xl title. */}
        <div className="mb-2 h-8" />
        <Bar className="mb-8 h-10 w-2/3" />
        <div className="space-y-3">
          <Bar className="h-4 w-full" />
          <Bar className="h-4 w-11/12" />
          <Bar className="h-4 w-4/5" />
          <Bar className="h-4 w-2/5" />
        </div>
      </div>
    </>
  );
}

/** The other workspace views (Trash, Connected apps): a heading, a line, then rows. */
export function ListSkeleton() {
  return (
    <>
      <TopBar>
        <Bar className="h-4 w-32" />
      </TopBar>
      <div role="status" aria-label="Loading" className="mx-auto w-full max-w-3xl px-6 pt-10 sm:px-16 sm:pt-16">
        <span className="sr-only">Loading…</span>
        <Bar className="mb-3 h-10 w-48" />
        <Bar className="mb-8 h-4 w-3/5" />
        <div className="divide-y border-y">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-3 py-3.5">
              <Bar className="h-5 w-5" />
              <div className="flex-1 space-y-2">
                <Bar className="h-4 w-1/3" />
                <Bar className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
