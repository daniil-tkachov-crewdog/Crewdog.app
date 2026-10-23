import { toast } from "sonner";

export type NotifyKind = "success" | "error" | "info";

export function notify(message: string, kind: NotifyKind = "success") {
  if (kind === "success") return toast.success(message);
  if (kind === "error") return toast.error(message);
  return toast.message(message);
}
