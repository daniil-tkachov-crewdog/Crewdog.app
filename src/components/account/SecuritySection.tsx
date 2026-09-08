import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { CARD, INPUT, BTN_ACCENT, SECTION_LABEL, FIELD_LABEL, MUTED } from "./ui";

const MONO_LABEL = FIELD_LABEL;

export default function SecuritySection() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (busy) return;

    const form = e.currentTarget;
    const cur = (
      form.querySelector("#currentPassword") as HTMLInputElement
    )?.value?.trim();
    const next = (
      form.querySelector("#newPassword") as HTMLInputElement
    )?.value?.trim();
    const confirm = (
      form.querySelector("#confirmPassword") as HTMLInputElement
    )?.value?.trim();

    if (!cur || !next) return toast.error("Both fields are required.");
    if (next !== confirm) return toast.error("Passwords do not match.");
    if (next.length < 6)
      return toast.error("New password must be at least 6 characters.");

    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const email = user?.email;
      if (!email) throw new Error("Unable to get user email.");

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: cur,
      });
      if (signInError) throw new Error("Incorrect current password.");

      const { error: updateError } = await supabase.auth.updateUser({
        password: next,
      });
      if (updateError) throw updateError;

      (form.querySelector("#currentPassword") as HTMLInputElement).value = "";
      (form.querySelector("#newPassword") as HTMLInputElement).value = "";
      (form.querySelector("#confirmPassword") as HTMLInputElement).value = "";
      toast.success("Password updated successfully!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <span className={SECTION_LABEL}>Security</span>

      <div className={`mt-5 p-6 sm:p-7 ${CARD}`}>
        <h3 className="mb-5 text-[18px] font-semibold tracking-[-0.01em]">Change password</h3>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className={MONO_LABEL}>
              Current password
            </label>
            <div className="relative">
              <input
                id="currentPassword"
                type={show ? "text" : "password"}
                className={INPUT + " pr-10"}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className={`absolute right-3 top-1/2 -translate-y-1/2 hover:text-[#1A1917] dark:hover:text-[#ECEBE8] ${MUTED}`}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="newPassword" className={MONO_LABEL}>
              New password
            </label>
            <input id="newPassword" type="password" className={INPUT} />
          </div>
          <div>
            <label htmlFor="confirmPassword" className={MONO_LABEL}>
              Confirm new password
            </label>
            <input id="confirmPassword" type="password" className={INPUT} />
          </div>
          <button
            type="submit"
            disabled={busy}
            className={`w-full py-[13px] text-[15px] ${BTN_ACCENT}`}
          >
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </section>
  );
}
