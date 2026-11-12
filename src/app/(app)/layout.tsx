import { cookies } from "next/headers";
import { requireSession } from "@/lib/auth";
import { getTree } from "@/lib/db";
import { SIDEBAR_WIDTH_COOKIE_NAME, parseSidebarWidth } from "@/lib/sidebar-width";
import { ServerBackendProvider } from "../_components/backend";
import { NotesProvider } from "../_components/notes-provider";
import NotesShell from "../_components/notes-shell";

export const dynamic = "force-dynamic";

export default async function NotesAppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  const [tree, cookieStore] = await Promise.all([getTree(), cookies()]);
  // Written by the shadcn SidebarProvider; read here so a folded sidebar renders folded
  // on the first paint instead of flashing open.
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";
  // Same for the width the sidebar was dragged to, so it doesn't jump after hydration.
  const sidebarWidth = parseSidebarWidth(cookieStore.get(SIDEBAR_WIDTH_COOKIE_NAME)?.value);

  return (
    <ServerBackendProvider>
      <NotesProvider initialTree={tree}>
        <NotesShell sidebarOpen={sidebarOpen} sidebarWidth={sidebarWidth}>{children}</NotesShell>
      </NotesProvider>
    </ServerBackendProvider>
  );
}
