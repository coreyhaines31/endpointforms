import { cn } from "@/lib/utils";

/**
 * Chrome for every product mockup on this site.
 *
 * Hard rule, from docs/11-social-content.md §6 and docs/02-messaging.md §9: we
 * never present invented UI or invented numbers as a real screenshot or a real
 * result. This is the brand's whole position — the category reports things that
 * aren't true — so a mockup that pretended would refute the argument it is
 * illustrating. Every frame therefore carries a visible `Illustration` stamp in
 * its chrome AND a caption in words underneath. Neither is optional.
 *
 * A note on `cn()`: it runs twMerge, which classifies our custom size tokens
 * (`text-label`, `text-h3`, `text-display`) as *colours*, so a size token and a
 * colour token in the same call silently loses the size. Anywhere the two meet
 * below, the classes are written as a plain template literal instead. See the
 * comments in src/components/prose.tsx and src/components/tools/readout.tsx.
 */

export function IllustrationTag({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-sm border border-border-control px-2 py-0.5 font-mono text-label uppercase text-muted-foreground ${className ?? ""}`}
    >
      Illustration
    </span>
  );
}

type MockupFrameProps = {
  /** What the surface would be called in the product. */
  title: string;
  /** Optional context on the right of the chrome bar — a range, a form name. */
  meta?: string;
  /** Says, in words, that this is a drawing rather than a screenshot. Required. */
  caption: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function MockupFrame({ title, meta, caption, children, className }: MockupFrameProps) {
  return (
    <figure className={cn("m-0", className)}>
      <div className="border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-5">
          <p className="font-mono text-label uppercase text-foreground">{title}</p>
          <div className="flex flex-wrap items-center gap-3">
            {meta ? (
              <span className="font-mono text-label uppercase text-muted-foreground">{meta}</span>
            ) : null}
            <IllustrationTag />
          </div>
        </div>
        {children}
      </div>
      <figcaption className="mt-3 max-w-[68ch] text-sm text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}

/**
 * The smaller sibling, for mockups that sit in a group under one shared
 * caption — the three panels in the pillars section. Still stamped.
 */
export function MockupPanel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border border-border bg-card", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-2.5">
        <p className="font-mono text-label uppercase text-foreground">{title}</p>
        <IllustrationTag />
      </div>
      {children}
    </div>
  );
}

/** A footnote band inside a frame — the reading, the denominator, the caveat. */
export function MockupBand({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "border-t border-border px-4 py-3 text-sm text-muted-foreground sm:px-5",
        className,
      )}
    >
      {children}
    </p>
  );
}

/**
 * Wide mockups scroll inside themselves. The page body never scrolls sideways
 * (docs/03-brand.md, and the obvious).
 */
export function MockupScroll({
  children,
  label,
  className,
}: {
  children: React.ReactNode;
  /**
   * When set, the container becomes a labelled, keyboard-reachable region.
   * A scrollable box that only a mouse can scroll fails WCAG 2.1.1, so
   * anything that can actually overflow passes a label.
   */
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      {...(label ? { role: "region", "aria-label": label, tabIndex: 0 } : {})}
    >
      {children}
    </div>
  );
}
