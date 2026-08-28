import { MockupBand, MockupFrame, MockupScroll } from "@/components/mockup/frame";

/**
 * /features/agent-forms — one definition, two surfaces.
 *
 * Left: what a person sees. Right: what software sees. The fields are named
 * identically on both sides on purpose — that is the entire claim.
 *
 * The left-hand form is drawn, not built: no <form>, no <input>, nothing
 * focusable. A mockup that could take keyboard focus would be a trap.
 */

const fields = [
  { label: "Work email", placeholder: "you@company.com", required: true },
  { label: "Company", placeholder: "Northgate", required: true },
  { label: "Monthly ad spend", placeholder: "$5k – $25k", required: false, select: true },
  { label: "What are you trying to fix?", placeholder: "", required: false, area: true },
];

const manifest = `{
  "name": "demo_request",
  "description": "Request a demo of Endpoint Forms.",
  "input_schema": {
    "type": "object",
    "required": ["work_email", "company"],
    "properties": {
      "work_email": { "type": "string", "format": "email" },
      "company":    { "type": "string", "maxLength": 120 },
      "ad_spend":   { "enum": ["<5k", "5k-25k", "25k+"] },
      "problem":    { "type": "string" }
    }
  }
}`;

const response = `{
  "status": "accepted",
  "submission_id": "sub_8f21",
  "origin": "agent"
}`;

export function ManifestPair() {
  return (
    <MockupFrame
      title="One definition · two surfaces"
      meta="Demo request form"
      caption="Illustration of the two surfaces a single form definition publishes. Endpoint Forms is pre-launch — the tool definition here is drawn to show the shape of the contract, not copied from a running form."
    >
      <div className="grid grid-cols-1 lg:grid-cols-2">
        <section className="min-w-0 border-b border-border p-5 lg:border-b-0 lg:border-r sm:p-6">
          <h3 className="font-mono text-label uppercase text-muted-foreground">
            What a person sees
          </h3>
          <div className="mt-5 flex flex-col gap-4">
            {fields.map((field) => (
              <div key={field.label}>
                <p className="text-sm text-foreground">
                  {field.label}
                  {field.required ? (
                    <span className="text-muted-foreground"> · required</span>
                  ) : null}
                </p>
                <div
                  className={`mt-1.5 flex justify-between gap-2 rounded-md border border-input px-3 text-sm text-muted-foreground ${field.area ? "h-16 items-start pt-2" : "h-10 items-center"}`}
                >
                  <span>{field.placeholder}</span>
                  {field.select ? (
                    <span aria-hidden="true" className="font-mono text-muted-foreground">
                      ▾
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
            <span className="signal-fill inline-flex h-10 w-fit items-center rounded-md px-4 text-sm font-medium">
              Request a demo
            </span>
          </div>
        </section>

        <section className="min-w-0 p-5 sm:p-6">
          <h3 className="font-mono text-label uppercase text-muted-foreground">
            What software sees
          </h3>
          <MockupScroll label="Tool definition" className="mt-5 border border-border bg-sunken">
            <pre className="p-4 font-mono text-xs text-foreground">
              <code>{manifest}</code>
            </pre>
          </MockupScroll>
          <p className="mt-5 font-mono text-label uppercase text-muted-foreground">
            And what it gets back
          </p>
          <MockupScroll label="Response to an agent submission" className="mt-2 border border-border bg-sunken">
            <pre className="p-4 font-mono text-xs text-foreground">
              <code>{response}</code>
            </pre>
          </MockupScroll>
        </section>
      </div>
      <MockupBand>
        Same fields, same required rules, same validation &mdash; because both sides are
        generated from the one definition, there is no second place for them to drift apart.
        The agent gets a structured answer instead of a re-rendered page with a red border.
      </MockupBand>
    </MockupFrame>
  );
}
