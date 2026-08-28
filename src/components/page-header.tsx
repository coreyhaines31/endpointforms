import { Container } from "@/components/container";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  /** Mono uppercase label. The instrument tell — see docs/03-brand.md §6. */
  eyebrow: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  /** Byline, date, or anything that belongs under the deck. */
  meta?: React.ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, lead, meta, className }: PageHeaderProps) {
  return (
    <Container className={cn("pt-[clamp(3rem,7vw,5rem)]", className)}>
      <p className="font-mono text-label uppercase text-muted-foreground">{eyebrow}</p>
      <h1 className="mt-6 max-w-[24ch] text-display sm:text-display-xl">{title}</h1>
      {lead ? (
        <p className="mt-7 max-w-[62ch] text-lead text-muted-foreground">{lead}</p>
      ) : null}
      {meta ? <div className="mt-8">{meta}</div> : null}
    </Container>
  );
}
