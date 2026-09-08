import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Wordmark, ThemeToggle } from "@/components/layout/chrome";
import {
  CARD,
  INPUT,
  BTN_ACCENT,
  FIELD_LABEL,
  SECTION_LABEL,
  SECONDARY,
} from "@/components/account/ui";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { sendSupportMessage } from "@/services/support";

const faqs = [
  {
    question: "How quickly will I get a response?",
    answer:
      "We typically respond to all inquiries within 24 hours during business days. For urgent issues, our live chat support is available during business hours for immediate assistance.",
  },
  {
    question: "What information should I include in my message?",
    answer:
      "Please include your account email, a detailed description of your issue or question, and any relevant screenshots. This helps us provide you with faster, more accurate support.",
  },
  {
    question: "Do you offer phone support?",
    answer:
      "Yes, phone support is available for Pro and Business plan subscribers during business hours (9 AM - 6 PM GMT, Monday to Friday).",
  },
  {
    question: "Can I schedule a demo or consultation?",
    answer:
      "Absolutely! Business plan subscribers can schedule dedicated consultation sessions. Contact us through this form or email us direct to arrange a convenient time.",
  },
];

const MONO_LABEL = FIELD_LABEL;

export default function Support() {
  const navigate = useNavigate();
  // form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<string>("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;

    setError("");
    setSuccess(false);

    // bot check
    if (honeypot) return;

    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();

    if (!trimmedEmail || !trimmedMessage) {
      const msg = "Email and message are required.";
      setError(msg);
      toast.error(msg);
      return;
    }

    try {
      setLoading(true);
      await sendSupportMessage({
        email: trimmedEmail,
        message: trimmedMessage,
        topic: (topic as any) || "other",
      });

      setName("");
      setEmail("");
      setTopic("");
      setMessage("");
      setSuccess(true);
      toast.success("Message sent! We'll get back to you soon.");
    } catch (err: any) {
      const msg = err?.message || "Failed to send. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white font-grotesk text-[#1A1917] dark:bg-[#17161A] dark:text-[#ECEBE8]">
      <header className="flex h-14 shrink-0 items-center justify-between px-6">
        <Link to="/chat">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-[6px] text-[13px] text-[#6E6B64] transition-colors hover:text-[#1A1917] dark:text-[#96938C] dark:hover:text-[#ECEBE8]"
          >
            <ArrowLeft className="h-[15px] w-[15px]" />
            Back
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 pb-16 pt-6">
        <div className="mx-auto w-full max-w-[1040px] px-6">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-10"
          >
            <span className={SECTION_LABEL}>Support</span>
            <h1 className="mt-3 text-[clamp(32px,5vw,44px)] font-semibold leading-[1.05] tracking-[-0.03em]">
              We're here to help
            </h1>
            <p className={`mt-4 max-w-[54ch] text-[16px] leading-[1.6] ${SECONDARY}`}>
              Get in touch with our team. Most messages get a reply within 24
              hours on business days.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Form */}
          <div className={`p-7 sm:p-8 ${CARD}`}>
            <span className={SECTION_LABEL}>Send a message</span>
            <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.02em]">Contact support</h2>
            <p className={`mt-2 text-[15px] leading-[1.6] ${SECONDARY}`}>
              Fill out the form and we'll get back to you shortly.
            </p>

            {success && (
              <div className="mt-6 rounded-[10px] border border-[#E0480F]/40 bg-[#E0480F]/[0.06] px-4 py-3 text-[13px] text-[#E0480F] dark:border-[#FF5A1F]/40 dark:bg-[#FF5A1F]/[0.08] dark:text-[#FF5A1F]">
                ✓ Thanks for your message! We'll get back to you within 24 hours.
              </div>
            )}

            {error && (
              <div className="mt-6 rounded-[10px] border border-red-300 bg-red-50 px-4 py-3 text-[13px] text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              {/* Honeypot — hidden from users */}
              <input
                type="text"
                name="website"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                style={{ position: "absolute", left: "-9999px" }}
                tabIndex={-1}
                aria-hidden="true"
              />

              <div>
                <label htmlFor="name" className={MONO_LABEL}>
                  Name (optional)
                </label>
                <input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={INPUT}
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="email" className={MONO_LABEL}>
                  Email *
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={INPUT}
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="topic" className={MONO_LABEL}>
                  Subject
                </label>
                <select
                  id="topic"
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
                <label htmlFor="message" className={MONO_LABEL}>
                  Message *
                </label>
                <textarea
                  id="message"
                  placeholder="Tell us how we can help..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className={INPUT + " min-h-[150px] resize-y leading-[1.55]"}
                  required
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
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className={`p-6 sm:p-7 ${CARD}`}>
              <span className={SECTION_LABEL}>Quick answers</span>
              <div className="mt-4 divide-y divide-[rgba(26,25,23,0.1)] dark:divide-[rgba(255,255,255,0.1)]">
                {faqs.map((faq, index) => (
                  <details key={index} className="group py-1">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-[15px] font-medium">
                      <span>{faq.question}</span>
                      <span className="flex-shrink-0 text-[#E0480F] transition-transform group-open:rotate-90 dark:text-[#FF5A1F]">
                        ›
                      </span>
                    </summary>
                    <p className={`pb-3 text-[14px] leading-[1.6] ${SECONDARY}`}>
                      {faq.answer}
                    </p>
                  </details>
                ))}
              </div>
            </div>

            {/* Response time */}
            <div className={`border-l-4 border-l-[#E0480F] p-6 dark:border-l-[#FF5A1F] ${CARD}`}>
              <span className={SECTION_LABEL}>Average response time</span>
              <p className="mt-2 text-[28px] font-semibold text-[#E0480F] dark:text-[#FF5A1F]">
                ‹ 24 hours
              </p>
              <p className={`mt-1 text-[14px] ${SECONDARY}`}>During business days</p>
            </div>
          </div>
          </div>
        </div>
      </main>
    </div>
  );
}
