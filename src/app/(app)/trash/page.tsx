import { requireSession } from "@/lib/auth";
import { listTrash, TRASH_DAYS } from "@/lib/db";
import TrashView from "../../_components/trash-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trash" };

export default async function TrashPage() {
  await requireSession();
  const items = await listTrash();
  return <TrashView items={items} days={TRASH_DAYS} />;
}
