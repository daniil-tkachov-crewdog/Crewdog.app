import { useState } from "react";
import { toast } from "sonner";
import { sendSupportMessage } from "@/services/support";
import { CARD, INPUT, BTN_ACCENT, SECTION_LABEL, FIELD_LABEL, SECONDARY, BORDER } from "./ui";

const MONO_LABEL = FIELD_LABEL;

export default function SupportForm({ userEmail }: { userEmail: string }) {
  const [topic, setTopic] = useState<string>("");
  const [loading, setLoading] = useState(false);

  return (
    <section>
      <span className={SECTION_LABEL}>Contact support</span>

      <div className={`mt-5 p-6 sm:p-8 ${CARD}`}>
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (loading) return;

            const email = (
              e.currentTarget.querySelector("#supportEmail") as HTMLInputElement
            )?.value?.trim();

            const message = (
              e.currentTarget.querySelector(
                "#supportMessage"
              ) as HTMLTextAreaElement
            )?.value?.trim();

            if (!email || !message) {
              toast.error("Email and message are required.");
              return;
            }

            try {
              setLoading(true);
              await sendSupportMessage({
                email,
                message,
                topic: (topic as any) || "other",
              });
              (e.currentTarget as HTMLFormElement).reset();
              setTopic("");
              toast.success("Message sent! We'll get back to you soon.");
            } catch (err: any) {
              toast.error(err?.message || "Failed to send. Please try again.");
            } finally {
              setLoading(false);
            }
          }}
        >
          <div>
            <label htmlFor="supportEmail" className={MONO_LABEL}>
              Email
            </label>
            <input
              id="supportEmail"
              type="email"
              defaultValue={userEmail}
              className={INPUT}
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="supportTopic" className={MONO_LABEL}>
              Subject
            </label>
            <select
              id="supportTopic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={loading}
              className={INPUT + " cursor-pointer"}
            >
              <option value="">Select a topic</option>
              <option value="technical">Technical Issue</option>
              <option value="billing">Billing Question</option>
              <option value="feature">Feature Request</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="supportMessage" className={MONO_LABEL}>
              Message
            </label>
            <textarea
              id="supportMessage"
              placeholder="Describe your issue or question..."
              className={INPUT + " min-h-[200px] resize-y leading-[1.55]"}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-[13px] text-[15px] ${BTN_ACCENT}`}
          >
            {loading ? "Sending..." : "Send message"}
          </button>
        </form>

        <div className={`mt-7 border-t pt-6 text-center ${BORDER}`}>
          <h3 className="mb-1 text-[15px] font-semibold">Need immediate help?</h3>
          <p className={`text-[14px] ${SECONDARY}`}>
            Check our FAQs or visit the support center.
          </p>
        </div>
      </div>
    </section>
  );
}
