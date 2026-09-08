import { useState } from "react";
import { toast } from "sonner";
import type { AccountUser } from "../data/account.types";
import { CARD, INPUT, BTN_PRIMARY, BTN_GHOST, SECTION_LABEL, FIELD_LABEL, MUTED } from "./ui";

const MONO_LABEL = FIELD_LABEL;

export default function ProfileInfo({ user }: { user: AccountUser }) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [editName, setEditName] = useState(user.name);
  const [editEmail, setEditEmail] = useState(user.email);

  const handleSaveName = () => {
    // TODO: call API to update name
    toast.success("Name updated successfully!");
    setIsEditingName(false);
  };

  const handleSaveEmail = () => {
    // TODO: call API to update email (send verification)
    toast.success("Email updated — please verify.");
    setIsEditingEmail(false);
  };

  return (
    <section>
      <span className={SECTION_LABEL}>Profile information</span>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {/* Name */}
        <div className={`group p-6 ${CARD}`}>
          <div className={MONO_LABEL + " mb-3"}>Full name</div>

          {isEditingName ? (
            <div className="space-y-3">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={user.name}
                className={INPUT}
              />
              <div className="flex gap-2">
                <button onClick={handleSaveName} className={BTN_PRIMARY + " flex-1"}>
                  Save
                </button>
                <button onClick={() => setIsEditingName(false)} className={BTN_GHOST}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-[17px] font-medium">{user.name}</span>
              <button
                onClick={() => setIsEditingName(true)}
                className={`text-[11px] font-medium uppercase tracking-[0.04em] opacity-0 transition-opacity hover:text-[#E0480F] group-hover:opacity-100 dark:hover:text-[#FF5A1F] ${MUTED}`}
              >
                Edit
              </button>
            </div>
          )}
        </div>

        {/* Email */}
        <div className={`group p-6 ${CARD}`}>
          <div className={MONO_LABEL + " mb-3"}>Email address</div>

          {isEditingEmail ? (
            <div className="space-y-3">
              <input
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder={user.email}
                type="email"
                className={INPUT}
              />
              <div className="flex gap-2">
                <button onClick={handleSaveEmail} className={BTN_PRIMARY + " flex-1"}>
                  Save
                </button>
                <button onClick={() => setIsEditingEmail(false)} className={BTN_GHOST}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-[17px] font-medium">{user.email}</span>
              <button
                onClick={() => setIsEditingEmail(true)}
                className={`flex-shrink-0 text-[11px] font-medium uppercase tracking-[0.04em] opacity-0 transition-opacity hover:text-[#E0480F] group-hover:opacity-100 dark:hover:text-[#FF5A1F] ${MUTED}`}
              >
                Edit
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
