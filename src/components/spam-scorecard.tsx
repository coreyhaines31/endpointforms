import type { Friction, Rating, Scorecard } from "@/lib/spam-methods";
import { cn } from "@/lib/utils";

/**
 * Shape and word together, never colour alone — docs/03-brand.md §8.
 * The glyph is decorative; the word is the value.
 */
const RATING = {
  yes: { glyph: "●", label: "Yes", tone: "text-foreground" },
  partial: { glyph: "◐", label: "Partly", tone: "text-foreground" },
  no: { glyph: "○", label: "No", tone: "text-muted-foreground" },
} as const satisfies Record<Rating, { glyph: string; label: string; tone: string }>;

const FRICTION = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
} as const satisfies Record<Friction, string>;

export function RatingCell({ value }: { value: Rating }) {
  const { glyph, label, tone } = RATING[value];
  return (
    <span className={cn("inline-flex items-center gap-2 font-mono text-label uppercase", tone)}>
      <span aria-hidden="true">{glyph}</span>
      {label}
    </span>
  );
}

export function FrictionCell({ value }: { value: Friction }) {
  return (
    <span
      className={cn(
        "font-mono text-label uppercase",
        value === "none" || value === "low"
          ? "text-muted-foreground"
          : "text-foreground",
      )}
    >
      {FRICTION[value]}
    </span>
  );
}

export const SCORECARD_ROWS = [
  {
    key: "naiveBots",
    label: "Scripted bots",
    detail: "Mass submitters that never render your page.",
  },
  {
    key: "targetedBots",
    label: "Targeted automation",
    detail: "Headless browsers, solver services, residential proxies — aimed at you.",
  },
  {
    key: "humanFarms",
    label: "Paid humans",
    detail: "People doing it by hand, cheaply.",
  },
  {
    key: "tireKickers",
    label: "Real people, bad leads",
    detail: "Genuine humans who were never going to buy.",
  },
] as const satisfies readonly {
  key: keyof Omit<Scorecard, "friction">;
  label: string;
  detail: string;
}[];

/** The vertical, per-method version used on a teardown page. */
export function MethodScorecard({ scorecard }: { scorecard: Scorecard }) {
  return (
    <div className="border-t border-border">
      <h2 className="sr-only">What it stops</h2>
      <dl className="grid grid-cols-1">
        {SCORECARD_ROWS.map((row) => (
          <div
            key={row.key}
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border py-4"
          >
            <dt className="text-base text-foreground">
              {row.label}
              <span className="mt-1 block max-w-[42ch] text-sm text-muted-foreground">
                {row.detail}
              </span>
            </dt>
            <dd>
              <RatingCell value={scorecard[row.key]} />
            </dd>
          </div>
        ))}
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border py-4">
          <dt className="text-base text-foreground">
            Cost to the real buyer
            <span className="mt-1 block max-w-[42ch] text-sm text-muted-foreground">
              What it asks of the person you actually wanted.
            </span>
          </dt>
          <dd>
            <FrictionCell value={scorecard.friction} />
          </dd>
        </div>
      </dl>
    </div>
  );
}
