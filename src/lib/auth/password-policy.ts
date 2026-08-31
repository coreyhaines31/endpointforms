/**
 * What we refuse to accept as a password.
 *
 * Separate from `./password.ts` — which hashes — and importing **nothing**, so
 * that a Client Component can name `MIN_PASSWORD_LENGTH` in a hint without
 * dragging argon2's native binary into the browser bundle. Same reasoning as
 * `src/lib/workspaces/types.ts` sitting apart from `queries.ts`.
 */

/**
 * The shortest password we accept.
 *
 * Twelve, and **no composition rules**. Requiring a symbol and a digit does not
 * make a password harder to guess; it makes it `Password1!`, because that is
 * what a human does when told to add one of each. Length is the only knob that
 * reliably buys entropy, so it is the only one we turn.
 */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * The longest.
 *
 * argon2's cost does not grow with input length, so this is not a denial-of-
 * service guard so much as a sanity one: a 5 MB "password" is a bug or an
 * attack, never a person.
 */
export const MAX_PASSWORD_LENGTH = 256;

/**
 * Passwords that are long enough and still worthless.
 *
 * Deliberately small. A 100k-entry breach corpus belongs behind a service call,
 * not in the bundle, and the marginal value past the obvious ones is low — the
 * length floor is doing most of the work. Everything here is at least
 * `MIN_PASSWORD_LENGTH` characters, because anything shorter is already refused.
 */
const OBVIOUS_PASSWORDS = new Set([
  "123456789012",
  "1234567890123",
  "12345678901234",
  "123456789012345",
  "1234567890abc",
  "abc123456789",
  "administrator",
  "adminadminadmin",
  "baseball12345",
  "changeme1234",
  "dragon123456",
  "endpointforms",
  "football12345",
  "iloveyou1234",
  "iloveyouiloveyou",
  "letmein12345",
  "letmeinletmein",
  "michael12345",
  "monkey123456",
  "passw0rd1234",
  "password1234",
  "password12345",
  "passwordpassword",
  "princess12345",
  "qwerty123456",
  "qwertyuiop12",
  "qwertyuiopas",
  "starwars1234",
  "sunshine12345",
  "superman1234",
  "trustno1trustno1",
  "welcome12345",
  "welcome123456",
  "whatever1234",
]);

export type PasswordCheck = { ok: true } | { ok: false; message: string };

export const PASSWORD_MESSAGES = {
  empty: "Choose a password.",
  tooShort: `Use at least ${MIN_PASSWORD_LENGTH} characters. Length is what makes a password hard to guess, so there are no other rules.`,
  tooLong: `That password is longer than ${MAX_PASSWORD_LENGTH} characters.`,
  obvious: "That password is one of the first things anyone would try. Pick something else.",
} as const;

/**
 * Whether a password may be used.
 *
 * Length is counted in code points, not UTF-16 units, so an emoji is one
 * character rather than two. Someone using emoji in a passphrase should not be
 * told they typed fewer characters than they did.
 */
export function checkPassword(password: string): PasswordCheck {
  if (password.length === 0) return { ok: false, message: PASSWORD_MESSAGES.empty };

  const length = [...password].length;
  if (length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: PASSWORD_MESSAGES.tooShort };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, message: PASSWORD_MESSAGES.tooLong };
  }
  if (isObvious(password)) {
    return { ok: false, message: PASSWORD_MESSAGES.obvious };
  }

  return { ok: true };
}

function isObvious(password: string): boolean {
  const normalised = password.trim().toLowerCase();
  if (OBVIOUS_PASSWORDS.has(normalised)) return true;

  // One character, over and over. `aaaaaaaaaaaa` clears the length floor and
  // clears no bar at all.
  if (/^(.)\1*$/u.test(normalised)) return true;

  // A straight run up or down the number row or the alphabet.
  if (isSequential(normalised)) return true;

  return false;
}

function isSequential(value: string): boolean {
  if (value.length < MIN_PASSWORD_LENGTH) return false;

  let ascending = true;
  let descending = true;
  for (let i = 1; i < value.length; i++) {
    const step = value.charCodeAt(i) - value.charCodeAt(i - 1);
    if (step !== 1) ascending = false;
    if (step !== -1) descending = false;
    if (!ascending && !descending) return false;
  }
  return ascending || descending;
}
