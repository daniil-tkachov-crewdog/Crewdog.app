// The "Upload your CV" pop-up: a PDF from the machine now, LinkedIn later.
//
// The parse takes a few seconds (a PDF read plus a model call), which is long
// enough that the dialog has to say so — hence the busy state rather than a
// fire-and-forget file input. It stays open until the upload succeeds, so an
// error is readable in the place the user caused it.

import { useRef, useState } from "react";
import { FileText, Linkedin, Loader2, UploadCloud } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uploadCv, type CvRecord, type ProfileFields } from "@/features/account/api/profile";
import { BTN_GHOST, INPUT, MUTED, PANEL, SECONDARY } from "@/features/account/components/ui";

export default function CvUploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (result: { cv: CvRecord; profile: ProfileFields }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await uploadCv(file);
      onUploaded(result);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read your CV.");
    } finally {
      setBusy(false);
      // Clear the input so re-picking the same file fires onChange again.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-parse would leave the upload running with nowhere to
        // report back to, so the dialog holds until it settles.
        if (busy) return;
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-[520px] rounded-[16px] border-[rgba(26,25,23,0.1)] bg-white p-7 dark:border-[rgba(255,255,255,0.1)] dark:bg-[#1F1E24]">
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="text-[19px] font-semibold tracking-[-0.01em]">
            Upload your CV
          </DialogTitle>
          <DialogDescription className={`text-[13.5px] ${MUTED}`}>
            We read it once and fill in your profile below. You can edit anything
            afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          {/* Option 1 — a PDF from this device. */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void handleFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => !busy && inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-[12px] border border-dashed px-6 py-8 text-center transition-colors ${
              dragging
                ? "border-[#E0480F] bg-[rgba(224,72,15,0.05)] dark:border-[#FF5A1F] dark:bg-[rgba(255,90,31,0.07)]"
                : "border-[rgba(26,25,23,0.2)] hover:border-[rgba(26,25,23,0.34)] dark:border-[rgba(255,255,255,0.16)] dark:hover:border-[rgba(255,255,255,0.3)]"
            } ${busy ? "pointer-events-none opacity-70" : ""}`}
          >
            {busy ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-[#E0480F] dark:text-[#FF5A1F]" />
                <span className="text-[14px] font-medium">Reading your CV…</span>
                <span className={`text-[12.5px] ${MUTED}`}>
                  This takes a few seconds.
                </span>
              </>
            ) : (
              <>
                <UploadCloud className="h-6 w-6 text-[#6E6B64] dark:text-[#96938C]" />
                <span className="text-[14px] font-medium">
                  Drop your CV here, or click to browse
                </span>
                <span className={`flex items-center gap-1 text-[12.5px] ${MUTED}`}>
                  <FileText className="h-3.5 w-3.5" />
                  PDF only, up to 10MB
                </span>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </div>

          {error && (
            <p className="text-[13px] text-[#E0480F] dark:text-[#FF5A1F]">{error}</p>
          )}

          {/* Option 2 — LinkedIn, not built yet. Shown rather than hidden so
              the second route is a known plan instead of a surprise later. */}
          <div className={`${PANEL} opacity-75`}>
            <div className="mb-3 flex items-center gap-2">
              <Linkedin className="h-4 w-4 text-[#6E6B64] dark:text-[#96938C]" />
              <span className="text-[14px] font-medium">Import from LinkedIn</span>
              <span className="rounded-full bg-[rgba(26,25,23,0.07)] px-2 py-[2px] text-[10.5px] font-medium uppercase tracking-[0.05em] text-[#6E6B64] dark:bg-[rgba(255,255,255,0.08)] dark:text-[#96938C]">
                Coming soon
              </span>
            </div>
            <div className="flex gap-2">
              <input
                disabled
                placeholder="https://www.linkedin.com/in/your-profile"
                className={`${INPUT} cursor-not-allowed`}
              />
              <button disabled className={`${BTN_GHOST} flex-shrink-0`}>
                Import
              </button>
            </div>
            <p className={`mt-2 text-[12px] ${SECONDARY}`}>
              Paste your profile link and we'll build your CV from it.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
