"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { formError, formSuccess, type FormState } from "@/actions/form-state";
import { requireMember } from "@/actions/guards";
import { preRegisterSplitTestEffect, SplitTestStoreError } from "@/lib/hindsight/store";

/**
 * Split tests (#45, #59).
 *
 * Same rule as every other action here: the slug comes from the form, the
 * workspace id comes from a membership check, and the test is addressed by its
 * public ID — so one belonging to another workspace matches nothing under the
 * scoped update and gets the sentence a nonexistent one gets.
 *
 * Only one action so far, and it is the one that has to happen **before** a
 * test is started. Everything else about a test — starting it, stopping it —
 * still happens through `src/lib/hindsight/store.ts` called from elsewhere.
 */

const preRegisterSchema = z.object({
  slug: z.string().min(1),
  testPublicId: z.string().min(1),
  /** Percentages as typed, because "20" is what a person means by a 20% lift. */
  liftPct: z.coerce
    .number()
    .positive("The improvement to detect has to be greater than zero — no sample size detects a difference of nothing.")
    .max(1000, "That is not an improvement anybody is testing for. Keep it under 1000%."),
  baselinePct: z.coerce
    .number()
    .gt(0, "The baseline Yield rate has to be above 0% — at zero there is nothing to improve on.")
    .lt(100, "The baseline Yield rate has to be below 100% — at 100% there is no room to improve."),
  basis: z.enum(["exposure", "submission"]),
});

export async function preRegisterEffectAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = preRegisterSchema.safeParse({
    slug: formData.get("slug"),
    testPublicId: formData.get("testPublicId"),
    liftPct: formData.get("liftPct"),
    baselinePct: formData.get("baselinePct"),
    basis: formData.get("basis"),
  });

  if (!parsed.success) {
    return formError(parsed.error.issues[0]?.message ?? "Those numbers will not work.");
  }

  const access = await requireMember(parsed.data.slug);
  if ("error" in access) return access.error;

  try {
    await preRegisterSplitTestEffect(access.workspace.id, parsed.data.testPublicId, {
      relativeLift: parsed.data.liftPct / 100,
      baselineRate: parsed.data.baselinePct / 100,
      basis: parsed.data.basis,
    });

    revalidatePath(`/app/${parsed.data.slug}`, "layout");

    return formSuccess(
      `Registered: detect a ${parsed.data.liftPct}% improvement on a ${parsed.data.baselinePct}% baseline. The sample this test needs is now fixed, and cannot be changed — including by us.`,
    );
  } catch (error) {
    if (error instanceof SplitTestStoreError) return formError(error.message);
    throw error;
  }
}
