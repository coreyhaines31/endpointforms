/**
 * The database surface for application code.
 *
 * `unsafeDb` is deliberately not re-exported here. Reads and writes against a
 * workspace-scoped table go through `withWorkspace`; see `./scoped` for why.
 */
export * from "./schema.ts";
export { withWorkspace, type WorkspaceScope } from "./scoped.ts";
export { newId, newEndpointPublicId, newSubmissionPublicId } from "./ids.ts";
