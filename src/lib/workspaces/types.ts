import type { MembershipRole } from "../../db/schema.ts";

/**
 * The shapes the workspace queries return.
 *
 * Separated from `./queries.ts` so a component can name one without importing a
 * module that opens database connections. `eslint.config.mjs` blocks components
 * from importing the query modules at all; this is where the types they still
 * need live.
 */

export type { MembershipRole };

export type WorkspaceSummary = {
  id: string;
  slug: string;
  name: string;
  role: MembershipRole;
};

export type WorkspaceAccess = {
  workspace: { id: string; slug: string; name: string };
  role: MembershipRole;
};

export type Member = {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  role: MembershipRole;
  joinedAt: Date;
};

export type EndpointSummary = {
  id: string;
  publicId: string;
  name: string;
  createdAt: Date;
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: MembershipRole;
  createdAt: Date;
  expiresAt: Date;
  invitedByEmail: string | null;
};

export type InvitationPreview = {
  invitationId: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  email: string;
  role: MembershipRole;
};
