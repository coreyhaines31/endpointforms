"use client";

import { useActionState } from "react";

import { idleFormState } from "@/actions/form-state";
import { preRegisterEffectAction } from "@/actions/split-tests";
import { FormMessage, SubmitButton } from "@/components/app/forms";
import { PanelBody } from "@/components/app/panel";

/**
 * Fixing the effect size before the test runs (#59).
 *
 * Only ever rendered for a draft, because that is the only state in which this
 * can honestly be done: an effect size chosen after seeing which way the
 * numbers went is a finish line drawn where the runner already is. The store
 * refuses it too — this component is the explanation, not the enforcement.
 *
 * Two inputs and a denominator, and none of them can be dropped:
 *
 * - **The improvement worth acting on.** The whole point is that this is a
 *   business decision made in advance, not a number read off the data later.
 * - **The baseline it is relative to.** A relative lift with nothing to be
 *   relative to has no sample size. The field is prefilled with the
 *   workspace's own measured rate where there is one, because a customer
 *   guessing at their own close rate is a worse input than their actual one.
 * - **Which denominator.** Per submission is the default and the one most
 *   people can state about their business. Per visitor is the sharper metric
 *   and is not knowable in advance for a form that has never been served by
 *   us, which is exactly the reason it is not the default.
 */
export function PreRegisterEffectForm({
  slug,
  testPublicId,
  measuredBaselinePct,
}: {
  slug: string;
  testPublicId: string;
  /** The workspace's measured won-per-submission rate, as a percentage. Null when unmeasured. */
  measuredBaselinePct: number | null;
}) {
  const [state, action] = useActionState(preRegisterEffectAction, idleFormState);

  return (
    <PanelBody>
      <form action={action} noValidate className="grid gap-4">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="testPublicId" value={testPublicId} />

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col text-sm font-medium text-foreground">
            Improvement worth acting on
            <div className="mt-2 flex items-center rounded-md border border-border-control bg-card focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
              <input
                name="liftPct"
                type="number"
                min={1}
                max={1000}
                step={1}
                defaultValue={20}
                required
                inputMode="decimal"
                className="h-11 w-full min-w-0 rounded-md bg-transparent px-3 font-mono text-base text-foreground focus-visible:outline-none"
              />
              <span aria-hidden="true" className="pr-3 font-mono text-sm text-muted-foreground">
                %
              </span>
            </div>
          </label>

          <label className="flex flex-col text-sm font-medium text-foreground">
            Your Yield rate now
            <div className="mt-2 flex items-center rounded-md border border-border-control bg-card focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
              <input
                name="baselinePct"
                type="number"
                min={0.01}
                max={99.99}
                step={0.01}
                defaultValue={measuredBaselinePct ?? undefined}
                required
                inputMode="decimal"
                className="h-11 w-full min-w-0 rounded-md bg-transparent px-3 font-mono text-base text-foreground focus-visible:outline-none"
              />
              <span aria-hidden="true" className="pr-3 font-mono text-sm text-muted-foreground">
                %
              </span>
            </div>
          </label>

          <label className="flex flex-col text-sm font-medium text-foreground">
            Measured per
            <select
              name="basis"
              defaultValue="submission"
              className="mt-2 h-11 rounded-md border border-border-control bg-card px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <option value="submission">Submission</option>
              <option value="exposure">Visitor shown the form</option>
            </select>
          </label>
        </div>

        <p className="max-w-[68ch] text-sm text-muted-foreground">
          {measuredBaselinePct === null
            ? "Nothing in this workspace has closed yet, so there is no measured rate to prefill. Use your own figure from the CRM — a guess here makes the sample size a guess too."
            : `Prefilled from this workspace's own last 180 days: ${measuredBaselinePct}% of submissions are marked won. Replace it if you know better.`}{" "}
          Per visitor is the sharper measure and cannot be filled in from
          anything we have yet, because nothing counts views for a form until we
          are the ones serving it.
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton pendingLabel="Registering…">Register this effect</SubmitButton>
          <p className="max-w-[46ch] text-sm text-muted-foreground">
            This cannot be changed afterwards, by you or by us. That is what
            makes it worth anything.
          </p>
        </div>

        <FormMessage state={state} />
      </form>
    </PanelBody>
  );
}
