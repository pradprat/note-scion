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
      <div className="w-full max-w-xs">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Notes</h1>
        <LoginForm next={next ?? "/"} error={error} />
      </div>
    </main>
  );
}
