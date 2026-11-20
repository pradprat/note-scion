import { redirect } from "next/navigation";
import { hasSession } from "@/lib/auth";
import { safeNext } from "@/lib/origin";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function NotesLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  // Already logged in: carry on to wherever the login was for (e.g. an OAuth consent).
  if (await hasSession()) redirect(safeNext(next));

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-xs -translate-y-[6vh]">
        <p className="mb-1 text-sm font-medium text-muted-foreground">note-scion</p>
        <h1 className="text-3xl font-bold tracking-tight">Notes</h1>
        <p className="mb-8 mt-2 text-sm text-muted-foreground">A private desk for you and Claude. Sign in to open your pages.</p>
        <LoginForm next={next ?? "/"} error={error} />
      </div>
    </main>
  );
}
