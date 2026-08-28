/**
 * The block vocabulary the Tier 0.5 content sets are written in.
 *
 * Pages in `/glossary` and `/spam` render from typed data modules rather than
 * hand-written JSX (docs/09 §5 — 37 near-identical page files is exactly how a
 * page set drifts into slop). These are the only shapes a content module may
 * emit, which keeps the writing honest: there is nowhere to hide a layout trick
 * in place of a sentence.
 *
 * `text` supports two inline markers, parsed in `@/components/content-blocks`:
 *   [label](/path)  → an internal or external link
 *   *emphasis*      → <em>
 */

export type Block =
  | { kind: "p"; text: string }
  /** Bulleted. Each item takes the same inline markers as a paragraph. */
  | { kind: "list"; items: string[] }
  /**
   * A verbatim customer quote. `attribution` is mandatory and must carry the
   * handle, the venue, and the month — docs/09 §Accuracy contract.
   */
  | { kind: "quote"; text: string; attribution: string }
  /** A short aside set apart from the argument. Use sparingly. */
  | { kind: "note"; label: string; text: string };

/** Every block's plain text, markers stripped. Used by the link-integrity test. */
export function blockText(block: Block): string {
  switch (block.kind) {
    case "p":
      return block.text;
    case "list":
      return block.items.join(" ");
    case "quote":
      return `${block.text} ${block.attribution}`;
    case "note":
      return `${block.label} ${block.text}`;
  }
}

/** Every internal href referenced from inline markers in a set of blocks. */
export function blockLinks(blocks: Block[]): string[] {
  const found: string[] = [];
  const pattern = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const block of blocks) {
    const text = blockText(block);
    for (const match of text.matchAll(pattern)) {
      found.push(match[1]);
    }
  }
  return found;
}
