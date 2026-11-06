import { requireSession } from "@/lib/auth";
import { listConnections } from "@/lib/oauth";
import AppsView from "../../_components/apps-view";

export const dynamic = "force-dynamic";

export default async function ConnectedAppsPage() {
  await requireSession();
  const connections = await listConnections();
  return <AppsView connections={connections} />;
}
