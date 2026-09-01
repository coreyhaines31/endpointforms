"use client";

import { useActionState } from "react";

import { idleFormState } from "@/actions/form-state";
import { markNotSpamAction, markSpamAction } from "@/actions/spam";
import { FormMessage, SubmitButton } from "@/components/app/forms";
import type { SpamState } from "@/lib/spam/types";

/**
 * The undo (#31).
 *
 * A false positive has to be reversible by the person who spotted it, on the
 * screen where they spotted it, in one click. Anything further away than that —
 * a settings screen, a support email, a filter someone has to discover — is a
 * heuristic that eats leads in practice however carefully it is documented.
 *
 * The "mark as spam" side exists so the two decisions are symmetrical and so
 * the ruleset can be graded later against what people actually said. It records
 * a judgement and deletes nothing; the button's own hint says so, because a
 * button that looks destructive over a non-destructive act trains people to
 * distrust every label around it.
 */
export function SpamReviewForms({
  slug,
  publicId,
  state,
}: {
  slug: string;
  publicId: string;
  state: SpamState;
}) {
  const [notSpamState, notSpamAction] = useActionState(markNotSpamAction, idleFormState);
  const [spamState, spamAction] = useActionState(markSpamAction, idleFormState);

  const settled = notSpamState.status === "success" ? notSpamState : spamState;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {state !== "not_spam" ? (
          <form action={notSpamAction}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="publicId" value={publicId} />
            <SubmitButton pendingLabel="Unflagging…" variant="quiet">
              This was not spam
            </SubmitButton>
          </form>
        ) : null}

        {state !== "confirmed_spam" ? (
          <form action={spamAction}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="publicId" value={publicId} />
            <SubmitButton pendingLabel="Marking…" variant="quiet">
              Mark as spam
            </SubmitButton>
          </form>
        ) : null}
      </div>

      <p className="mt-3 max-w-[62ch] text-sm text-muted-foreground">
        Neither button deletes anything. “Not spam” is permanent — rescoring will
        never flag this submission again. “Mark as spam” records that you agreed,
        and the submission stays in your inbox, your exports and your counts
        exactly as it is.
      </p>

      <FormMessage state={settled} />
    </div>
  );
}
