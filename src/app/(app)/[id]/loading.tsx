import { PageSkeleton } from "../../_components/loading-skeletons";

// Without this boundary Next keeps the old page on screen until the new one has loaded
// from the database, which reads as a freeze. It also lets <Link> prefetch this shell.
export default function Loading() {
  return <PageSkeleton />;
}
