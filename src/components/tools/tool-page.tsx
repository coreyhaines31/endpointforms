import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { TextLink } from "@/components/text-link";
import { WaitlistForm } from "@/components/waitlist-form";
import { ARGUMENT_PATH } from "@/lib/site";
import { TOOLS, toolPath, type ToolEntry } from "@/lib/tools/registry";

/**
 * The chassis every calculator page sits in.
 *
 * Order is deliberate: the working instrument first, the arithmetic second, what
 * we don't know third. A tool page that explains itself before it does anything
 * is a landing page wearing a calculator.
 */
export function ToolPage({
  tool,
  lead,
  children,
  how,
  sourcing,
  limits,
}: {
  tool: ToolEntry;
  lead: React.ReactNode;
  /** The client calculator. */
  children: React.ReactNode;
  /** Show the arithmetic. Use <Formula>. */
  how: React.ReactNode;
  /** Where the defaults came from, and which of them are guesses. */
  sourcing: React.ReactNode;
  /** What this tool cannot tell you. Every page has one. */
  limits: React.ReactNode;
}) {
  const related = relatedTools(tool);

  return (
    <main className="flex flex-1 flex-col pb-[clamp(4rem,9vw,7rem)]">
      <PageHeader
        eyebrow="Free tool"
        title={tool.title}
        lead={lead}
        meta={
          <p className="max-w-[62ch] border-l border-border-control pl-4 text-sm text-muted-foreground">
            The calculator runs in your browser. None of the numbers you enter
            are sent anywhere, stored, or logged — there is no request to send
            them in. Built by the team behind{" "}
            <TextLink href={ARGUMENT_PATH}>the dishonest dashboard</TextLink>.
          </p>
        }
      />

      <Container className="mt-[clamp(2.5rem,6vw,4rem)]">
        <section
          aria-label="Calculator"
          className="border-t border-border-control pt-[clamp(2rem,4vw,3rem)]"
        >
          {children}
        </section>
      </Container>

      <Container className="mt-[clamp(3.5rem,7vw,5rem)]">
        <div className="grid grid-cols-1 gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="min-w-0">
            <Section id="how-this-is-calculated" heading="How this is calculated">
              <p className="max-w-[68ch] text-base text-muted-foreground">
                Every figure above comes from the arithmetic below. No weighting,
                no model, no numbers of ours mixed into yours.
              </p>
              <div className="mt-8 flex flex-col gap-6">{how}</div>
            </Section>

            <Section id="about-these-numbers" heading="Where the defaults come from">
              <div className="flex max-w-[68ch] flex-col gap-5 text-base text-muted-foreground">
                {sourcing}
              </div>
            </Section>

            <Section id="limits" heading="What this cannot tell you">
              <div className="flex max-w-[68ch] flex-col gap-5 text-base text-muted-foreground">
                {limits}
              </div>
            </Section>
          </div>

          <aside className="min-w-0 lg:pt-2">
            <p className="font-mono text-label uppercase text-muted-foreground">
              Other tools
            </p>
            <ul className="mt-5 flex flex-col border-t border-border">
              {related.map((entry) => (
                <li key={entry.slug} className="border-b border-border py-4">
                  <TextLink href={toolPath(entry.slug)} className="text-base font-medium">
                    {entry.name}
                  </TextLink>
                  <p className="mt-2 text-sm text-muted-foreground">{entry.question}</p>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-muted-foreground">
              <TextLink href="/tools">All eight tools</TextLink>
            </p>
          </aside>
        </div>
      </Container>

      <Container className="mt-[clamp(4rem,9vw,6rem)]">
        <div className="border-t border-border pt-[clamp(2.5rem,5vw,3.5rem)]">
          <p className="font-mono text-label uppercase text-muted-foreground">
            Why we built this
          </p>
          <h2 className="mt-5 max-w-[24ch] text-h3 sm:text-h2">
            Every number on this page is one your form builder could have told you
            and didn&rsquo;t.
          </h2>
          <p className="mt-6 max-w-[62ch] text-base text-foreground">
            Endpoint Forms is an open-source form builder for marketers: forms
            built to convert, data that goes wherever you need it, and every
            submission carrying what it turned out to be worth. It is not shipped
            yet. The waitlist is where we tell you when it is.
          </p>
          {/* The eight calculators are eight form placements (#24). The signup
              carries which one it came from — the tool's own slug, never
              anything typed into the calculator above it. */}
          <WaitlistForm className="mt-8" note="Waitlist" tool={tool.slug} />
        </div>
      </Container>
    </main>
  );
}

function Section({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-20 border-t border-border pt-[clamp(2rem,4vw,2.5rem)] [&+&]:mt-[clamp(2.5rem,5vw,3.5rem)]"
    >
      <h2 className="text-h3">{heading}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** One line of the arithmetic, written out. */
export function Formula({
  label,
  expr,
  note,
}: {
  label: string;
  expr: string;
  note?: React.ReactNode;
}) {
  return (
    <div>
      <p className="font-mono text-label uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 overflow-x-auto whitespace-pre font-mono text-sm text-foreground">
        {expr}
      </p>
      {note ? (
        <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">{note}</p>
      ) : null}
    </div>
  );
}

/** Same group first, then whatever else is nearest. Always three. */
function relatedTools(tool: ToolEntry): ToolEntry[] {
  const others = TOOLS.filter((entry) => entry.slug !== tool.slug);
  const sameGroup = others.filter((entry) => entry.group === tool.group);
  const rest = others.filter((entry) => entry.group !== tool.group);
  return [...sameGroup, ...rest].slice(0, 3);
}
