import { CopyBlock } from "@/components/app/copy";

/**
 * The snippet.
 *
 * This is the headline element of the endpoint screen and, arguably, of the
 * product: an endpoint works with **no schema at all**, so the entire setup is
 * changing one attribute on a form that already exists. The screen should look
 * like that is the whole job, because it is.
 *
 * Both forms are given, always. Half the audience will paste the HTML into a
 * page; the other half will test with curl before they trust it with a page, and
 * making them work the URL out from the `action` attribute is a small insult to
 * the more careful half.
 */

export function endpointUrl(slug: string, renderDomain: string, publicId: string): string {
  return `https://${slug}.${renderDomain}/e/${publicId}`;
}

export function EndpointSnippet({
  slug,
  renderDomain,
  publicId,
  archived = false,
}: {
  slug: string;
  renderDomain: string;
  publicId: string;
  archived?: boolean;
}) {
  const url = endpointUrl(slug, renderDomain, publicId);

  const html = [
    `<form action="${url}" method="POST">`,
    `  <input type="email" name="email" required>`,
    `  <textarea name="message"></textarea>`,
    `  <button type="submit">Send</button>`,
    `</form>`,
  ].join("\n");

  const curl = [
    `curl -X POST ${url} \\`,
    `  -d "email=you@example.com" \\`,
    `  -d "message=Testing the endpoint"`,
  ].join("\n");

  const tokenSnippet = [
    `<input type="hidden" name="_origin_token">`,
    `<script>`,
    `  fetch("${url}/token")`,
    `    .then((r) => r.json())`,
    `    .then(({ token }) => {`,
    `      document.querySelector('[name="_origin_token"]').value = token;`,
    `    })`,
    `    .catch(() => {});`,
    `</script>`,
  ].join("\n");

  return (
    <div className="grid gap-8">
      {archived ? (
        <p className="rounded-md border border-bot-edge bg-bot-surface px-4 py-3 text-sm text-bot">
          This endpoint is archived, so it is refusing submissions with a 410. The
          snippet below is kept so you can see what was on your page — restore the
          endpoint before pointing anything at it again.
        </p>
      ) : null}

      <CopyBlock
        label="Paste into your page"
        code={html}
        description="Change the action on a form you already have, or paste this one. No schema, no script, no field list to declare first — whatever the form posts is what arrives."
      />

      <CopyBlock
        label="Or test it with curl"
        code={curl}
        description="A submission from this lands in the inbox stamped Unverified, because a request with no browser behind it is exactly what that stamp is for."
      />

      <details className="group">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-sm text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <svg
            viewBox="0 0 12 12"
            className="size-3 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
            aria-hidden="true"
          >
            <path d="M4.5 2 8.5 6 4.5 10" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          Optional: help the Human stamp
        </summary>

        <div className="mt-4">
          <CopyBlock
            label="Origin token"
            code={tokenSnippet}
            description="A page that echoes this token back proves a real page load happened shortly before the submission. It is corroboration, never a requirement — if the fetch fails the form still submits and the submission is still accepted."
          />
        </div>
      </details>
    </div>
  );
}
