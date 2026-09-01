"use client";

import { Plus } from "lucide-react";
import { useActionState, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { saveSchemaAction } from "@/actions/schemas";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { FieldCard } from "./field-card";
import { ImportPanel } from "./import-panel";
import { CheckboxField, IssueLine, QuietButton, TextField } from "./inputs";
import { PreviewPane } from "./preview-pane";
import { RulesInspector } from "./rules-inspector";
import { RulesPanel } from "./rules-panel";
import { VersionsPanel, type VersionSummary } from "./versions-panel";
import {
  draftIssues,
  emptyDraft,
  fromDocument,
  idleSchemaState,
  moveField,
  newDraftField,
  previewDocument,
  toSchemaDocument,
  type DraftDocument,
  type DraftField,
  type ImportCandidate,
} from "./state";
import type { FormSchemaDocument } from "@/lib/schema/format";
import { cn } from "@/lib/utils";

/**
 * The form builder (#35).
 *
 * ## What this screen is, architecturally
 *
 * It is an editor for **one** `FormSchemaDocument` — the same document
 * `import-html.ts` produces from markup, `infer.ts` proposes from traffic, and
 * a committed JSON file declares. That one document drives three surfaces:
 * the hosted human form (`src/lib/render`), the agent-callable tool
 * (`src/lib/manifest/tool.ts`), and validation on raw POSTs
 * (`src/lib/schema/validate.ts`). There is deliberately nothing on this screen
 * that only the builder understands; if there were, the three surfaces would
 * have started to drift on the day it was added.
 *
 * ## Draft and published
 *
 * Editing here cannot change the form a live campaign is pointing at. The
 * editor holds a draft; **Publish** is what moves the endpoint's pointer, and
 * it says what it is about to do. **Save draft** writes the version without
 * pointing at it. Both are append-only writes to `form_schemas` — see
 * `src/actions/schemas.ts` for why that needs no second table and no flag.
 *
 * ## Why publishing is blocked by an error and not by a warning
 *
 * An error means the document would not parse — the schema literally cannot be
 * stored. A warning means it would parse and it would break something of yours:
 * a renamed key, a deleted key. That is a decision the person is entitled to
 * make, and a builder that refuses to let somebody rename their own field is a
 * builder they will work around.
 *
 * Conditional logic (#36) joins on exactly those terms. A ruleset whose
 * behaviour cannot be stated — a circle, a rule naming a field nobody collects,
 * a rule no answer could ever satisfy — is an error and blocks Publish. A rule
 * that is merely redundant is a warning and does not. The judgement is made by
 * `analyzeRules`, which is the same function `parseSchemaDocument` runs, so
 * this screen and the format cannot disagree about what is publishable.
 */

export type BuilderVersion = {
  id: string;
  version: number;
  mode: "warn" | "strict";
  document: FormSchemaDocument | null;
};

export type SchemaBuilderProps = {
  slug: string;
  publicId: string;
  endpointName: string;
  archived: boolean;
  submissionCount: number;
  /** The version the endpoint currently points at, or null. */
  published: BuilderVersion | null;
  /** The newest version, when it is not the live one. */
  draft: BuilderVersion | null;
  versions: VersionSummary[];
  /** `https://{render domain}/f/{publicId}` — where the hosted form lives. */
  formUrl: string;
  /** The path the hosted form posts to. What the preview draws, verbatim. */
  formAction: string;
  formRedirect: string;
};

export function SchemaBuilder({
  slug,
  publicId,
  endpointName,
  archived,
  submissionCount,
  published,
  draft,
  versions,
  formUrl,
  formAction,
  formRedirect,
}: SchemaBuilderProps) {
  // Seeded from the draft when there is one, because that is what somebody was
  // last working on; from the live version otherwise. Never from both.
  const seed = draft?.document ?? published?.document ?? null;

  const [doc, setDoc] = useState<DraftDocument>(() =>
    seed === null ? emptyDraft() : fromDocument(seed),
  );
  const [mode, setMode] = useState<"warn" | "strict">(
    draft?.mode ?? published?.mode ?? "warn",
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [importOpen, setImportOpen] = useState(seed === null);

  const [saveState, save] = useActionState(saveSchemaAction, idleSchemaState);

  const counter = useRef(0);
  const mintId = () => `n${(counter.current += 1)}`;

  const serialized = useMemo(() => JSON.stringify(toSchemaDocument(doc)), [doc]);
  // Strictness is stored on the version but is not part of the document, so it
  // has to join the comparison by hand. Without it, turning `strict` on and
  // nothing else would read as "no changes" and disable the button that is the
  // only way to apply it.
  const fingerprint = `${mode}|${serialized}`;

  // What the server says it stored, not what the client believes it sent.
  //
  // A save that lands while somebody is still typing has not saved the words
  // typed since, and a screen that then reports "no unsaved changes" is lying
  // about the one thing it exists to be right about. So the action echoes back
  // the exact bytes it wrote and this is where they land.
  //
  // Adjusted during render rather than in an effect — React's own pattern for
  // "reset some state when something changes". An effect would render once with
  // the stale answer, paint it, and then correct itself, which is a visible
  // flash of "unsaved changes" on a screen that has just finished saving.
  const [saved, setSaved] = useState<string>(fingerprint);
  const [seenSaveState, setSeenSaveState] = useState(saveState);
  if (seenSaveState !== saveState) {
    setSeenSaveState(saveState);
    if (saveState.status === "success" && saveState.saved !== undefined) {
      setSaved(saveState.saved);
    }
  }

  const publishedKeys = useMemo(
    () => (published?.document?.fields ?? []).map((field) => field.key),
    [published],
  );

  const issues = useMemo(() => draftIssues(doc, publishedKeys), [doc, publishedKeys]);
  const preview = useMemo(() => previewDocument(doc), [doc]);

  const errors = issues.filter((issue) => issue.severity === "error");
  const errorCount = errors.length;
  const ruleErrors = errors.filter((issue) => issue.ruleId !== undefined).length;
  // Counted as *fields*, not as issues: one field can be wrong in three ways at
  // once, and "3 fields have errors" when one card is red sends somebody
  // hunting for two problems that do not exist.
  //
  // A rule issue is not a field issue and must never turn a field's card red,
  // so the two are counted apart everywhere below. `ruleId` is present on
  // exactly the issues `rules-state.ts` produced and absent on everything else,
  // which is why the test is `=== undefined` rather than a truthiness check —
  // a document-level rule issue carries `ruleId: null`.
  const fieldErrors = errors.filter((issue) => issue.ruleId === undefined);
  const brokenFields = new Set(fieldErrors.map((issue) => issue.fieldId)).size;
  const documentIssues = issues.filter(
    (issue) => issue.fieldId === null && issue.ruleId === undefined,
  );
  const ruleIssueList = issues.filter((issue) => issue.ruleId !== undefined);
  const dirty = fingerprint !== saved;

  // Publishing what is already live writes an identical version and moves the
  // pointer to it, which is a row of history that records nothing. It is
  // allowed when there is a saved draft to promote, when there is nothing live
  // yet, and whenever the editor differs — and refused only in the one case
  // where it would do nothing at all.
  const nothingToPublish = !dirty && draft === null && published !== null;

  const patch = (id: string, next: Partial<DraftField>) =>
    setDoc((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.id === id ? { ...field, ...next } : field,
      ),
    }));

  const addField = () => {
    const id = mintId();
    setDoc((current) => ({ ...current, fields: [...current.fields, newDraftField(id)] }));
    setExpanded((current) => new Set(current).add(id));
  };

  /**
   * An imported or proposed document replaces the editor's contents outright.
   *
   * Merging it into what is already there would be guessing which of two
   * definitions of `email` somebody meant, and getting that wrong silently is
   * worse than making them choose. Nothing is published, so the way back is the
   * discard button.
   */
  const adopt = (candidate: ImportCandidate) => {
    setDoc(fromDocument(candidate.document));
    setExpanded(new Set());
    setImportOpen(false);
  };

  const discard = () => {
    setDoc(seed === null ? emptyDraft() : fromDocument(seed));
    setMode(draft?.mode ?? published?.mode ?? "warn");
    setExpanded(new Set());
  };

  const title = doc.name.trim() || endpointName;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
      <div className="min-w-0">
        <Panel>
          <PanelHeader
            title="Fields"
            description="Each one becomes a control on the hosted form, an argument on the agent tool, and a column in an export. The name is the contract; everything else is presentation."
            action={
              <QuietButton onClick={addField} className="shrink-0">
                <Plus aria-hidden="true" className="size-4" />
                Add field
              </QuietButton>
            }
          />

          <PanelBody>
            {doc.fields.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-5 py-10 text-center">
                <p className="text-sm font-medium text-foreground">
                  No fields yet.
                </p>
                <p className="mx-auto mt-2 max-w-[52ch] text-sm text-muted-foreground">
                  Import the form you already have, or add fields one at a time.
                  Until you publish, this endpoint keeps accepting whatever is
                  posted to it.
                </p>
              </div>
            ) : (
              <ul className="grid gap-2">
                {doc.fields.map((field, index) => (
                  <FieldCard
                    key={field.id}
                    field={field}
                    index={index}
                    total={doc.fields.length}
                    issues={issues.filter(
                      (issue) => issue.ruleId === undefined && issue.fieldId === field.id,
                    )}
                    expanded={expanded.has(field.id)}
                    onToggle={() =>
                      setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(field.id)) next.delete(field.id);
                        else next.add(field.id);
                        return next;
                      })
                    }
                    onChange={(next) => patch(field.id, next)}
                    onMove={(to) =>
                      setDoc((current) => ({
                        ...current,
                        fields: moveField(current.fields, index, to),
                      }))
                    }
                    onRemove={() =>
                      setDoc((current) => ({
                        ...current,
                        fields: current.fields.filter(
                          (entry) => entry.id !== field.id,
                        ),
                      }))
                    }
                    mintId={mintId}
                  />
                ))}
              </ul>
            )}

            {documentIssues.length > 0 ? (
              <div className="mt-4 grid gap-1.5 rounded-md border border-border bg-sunken px-3.5 py-3">
                {documentIssues.map((issue, index) => (
                  <IssueLine key={index} severity={issue.severity}>
                    {issue.message}
                  </IssueLine>
                ))}
              </div>
            ) : null}
          </PanelBody>
        </Panel>

        <div className="mt-6">
          <RulesPanel
            rules={doc.rules}
            fields={doc.fields}
            issues={ruleIssueList}
            onChange={(rules) => setDoc((current) => ({ ...current, rules }))}
            mintId={mintId}
          />
        </div>

        <div className="mt-6">
          <RulesInspector document={preview.document} />
        </div>

        <Panel className="mt-6">
          <PanelHeader
            title="Start from a form you already have"
            description="Nothing here publishes. Whatever is found lands in the editor for you to read first."
            action={
              <QuietButton
                onClick={() => setImportOpen((open) => !open)}
                aria-expanded={importOpen}
              >
                {importOpen ? "Hide" : "Show"}
              </QuietButton>
            }
          />
          {importOpen ? (
            <PanelBody>
              <ImportPanel
                slug={slug}
                publicId={publicId}
                submissionCount={submissionCount}
                onAdopt={adopt}
              />
            </PanelBody>
          ) : null}
        </Panel>

        <Panel className="mt-6">
          <PanelHeader
            title="Form title and strictness"
            description="Two settings, both stored on the version you publish."
          />
          <PanelBody className="grid gap-5">
            <TextField
              label="Form title"
              value={doc.name}
              onChange={(event) =>
                setDoc((current) => ({ ...current, name: event.target.value }))
              }
              placeholder={endpointName}
              hint={`The heading on the hosted form. Left blank it uses the endpoint's name, “${endpointName}”.`}
            />

            <div>
              <CheckboxField
                label="Reject submissions that do not match this schema"
                checked={mode === "strict"}
                onChange={(event) =>
                  setMode(event.target.checked ? "strict" : "warn")
                }
                hint="Off by default, and off is the safe answer."
              />
              <p className="mt-2 max-w-[64ch] text-sm text-muted-foreground">
                Left off, a submission that does not match is{" "}
                <span className="text-foreground">still stored</span> and
                annotated with what looked wrong. Turned on, it is refused with
                a 422 — which means a mistake in this schema starts costing you
                leads that used to arrive. An extra field nobody declared is a
                warning either way, because a marketing tag appending{" "}
                <code className="font-mono">msclkid</code> must never break a
                form.
              </p>
            </div>
          </PanelBody>
        </Panel>
      </div>

      {/* The right-hand column: what state the form is in, what it looks like,
          and everything it has ever been.

          The order matters most on a phone, where this column falls *below* the
          editor rather than beside it. Publish therefore has to come before the
          version history — somebody who has just finished editing wants the
          button, not an archive — which is why `Versions` lives here rather
          than at the foot of the editor where it would otherwise belong. */}
      <div className="min-w-0">
        <div className="lg:sticky lg:top-20">
          <Panel>
            <PanelBody>
              <form action={save}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="publicId" value={publicId} />
                <input type="hidden" name="mode" value={mode} />
                <input type="hidden" name="document" value={serialized} />

                <Status
                  dirty={dirty}
                  brokenFields={brokenFields}
                  ruleErrors={ruleErrors}
                  published={published}
                  draft={draft}
                  archived={archived}
                  nothingToPublish={nothingToPublish}
                />

                <div className="mt-4 flex flex-wrap gap-2">
                  <PublishButton
                    disabled={errorCount > 0 || archived || nothingToPublish}
                    live={published !== null}
                  />
                  <SaveDraftButton disabled={errorCount > 0 || !dirty} />
                  <QuietButton onClick={discard} disabled={!dirty}>
                    Discard changes
                  </QuietButton>
                </div>

                <p
                  role="status"
                  aria-live="polite"
                  className={cn(
                    "mt-3 min-h-5 text-sm",
                    saveState.status === "error"
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {saveState.message}
                </p>
              </form>
            </PanelBody>
          </Panel>

          <div className="mt-6">
            <PreviewPane
              document={preview.document}
              title={title}
              action={formAction}
              redirectTo={formRedirect}
              skipped={preview.skipped}
              liveUrl={published === null ? null : formUrl}
            />
          </div>
        </div>

        <Panel className="mt-6">
          <PanelHeader
            title="Versions"
            description="Every version this endpoint has had. Nothing is ever overwritten, so a submission stays readable against the exact definition it arrived under."
          />
          <PanelBody>
            <VersionsPanel
              slug={slug}
              publicId={publicId}
              versions={versions}
              hasActive={published !== null}
              archived={archived}
            />
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}

/**
 * What state this endpoint's form is in, in one paragraph.
 *
 * Written as sentences rather than as a badge because the three facts people
 * need are not a status: what is live right now, what is unsaved, and what
 * pressing Publish would do to the first of those.
 */
function Status({
  dirty,
  brokenFields,
  ruleErrors,
  published,
  draft,
  archived,
  nothingToPublish,
}: {
  dirty: boolean;
  brokenFields: number;
  ruleErrors: number;
  published: BuilderVersion | null;
  draft: BuilderVersion | null;
  archived: boolean;
  nothingToPublish: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-label uppercase text-muted-foreground">
        Status
      </p>

      <p className="mt-2 text-sm text-foreground">
        {published === null ? (
          <>
            No schema is live. This endpoint accepts whatever is posted to it,
            and it has no hosted form and no agent tool until you publish one.
          </>
        ) : (
          <>
            Version {published.version} is live. Every form pointed at this
            endpoint is using it right now.
          </>
        )}
      </p>

      {draft !== null ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Version {draft.version} is saved but not live.
        </p>
      ) : null}

      {dirty ? (
        <p className="mt-2 text-sm text-muted-foreground">
          You have changes that are not saved anywhere yet.
        </p>
      ) : null}

      {nothingToPublish ? (
        <p className="mt-2 text-sm text-muted-foreground">
          The editor matches what is live, so there is nothing to publish.
        </p>
      ) : null}

      {archived ? (
        <p className="mt-2 text-sm text-destructive">
          This endpoint is archived, so it is not accepting submissions. Restore
          it before publishing.
        </p>
      ) : null}

      {brokenFields > 0 ? (
        <p className="mt-2 text-sm text-destructive">
          {brokenFields === 1
            ? "One field has an error. Publishing is blocked until it is fixed."
            : `${brokenFields} fields have errors. Publishing is blocked until they are fixed.`}
        </p>
      ) : null}

      {ruleErrors > 0 ? (
        <p className="mt-2 text-sm text-destructive">
          {ruleErrors === 1
            ? "One rule has an error. Publishing is blocked until it is fixed."
            : `${ruleErrors} rules have errors. Publishing is blocked until they are fixed.`}
        </p>
      ) : null}
    </div>
  );
}

function PublishButton({
  disabled,
  live,
}: {
  disabled: boolean;
  live: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="intent"
      value="publish"
      disabled={pending || disabled}
      className="signal-fill inline-flex h-11 shrink-0 items-center justify-center rounded-md px-4 text-base font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
    >
      {pending
        ? "Publishing…"
        : live
          ? "Publish — replaces what is live"
          : "Publish"}
    </button>
  );
}

function SaveDraftButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <QuietButton
      type="submit"
      name="intent"
      value="draft"
      disabled={pending || disabled}
      className="h-11"
    >
      {pending ? "Saving…" : "Save without publishing"}
    </QuietButton>
  );
}
