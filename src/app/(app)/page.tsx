import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getFirstRootPageId } from "@/lib/db";
import EmptyState from "../_components/empty-state";

export const dynamic = "force-dynamic";

export default async function NotesIndexPage() {
  await requireSession();
  const first = await getFirstRootPageId();
  if (first) redirect(`/${first}`);
  return <EmptyState />;
}
