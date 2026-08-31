// Kept out of the "use server" modules: those files may only export async
// functions, so the state shape their `useActionState` callers need lives here.

export type FormState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const idleFormState: FormState = { status: "idle", message: "" };

/**
 * An invitation's state carries the link itself.
 *
 * There is no mail transport yet (#41), and a screen that says "invitation sent"
 * when nothing was sent is the exact dishonesty this product is named against.
 * So the inviter is handed the link to pass on. It is shown once — only the
 * hash is stored — which the UI has to say out loud.
 */
export type InviteState = FormState & { inviteUrl?: string };

export const idleInviteState: InviteState = { status: "idle", message: "" };

export function formError(message: string): FormState {
  return { status: "error", message };
}

export function formSuccess(message: string): FormState {
  return { status: "success", message };
}

/**
 * Where to send someone after signing in.
 *
 * Only same-site absolute paths. A `next` parameter that anyone can set is an
 * open redirect the moment it is allowed to name a host, and a sign-in page is
 * the most credible place in the product from which to bounce someone at a
 * phishing page. `//evil.example` is a protocol-relative URL, which is why the
 * second character is checked too.
 */
export function safeNextPath(value: unknown, fallback = "/app"): string {
  const next = typeof value === "string" ? value : "";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
