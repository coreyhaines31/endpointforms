// Kept out of the "use server" module: those files may only export async functions.
export type WaitlistState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialWaitlistState: WaitlistState = { status: "idle", message: "" };
