import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getPage } from "@/lib/db";
import PageView from "../../_components/page-view";

export const dynamic = "force-dynamic";

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const page = await getPage(id);
  if (!page) notFound();

  // Keyed so navigating between pages remounts the editor with fresh state.
  return <PageView key={page.id} page={page} />;
}
