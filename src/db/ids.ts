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

/**
 * Public ID for a partial capture (#37). 16 chars, matching a submission's:
 * they show up in the same inbox and get read aloud in the same conversations.
 */
export const newPartialPublicId = () => nano(16);

/**
 * The visible half of an outcome API key (#57): `efv2.<this>.<secret>`.
 *
 * 12 chars, matching an endpoint's, because it is the same kind of thing — a
 * handle that is unguessable but not itself a credential. It is what the
 * settings page shows to tell two keys apart after the secret half has been
 * displayed once and can never be shown again.
 */
export const newVerdictKeyPublicId = () => nano(12);

/**
 * Public ID for an uploaded file (#66). 16 chars, matching a submission's.
 *
 * Unguessable, but **not itself the credential** — a download needs this id
 * *and* a signature over it and an expiry (`src/lib/uploads/links.ts`). Sizing
 * it like a submission id rather than like a partial key is therefore right:
 * guessing one gets you nothing on its own.
 */
export const newFilePublicId = () => nano(16);

/**
 * The token a visitor's form carries between screens (#37).
 *
 * Longer than a public ID, deliberately. This one is not merely unguessable in
 * the usual sense — guessing one lets somebody overwrite a stranger's
 * in-progress answers, so it is sized for that rather than for being read out.
 * 24 characters of the 64-symbol alphabet is 144 bits.
 */
export const newPartialKey = () => nano(24);
