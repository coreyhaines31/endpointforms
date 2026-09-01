import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { CopyBlock } from "@/components/app/copy";

/**
 * What an endpoint with no schema is, said before anyone is asked to build one.
 *
 * ## Why this panel exists at all
 *
 * Every form builder's empty state says "you have no form yet", and here that
 * would be false. The endpoint is live. It is accepting posts from whatever
 * markup is pointed at it, it is stamping each one Human, Agent or Unverified,
 * and it will keep doing that forever without a schema — that is #50, and
 * `docs/21` §"Endpoint-first" is explicit that null is "not a
 * half-configured endpoint". A screen that opens by implying the thing is
 * broken teaches the wrong architecture on the first contact.
 *
 * So this says the true thing first — it works — and then makes the honest
 * offer: here is what declaring a schema adds, and here is what it costs. The
 * three items are not marketing. They are the three surfaces
 * `src/lib/schema/index.ts` names as the reason the format exists.
 */
export function EndpointFirstNote({
  publicId,
  endpointUrl,
}: {
  publicId: string;
  endpointUrl: string;
}) {
  return (
    <Panel>
      <PanelHeader
        title="This endpoint already works"
        description="It has no schema, and that is a finished state rather than a missing step. Anything posted to it is accepted, stored and stamped. Declaring a schema is an upgrade you can take or leave."
      />
      <PanelBody>
        <CopyBlock
          label="Working right now, with no schema"
          code={`<form method="POST" action="${endpointUrl}">`}
          description="Change one attribute on the form you already have. Nothing needs to be declared in advance, and no field has to be described first."
        />

        <div className="mt-6 border-t border-border pt-5">
          <p className="font-mono text-label uppercase text-muted-foreground">
            What declaring one adds
          </p>

          <ul className="mt-3 grid gap-3">
            <Item title="A form we host and render">
              A page at <code className="font-mono">/f/{publicId}</code> built from the
              schema — real markup, no JavaScript required to submit it. Without a
              schema there is no definition to draw a form from, so that page explains
              itself instead.
            </Item>
            <Item title="An agent-callable tool">
              The same definition becomes an MCP tool an agent can call. It is a
              projection of this one document, computed per request, so the tool and
              the page cannot describe different forms. This is also what makes an{" "}
              <span className="text-foreground">Agent</span> stamp structural rather
              than a guess: an agent is identified by which surface it called.
            </Item>
            <Item title="Validation, and typed exports">
              A submission gets read against the schema and annotated with what looked
              wrong. It is <span className="text-foreground">still stored</span> — a
              schema annotates by default and only rejects if you deliberately turn
              that on.
            </Item>
          </ul>

          <p className="mt-5 max-w-[64ch] text-sm text-muted-foreground">
            The cost is that a schema is one more thing to keep true. Nothing here is
            one-way: taking it off puts the endpoint back exactly as it is now, and
            every submission keeps the definition it arrived under either way.
          </p>
        </div>
      </PanelBody>
    </Panel>
  );
}

function Item({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="min-w-0">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-[64ch] text-sm text-muted-foreground">{children}</p>
    </li>
  );
}
