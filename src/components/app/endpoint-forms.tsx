"use client";

import { useActionState } from "react";

import {
  createEndpointAction,
  renameEndpointAction,
  setEndpointArchivedAction,
} from "@/actions/endpoints";
import { idleFormState } from "@/actions/form-state";
import { Field, FormMessage, SubmitButton } from "@/components/app/forms";

/**
 * The three things you can do to an endpoint.
 *
 * Every one posts the workspace **slug**, never its id — the action re-derives
 * the workspace from the slug and the session, so a hidden field here is not
 * load-bearing for access control. What it is responsible for is saying what
 * happened afterwards.
 */

/**
 * Create.
 *
 * A name and nothing else. The public ID is generated, the schema is optional and
 * arrives later, and asking for either up front would make an endpoint feel like
 * a form you have to design before you can receive anything — which is exactly
 * the thing this product does not require.
 */
export function CreateEndpointForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(createEndpointAction, idleFormState);

  return (
    <form action={action} noValidate>
      <input type="hidden" name="slug" value={slug} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field
            label="Endpoint name"
            name="name"
            placeholder="Demo request form"
            autoComplete="off"
            required
            invalid={state.status === "error"}
            hint="Just for you — it’s what you’ll pick out in the inbox. You can change it later."
          />
        </div>
        <SubmitButton pendingLabel="Creating…">Create endpoint</SubmitButton>
      </div>

      <FormMessage state={state} />
    </form>
  );
}

export function RenameEndpointForm({
  slug,
  publicId,
  name,
}: {
  slug: string;
  publicId: string;
  name: string;
}) {
  const [state, action] = useActionState(renameEndpointAction, idleFormState);

  return (
    <form action={action} noValidate>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="publicId" value={publicId} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Endpoint name" name="name" defaultValue={name} required />
        </div>
        <SubmitButton pendingLabel="Saving…" variant="quiet">
          Save
        </SubmitButton>
      </div>

      <FormMessage state={state} />
    </form>
  );
}

/**
 * Archive, or put back.
 *
 * The button says Archive rather than Delete because nothing is deleted, and the
 * sentence beside it says what archiving actually stops. A destructive-looking
 * button over a non-destructive act trains people to distrust the labels.
 */
export function ArchiveEndpointForm({
  slug,
  publicId,
  archived,
}: {
  slug: string;
  publicId: string;
  archived: boolean;
}) {
  const [state, action] = useActionState(setEndpointArchivedAction, idleFormState);

  return (
    <form action={action}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="archived" value={archived ? "false" : "true"} />

      <SubmitButton
        pendingLabel={archived ? "Restoring…" : "Archiving…"}
        variant={archived ? "quiet" : "destructive"}
      >
        {archived ? "Restore endpoint" : "Archive endpoint"}
      </SubmitButton>

      <FormMessage state={state} />
    </form>
  );
}
