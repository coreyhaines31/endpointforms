/**
 * A tolerant HTML scanner, written for form markup and nothing else.
 *
 * There is no HTML parser in this project's dependencies and this does not add
 * one. What follows is a tag scanner with a small amount of nesting state —
 * enough to know which `<label>` wraps which `<input>` and which `<option>`
 * belongs to which `<select>`, and deliberately not enough to build a DOM.
 *
 * It is written to **never throw and never refuse**. The input is somebody's
 * production page, pasted or fetched, and it will contain unclosed tags,
 * unquoted attributes, `<br>` where `<br/>` was meant, uppercase tag names,
 * inline scripts containing `<` and framework attributes that are not HTML at
 * all. A parser that rejects that markup is a parser nobody can use on the
 * markup they actually have.
 */

export type Attributes = Record<string, string>;

export type HtmlToken =
  | { kind: "open"; name: string; attrs: Attributes; selfClosing: boolean }
  | { kind: "close"; name: string }
  | { kind: "text"; text: string };

/** Elements whose content is text, not markup, and must not be scanned as tags. */
const RAW_TEXT = new Set(["script", "style"]);

/** Elements that never have a closing tag. */
export const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * A tag.
 *
 * Two details do the heavy lifting on broken markup. Attribute names and
 * unquoted values exclude `<`, and the terminator is `>` **or a lookahead at
 * the next `<`** — so `<input name=a\n<input name=b>`, which is a real thing
 * people ship, yields two inputs rather than one input that swallowed the
 * other. A browser merges them and loses `b`; recovering both is strictly
 * better when the output is a schema someone is about to check.
 */
const TAG =
  /<(\/?)([a-zA-Z][^\s/>]*)((?:\s+[^\s=/><]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s><]*))?)*)\s*(\/?)(?:>|(?=<))/g;

const ATTR = /([^\s=/><]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s><]*)))?/g;

/** Tokenises. Anything that is not a recognisable tag is text. */
export function tokenizeHtml(input: string): HtmlToken[] {
  const source = stripComments(input);
  const tokens: HtmlToken[] = [];

  let cursor = 0;
  let skipUntilClose: string | null = null;

  TAG.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TAG.exec(source)) !== null) {
    const [whole, closing, rawName, rawAttrs, trailingSlash] = match;
    const name = rawName.toLowerCase();

    if (skipUntilClose) {
      // Inside <script> or <style>: only its own closing tag ends it, and the
      // text in between is not markup.
      if (closing === "/" && name === skipUntilClose) {
        skipUntilClose = null;
        cursor = match.index + whole.length;
      }
      continue;
    }

    if (match.index > cursor) {
      const text = source.slice(cursor, match.index);
      if (text.trim() !== "") tokens.push({ kind: "text", text: decodeEntities(text) });
    }
    cursor = match.index + whole.length;

    if (closing === "/") {
      tokens.push({ kind: "close", name });
      continue;
    }

    if (RAW_TEXT.has(name)) {
      skipUntilClose = name;
      continue;
    }

    tokens.push({
      kind: "open",
      name,
      attrs: parseAttributes(rawAttrs ?? ""),
      selfClosing: trailingSlash === "/" || VOID_ELEMENTS.has(name),
    });
  }

  if (cursor < source.length && !skipUntilClose) {
    const text = source.slice(cursor);
    if (text.trim() !== "") tokens.push({ kind: "text", text: decodeEntities(text) });
  }

  return tokens;
}

function stripComments(input: string): string {
  // Doctype and processing instructions go too; neither can contain a form.
  return input.replace(/<!--[\s\S]*?-->/g, " ").replace(/<![^>]*>/g, " ");
}

/**
 * Attribute names are lowercased; values are entity-decoded.
 *
 * A bare attribute (`required`, `multiple`) gets the empty string, so callers
 * test for presence with `!== undefined` rather than for truthiness — `checked`
 * and `checked=""` mean the same thing to a browser and must here too.
 */
export function parseAttributes(source: string): Attributes {
  const attrs: Attributes = Object.create(null) as Attributes;
  ATTR.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ATTR.exec(source)) !== null) {
    const name = match[1].toLowerCase();
    if (name === "" || name === "/") continue;
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (attrs[name] === undefined) attrs[name] = decodeEntities(value);
  }

  return attrs;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  times: "×",
  middot: "·",
  bull: "•",
  reg: "®",
  copy: "©",
  trade: "™",
  deg: "°",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
};

export function decodeEntities(value: string): string {
  if (!value.includes("&")) return value;
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);?/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1] === "x" || body[1] === "X"
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? whole;
  });
}

/** Collapses runs of whitespace, including the newlines indented markup is full of. */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
