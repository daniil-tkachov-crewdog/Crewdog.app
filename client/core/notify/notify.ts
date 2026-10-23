// client/core/notify/notify.ts
//
// One entry point for user-facing messages, so the toast library stays
// replaceable and every call site reads the same.

import { toast } from "sonner";

export type NotifyKind = "success" | "error" | "info";

export function notify(message: string, kind: NotifyKind = "success") {
  if (kind === "success") return toast.success(message);
  if (kind === "error") return toast.error(message);
  return toast.message(message);
}
