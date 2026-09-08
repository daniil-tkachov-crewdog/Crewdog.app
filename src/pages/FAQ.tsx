import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Wordmark, ThemeToggle } from "@/components/layout/chrome";
import {
  CARD,
  PANEL,
  BTN_ACCENT,
  SECTION_LABEL,
  SECONDARY,
  MUTED,
} from "@/components/account/ui";
import { motion, AnimatePresence } from "framer-motion";

const faqs = [
  {
    question: "How does CrewDog work?",
    answer:
      "CrewDog uses advanced AI to analyze job descriptions from LinkedIn and other platforms to identify the actual hiring company behind recruiter posts. Our system cross-references multiple data sources to trace company information, find direct application routes, and provide contact details for hiring managers and HR personnel.",
  },
  {
    question: "What information do I need to provide?",
    answer:
      "You can provide either a LinkedIn job URL or paste the complete job description. For best results, ensure the description is at least 300 characters and includes location information (city, state, or country). The more detailed the job posting, the more accurate our results will be.",
  },
  {
    question: "How accurate are the results?",
    answer:
      "Our AI achieves over 90% accuracy by cross-referencing multiple data sources including company databases, LinkedIn profiles, and public records. However, results depend on the quality and completeness of the job description provided. We continuously improve our algorithms based on user feedback.",
  },
  {
    question: "What's included in the free plan?",
    answer:
      "The free plan includes 3 job searches per month. Each search provides company identification, official website links, career page URLs, and basic contact information. You also get access to search history for 30 days and email support.",
  },
  {
    question: "Can I search for jobs outside my country?",
    answer:
      "Yes! CrewDog works with job postings from any location worldwide. Our system is designed to handle international job markets and can identify companies across different regions, as long as location information is included in the job description.",
  },
  {
    question: "Is my data secure and private?",
    answer:
      "Absolutely. We take data security seriously and are fully GDPR compliant. We don't share your searches with third parties, don't sell your data, and only store job descriptions temporarily to process your request. Your search history is private and can be deleted at any time from your account.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit cards (Visa, Mastercard, American Express) and debit cards through our secure payment processor Stripe. All transactions are encrypted and we never store your payment information on our servers.",
  },
  {
    question: "Can I cancel my subscription anytime?",
    answer:
      "Yes, you can cancel your subscription at any time from your account settings. There are no cancellation fees, and you'll continue to have access to paid features until the end of your current billing period.",
  },
  {
    question: "Do you offer refunds?",
    answer:
      "We offer a 7-day money-back guarantee on all paid plans. If you're not satisfied with CrewDog within the first week, contact our support team and we'll process a full refund, no questions asked.",
  },
  {
    question: "How do I upgrade or downgrade my plan?",
    answer:
      "You can change your plan at any time from your account settings. When upgrading, you'll have immediate access to additional features. When downgrading, changes take effect at the start of your next billing cycle.",
  },
  {
    question: "What if I get incorrect results?",
    answer:
      "If the results do not look correct, we recommend refining your search criteria or running the search again. Small adjustments often improve accuracy and relevance.",
  },
];

export default function FAQ() {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const navigate = useNavigate();

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

      <main className="flex-1 pb-16 pt-6">
        <div className="mx-auto w-full max-w-[1040px] px-6">
          {/* ── Heading ── */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <span className={SECTION_LABEL}>Help centre</span>
            <h1 className="mt-3 text-[clamp(32px,5vw,44px)] font-semibold leading-[1.05] tracking-[-0.03em]">
              How can we help?
            </h1>
            <p className={`mt-4 max-w-[54ch] text-[16px] leading-[1.6] ${SECONDARY}`}>
              Answers to the questions recruiters ask most — how Radar reads an
              advert, what's in each plan, and how your data is handled.
            </p>
          </motion.div>

          {/* ── FAQ content ── */}
          <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-12">
            {/* Sidebar */}
            <aside className="lg:col-span-4">
              <div className="lg:sticky lg:top-10">
                <div className={`p-6 ${CARD}`}>
                  <span className={SECTION_LABEL}>Support</span>
                  <h2 className="mt-3 text-[24px] font-semibold tracking-[-0.02em]">
                    FAQs
                  </h2>
                  <p className={`mt-3 text-[15px] leading-[1.6] ${SECONDARY}`}>
                    Have questions? Check the common ones here for a quick answer
                    — or reach out and we'll help directly.
                  </p>
                  <Link to="/support" className={`mt-5 inline-block ${BTN_ACCENT}`}>
                    Contact support →
                  </Link>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {[
                    { v: String(faqs.length), l: "Questions" },
                    { v: "24/7", l: "Support" },
                  ].map((s) => (
                    <div key={s.l} className={`px-5 py-4 text-center ${PANEL}`}>
                      <div className="text-[22px] font-semibold text-[#1A1917] dark:text-[#ECEBE8]">
                        {s.v}
                      </div>
                      <div className={`mt-1 text-[11px] uppercase tracking-[0.06em] ${MUTED}`}>
                        {s.l}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            {/* FAQ list */}
            <div className="lg:col-span-8">
              <div className="space-y-3">
                {faqs.map((faq, index) => {
                  const open = expandedId === index;
                  return (
                    <div
                      key={index}
                      className={
                        "overflow-hidden transition-colors " +
                        CARD +
                        (open
                          ? " border-[#E0480F] dark:border-[#FF5A1F]"
                          : "")
                      }
                    >
                      <button
                        onClick={() => setExpandedId(open ? null : index)}
                        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                        aria-expanded={open}
                      >
                        <span className="text-[16px] font-semibold tracking-[-0.01em]">
                          {faq.question}
                        </span>
                        <motion.span
                          animate={{ rotate: open ? 90 : 0 }}
                          transition={{ type: "spring", stiffness: 200, damping: 15 }}
                          className={
                            "flex-shrink-0 text-[20px] " +
                            (open
                              ? "text-[#E0480F] dark:text-[#FF5A1F]"
                              : "text-[#6E6B64] dark:text-[#96938C]")
                          }
                        >
                          ›
                        </motion.span>
                      </button>

                      <AnimatePresence>
                        {open && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-[rgba(26,25,23,0.1)] px-6 pb-6 pt-4 dark:border-[rgba(255,255,255,0.1)]">
                              <p className={`text-[15px] leading-[1.6] ${SECONDARY}`}>
                                {faq.answer}
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
