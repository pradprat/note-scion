import { cookies } from "next/headers";
import { requireSession } from "@/lib/auth";
import { getTree } from "@/lib/db";
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

  return (
    <ServerBackendProvider>
      <NotesProvider initialTree={tree}>
        <NotesShell sidebarOpen={sidebarOpen}>{children}</NotesShell>
      </NotesProvider>
    </ServerBackendProvider>
  );
}
