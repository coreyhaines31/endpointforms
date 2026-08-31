import { WorkspaceTabs } from "@/components/app/nav";
import { requireWorkspace } from "@/lib/workspaces/server";

/**
 * Everything under one workspace.
 *
 * The membership check happens here, once per request, and it is the reason a
 * page below can hand a workspace id to `withWorkspace()` at all: the id came
 * from a membership row, not from the URL.
 *
 * "No such workspace" and "not a member of it" both produce the same 404 —
 * anything else confirms to a stranger that `acme` exists, which is a customer
 * list for the asking. Note that a 404 here is a *safety net*, not the boundary:
 * even if this check were wrong, row-level security would still make the other
 * workspace's rows invisible.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);

  return (
    <>
      <WorkspaceTabs slug={workspace.slug} />
      {children}
    </>
  );
}
