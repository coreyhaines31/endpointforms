import { PageSkeleton } from "@/components/app/skeleton";

/**
 * Every workspace page reads the database before it can render, so without
 * this a click in the sidebar did nothing visible until the whole next page
 * was ready. One boundary here covers every page under the workspace.
 */
export default function WorkspaceLoading() {
  return <PageSkeleton />;
}
