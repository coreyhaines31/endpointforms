import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { SpamChip } from "@/components/app/spam-chip";
import { SpamReviewForms } from "@/components/app/spam-review";
import { DataTable, Td, Th } from "@/components/app/table";
import type { SpamReason, SpamState } from "@/lib/spam/types";

/**
 * "Why was this flagged?" (#31).
 *
 * The panel exists because a spam score a customer cannot take apart is the
 * dishonest dashboard this product is positioned against, with our logo on it.
 * So it shows the whole arithmetic: every signal that was consulted — including
 * the ones that scored nothing — what was observed, which fields it fired on,
 * and how much it moved the total.
 *
 * Modelled on the Origin panel next to it on purpose. Someone who has learned
 * to read one has learned to read the other, and the two axes staying visually
 * parallel is what stops them being confused for each other.
 *
 * Rendered for every submission, not only flagged ones. A reader who can only
 * see the arithmetic when it went against them cannot calibrate how much to
 * trust it when it did not.
 */
export function SpamPanel({
  slug,
  publicId,
  state,
  score,
  reasons,
}: {
  slug: string;
  publicId: string;
  state: SpamState;
  score: number;
  reasons: SpamReason[];
}) {
  const summary = reasons.find((reason) => reason.code === "threshold");
  const signals = reasons.filter((reason) => reason.code !== "threshold");
  const fired = signals.filter((reason) => reason.weight !== 0);
  const reviewed = state === "not_spam" || state === "confirmed_spam";

  return (
    <Panel className="mt-6">
      <PanelHeader
        title={
          state === "flagged"
            ? "Why this is flagged"
            : state === "not_spam"
              ? "You said this was not spam"
              : state === "confirmed_spam"
                ? "You marked this as spam"
                : "Spam signals"
        }
        description="Spam is scored on its own axis, separate from the Human / Agent / Unverified stamp above — a person can send junk and an agent can send a real lead. Nothing here has ever removed a submission."
        action={<SpamChip state={state} score={score} />}
      />

      {/* The overrule goes first, because from here on the reader is looking at
          a record rather than a decision. Without this, the stored summary below
          — which still says "so this is flagged", because that is what happened
          when it arrived — contradicts the heading above it. */}
      {reviewed ? (
        <PanelBody className="border-b border-border">
          <p className="max-w-[68ch] text-base text-foreground">
            {state === "not_spam"
              ? "Someone here read this and said it was not spam. That is permanent: rescoring will never flag it again."
              : "Someone here read this and confirmed it was spam. The submission is kept regardless — this records the judgement, it does not remove anything."}
          </p>
          <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">
            Everything below is what the score said when the submission arrived,
            left exactly as it was. The arithmetic that got it wrong is the only
            record of why anyone had to step in.
          </p>
        </PanelBody>
      ) : null}

      {summary ? (
        <PanelBody className="border-b border-border">
          {reviewed ? (
            <p className="mb-2 font-mono text-label uppercase text-muted-foreground">
              What the score said at the time
            </p>
          ) : null}
          <p className="max-w-[68ch] text-base text-foreground">{summary.note}</p>
          <p className="mt-2 font-mono text-sm text-muted-foreground">{summary.observed}</p>
        </PanelBody>
      ) : null}

      {signals.length === 0 ? (
        <EmptyState title="No spam signals were recorded for this submission.">
          It arrived before spam scoring existed, or through a path that does not
          score. Nothing about it was hidden or held back.
        </EmptyState>
      ) : (
        <DataTable
          caption="Every spam signal that was consulted: what was observed, which fields it looked at, and how much weight it carried."
          scrollLabel="Spam signals"
          tableClassName="min-w-[46rem]"
        >
          <thead>
            <tr>
              <Th>Signal</Th>
              <Th>Observed</Th>
              <Th>Fields</Th>
              <Th numeric>Weight</Th>
            </tr>
          </thead>
          <tbody className="[&>tr:last-child>td]:border-b-0">
            {signals.map((reason, index) => (
              <tr key={`${reason.rule}-${index}`}>
                <Td className="align-top font-mono">{reason.rule}</Td>
                <Td className="align-top">
                  <span className="font-mono">{reason.observed}</span>
                  <span className="mt-1 block max-w-[52ch] text-sm text-muted-foreground">
                    {reason.note}
                  </span>
                </Td>
                <Td dim className="align-top">
                  {reason.fields && reason.fields.length > 0 ? (
                    <span className="font-mono">{reason.fields.join(", ")}</span>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td numeric className="align-top">
                  {reason.weight > 0 ? `+${reason.weight}` : reason.weight}
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <PanelBody className="border-t border-border">
        <p className="max-w-[68ch] text-sm text-muted-foreground">
          {fired.length === 0
            ? "Nothing scored against this submission. Worth knowing what that does and does not mean: a score of zero says none of our signals fired, not that a person sent it."
            : `${fired.length} signal${fired.length === 1 ? "" : "s"} scored. Every one of them can be got past by someone who is trying — the point of showing you the arithmetic is that you can disagree with it${reviewed ? ", which is what happened here" : ""}.`}
        </p>
        <div className="mt-4">
          <SpamReviewForms slug={slug} publicId={publicId} state={state} />
        </div>
      </PanelBody>
    </Panel>
  );
}
