import Link from "next/link";
import { redirect } from "next/navigation";

import { Container } from "@/components/container";
import { EmptyState, Panel, PanelHeader, RoleChip } from "@/components/app/panel";
import { requireUser } from "@/lib/auth/session";
import { listWorkspacesForUser } from "@/lib/workspaces/queries";

/**
 * `/app` — where a session lands.
 *
 * One workspace is the overwhelmingly common case, so it goes straight there
 * rather than showing a list of one and asking someone to click it.
 */
export default async function AppHomePage() {
  const user = await requireUser();
  const workspaces = await listWorkspacesForUser(user.id);

  if (workspaces.length === 0) redirect("/app/new");
  if (workspaces.length === 1) redirect(`/app/${workspaces[0].slug}`);

  return (
    <Container className="pt-10">
      <p className="font-mono text-label uppercase text-muted-foreground">Workspaces</p>
      <h1 className="mt-4 text-h2">Choose a workspace</h1>

      <Panel className="mt-8">
        <PanelHeader
          title="Your workspaces"
          action={
            <Link
              href="/app/new"
              className="inline-flex h-9 items-center rounded-md border border-border-control px-3 text-sm font-medium text-foreground hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              New workspace
            </Link>
          }
        />
        {workspaces.length === 0 ? (
          <EmptyState title="No workspaces yet." />
        ) : (
          <ul className="divide-y divide-border">
            {workspaces.map((workspace) => (
              <li key={workspace.id}>
                <Link
                  href={`/app/${workspace.slug}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base font-medium text-foreground">
                      {workspace.name}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-sm text-muted-foreground">
                      {workspace.slug}
                    </span>
                  </span>
                  <RoleChip role={workspace.role} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Container>
  );
}
