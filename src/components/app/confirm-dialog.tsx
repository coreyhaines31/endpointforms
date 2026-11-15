"use client";

import { useRef } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";

import { cn } from "@/lib/utils";

export type ConfirmCopy = {
  /** A question, naming the thing: "Remove the Salesforce destination?" */
  title: string;
  /** What happens, and whether it can be undone. Always visible, never a tooltip. */
  description: React.ReactNode;
  /** The verb on the confirming button. Repeats the action, never "OK". */
  confirmLabel: string;
  /** Red confirm button for actions that delete or cut someone off. */
  destructive?: boolean;
};

/**
 * The second step for an action that is hard to take back.
 *
 * Built on Base UI's AlertDialog: focus is trapped, Escape and Cancel close
 * it, and focus returns to the button that opened it. Cancel takes focus
 * first, so an Enter pressed out of habit does the safe thing.
 *
 * Motion is the popup settling from 96% scale and the backdrop fading,
 * 220ms in and 160ms out, keyed off Base UI's data-starting-style and
 * data-ending-style. Modals stay centred, so the scale is from the centre.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  returnFocus,
  title,
  description,
  confirmLabel,
  destructive = false,
}: ConfirmCopy & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  returnFocus?: React.RefObject<HTMLElement | null>;
}) {
  const cancel = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-[70] bg-black/40 transition-opacity duration-(--dur-base) ease-enter data-[ending-style]:opacity-0 data-[ending-style]:duration-(--dur-quick) data-[starting-style]:opacity-0" />
        <AlertDialog.Popup
          initialFocus={cancel}
          finalFocus={returnFocus}
          className="fixed left-1/2 top-1/2 z-[71] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-control bg-popover p-6 text-popover-foreground transition-[opacity,scale] duration-(--dur-base) ease-enter data-[ending-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[ending-style]:duration-(--dur-quick) data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0"
        >
          <AlertDialog.Title className="text-h4">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-3 text-sm text-muted-foreground">
            {description}
          </AlertDialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Close
              ref={cancel}
              className="press inline-flex h-11 items-center justify-center rounded-md border border-border-control px-4 text-sm font-medium text-foreground hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Cancel
            </AlertDialog.Close>
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onConfirm();
              }}
              className={cn(
                "press inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                destructive
                  ? "bg-destructive text-destructive-foreground hover:brightness-110"
                  : "signal-fill hover:brightness-95",
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
