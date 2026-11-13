import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getPage } from "@/lib/db";
import { titleText } from "@/lib/title-dates";
import PageView from "../../_components/page-view";

export const dynamic = "force-dynamic";

/** The tab reads "Notes | <page>"; the page view keeps it current as the title changes. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await requireSession();
  const page = await getPage((await params).id);
  return page ? { title: titleText(page.title, null) } : {};
}

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const page = await getPage(id);
  if (!page) notFound();

  // Keyed so navigating between pages remounts the editor with fresh state.
  return <PageView key={page.id} page={page} />;
}
