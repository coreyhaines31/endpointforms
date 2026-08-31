import { handlers } from "@/auth";

/**
 * Auth.js's own endpoints: sign in, callback, sign out, CSRF, session.
 *
 * `/api` is a reserved root path (docs/05 §4.3) precisely so this can live here
 * without ever colliding with a marketing route.
 */
export const { GET, POST } = handlers;
