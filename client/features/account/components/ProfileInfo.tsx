// Profile / CV — the one place the user tells Crewdog who they are.
//
// Everything here is one form over one row of user_profiles. The CV upload is a
// shortcut into that same form rather than a separate thing: cv_reader fills the
// blanks and saves, the user corrects whatever it got wrong and saves again.
//
// The one rule worth stating: an upload only fills fields that are still empty
// (enforced server-side, in cvReader.js). A second CV can add what the first
// one missed, but it can never overwrite a correction made by hand.

import { useEffect, useState } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { AccountUser } from "@/features/account/types";
import {
  EMPTY_PROFILE,
  getCurrentCv,
  getProfile,
  saveProfile,
  type CvRecord,
  type ProfileFields,
} from "@/features/account/api/profile";
import CvUploadDialog from "@/features/account/components/CvUploadDialog";
import {
  BTN_PRIMARY,
  CARD,
  FIELD_LABEL,
  INPUT,
  MUTED,
  SECTION_LABEL,
} from "@/features/account/components/ui";

// Label, field key and placeholder for each input, in display order. The two
// job titles after the first are placeholders only — the label carries the
// number, so the grid below is one map over this.
const FIELDS: {
  key: keyof ProfileFields;
  label: string;
  placeholder: string;
  type?: string;
  wide?: boolean;
}[] = [
  { key: "full_name", label: "Full name", placeholder: "Jane Smith" },
  { key: "email", label: "Email", placeholder: "jane@example.com", type: "email" },
  { key: "phone", label: "Phone number", placeholder: "+44 7700 900000" },
  { key: "location", label: "Location", placeholder: "Southampton, United Kingdom" },
  { key: "job_title_1", label: "Job title 1", placeholder: "Most recent role" },
  { key: "job_title_2", label: "Job title 2", placeholder: "Previous role" },
  { key: "job_title_3", label: "Job title 3", placeholder: "Role before that" },
];

function formatUploaded(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

export default function ProfileInfo({ user }: { user: AccountUser }) {
  const [fields, setFields] = useState<ProfileFields>(EMPTY_PROFILE);
  const [cv, setCv] = useState<CvRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [profile, current] = await Promise.all([getProfile(), getCurrentCv()]);
        if (!alive) return;
        // Nothing saved yet: the account already knows the name and email, so
        // the form opens with those rather than two empty boxes.
        setFields(
          profile ?? {
            ...EMPTY_PROFILE,
            full_name: user.name ?? "",
            email: user.email ?? "",
          }
        );
        setCv(current);
      } catch (err) {
        if (alive) {
          toast.error(
            err instanceof Error ? err.message : "Could not load your profile."
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user.name, user.email]);

  const set = (key: keyof ProfileFields, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      setFields(await saveProfile(fields));
      toast.success("Profile saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <span className={SECTION_LABEL}>Profile information</span>

      <div className={`mt-5 p-6 ${CARD}`}>
        {/* The CV: upload, and what we currently hold. */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[15px] font-medium">Your CV</div>
            <p className={`mt-1 text-[13px] ${MUTED}`}>
              {cv ? (
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  {cv.file_name}
                  {cv.uploaded_at && ` · uploaded ${formatUploaded(cv.uploaded_at)}`}
                </span>
              ) : (
                "Upload a PDF and we'll fill in the fields below for you."
              )}
            </p>
          </div>
          <button
            onClick={() => setDialogOpen(true)}
            disabled={loading}
            className={`${BTN_PRIMARY} inline-flex items-center gap-2`}
          >
            <Upload className="h-4 w-4" />
            {cv ? "Replace your CV" : "Upload your CV"}
          </button>
        </div>

        <div className="my-6 h-px bg-[rgba(26,25,23,0.08)] dark:bg-[rgba(255,255,255,0.08)]" />

        {loading ? (
          <div className={`flex items-center gap-2 py-6 text-[14px] ${MUTED}`}>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your profile…
          </div>
        ) : (
          <>
            <div className="grid gap-5 md:grid-cols-2">
              {FIELDS.map(({ key, label, placeholder, type }) => (
                <div key={key}>
                  <label htmlFor={`profile-${key}`} className={FIELD_LABEL}>
                    {label}
                  </label>
                  <input
                    id={`profile-${key}`}
                    type={type ?? "text"}
                    value={fields[key]}
                    onChange={(e) => set(key, e.target.value)}
                    placeholder={placeholder}
                    className={INPUT}
                  />
                </div>
              ))}
            </div>

            <div className="mt-5">
              <label htmlFor="profile-summary" className={FIELD_LABEL}>
                Summary
              </label>
              <textarea
                id="profile-summary"
                value={fields.summary}
                onChange={(e) => set("summary", e.target.value)}
                rows={5}
                placeholder="A few sentences about your experience. Uploading a CV fills this in for you."
                className={`${INPUT} resize-y`}
              />
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className={`${BTN_PRIMARY} inline-flex items-center gap-2`}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? "Saving…" : "Save"}
              </button>
              <span className={`text-[12.5px] ${MUTED}`}>
                Saved to your account and used across Crewdog.
              </span>
            </div>
          </>
        )}
      </div>

      <CvUploadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onUploaded={({ cv: uploaded, profile }) => {
          // cv_reader has already saved both, so this is only catching the UI up.
          setCv(uploaded);
          setFields(profile);
          toast.success("CV read — your profile is filled in and saved");
        }}
      />
    </section>
  );
}
