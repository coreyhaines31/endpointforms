import { Fragment } from "react";
import type { Block } from "@/lib/content-blocks";
import { TextLink } from "@/components/text-link";
import { cn } from "@/lib/utils";

/**
 * The four inline markers described in `@/lib/content-blocks`, in one pass so
 * that precedence is decided by the alternation order rather than by nesting:
 * link, then **strong**, then *emphasis*, then `code`.
 */
const INLINE =
  /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;

export function Inline({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const match of text.matchAll(INLINE)) {
    const at = match.index;
    if (at > cursor) nodes.push(text.slice(cursor, at));

    const [, label, href, strong, emphasis, code] = match;
    if (href) {
      nodes.push(
        <TextLink key={key++} href={href} external={!href.startsWith("/")}>
          {label}
        </TextLink>,
      );
    } else if (strong) {
      nodes.push(<strong key={key++}>{strong}</strong>);
    } else if (emphasis) {
      nodes.push(<em key={key++}>{emphasis}</em>);
    } else {
      nodes.push(
        <code
          key={key++}
          className="rounded-sm bg-sunken px-1.5 py-0.5 font-mono text-sm"
        >
          {code}
        </code>,
      );
    }
    cursor = at + match[0].length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));

  return (
    <>
      {nodes.map((node, i) => (
        <Fragment key={i}>{node}</Fragment>
      ))}
    </>
  );
}

function BlockNode({ block }: { block: Block }) {
  switch (block.kind) {
    case "p":
      return (
        <p>
          <Inline text={block.text} />
        </p>
      );

    case "list":
      return (
        <ul className="list-disc pl-5 [&>li+li]:mt-2 [&>li]:pl-1">
          {block.items.map((item, i) => (
            <li key={i}>
              <Inline text={item} />
            </li>
          ))}
        </ul>
      );

    case "quote":
      return (
        <figure className="border-l-2 border-foreground pl-5 sm:pl-6">
          <blockquote className="text-base text-foreground">
            “{block.text}”
          </blockquote>
          <figcaption className="mt-3 font-mono text-label uppercase text-muted-foreground">
            {block.attribution}
          </figcaption>
        </figure>
      );

    case "note":
      return (
        <aside className="border border-border bg-card p-5 sm:p-6">
          <p className="font-mono text-label uppercase text-muted-foreground">
            {block.label}
          </p>
          <p className="mt-3 text-base text-foreground">
            <Inline text={block.text} />
          </p>
        </aside>
      );
  }
}

/** Renders a run of blocks with the standard body rhythm. */
export function Blocks({
  blocks,
  className,
}: {
  blocks: Block[];
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col gap-5 text-base text-foreground", className)}
    >
      {blocks.map((block, i) => (
        <BlockNode key={i} block={block} />
      ))}
    </div>
  );
}
