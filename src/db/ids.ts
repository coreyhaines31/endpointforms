import { customAlphabet } from "nanoid";
import { uuidv7 } from "uuidv7";

/**
 * Two kinds of identifier, deliberately.
 *
 * `id` — a UUIDv7 primary key. Time-ordered, so inserts land at the right-hand
 * edge of the b-tree instead of scattering across it the way UUIDv4 does. It is
 * internal and never appears in a URL.
 *
 * `publicId` — a short nanoid, generated separately. It is what shows up in
 * `<form action="https://.../e/{publicId}">` and in the inbox URL. Keeping it
 * distinct from the primary key means a leaked public ID reveals nothing about
 * row ordering or volume, and we can rotate one without touching foreign keys.
 */
export const newId = uuidv7;

// nanoid's default alphabet (A-Za-z0-9_-) is URL-safe and needs no escaping in
// a form action. These are copy-pasted, never typed, so lookalike characters
// are not a concern and we keep the full 64-symbol entropy.
const nano = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_",
);

/** Public endpoint ID. 12 chars ≈ 72 bits — unguessable, still short enough to read aloud. */
export const newEndpointPublicId = () => nano(12);

/** Public submission ID. 16 chars; these are handed to a customer's CRM for outcome matching (#43). */
export const newSubmissionPublicId = () => nano(16);
