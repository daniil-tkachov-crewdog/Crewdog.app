import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Wordmark, ThemeToggle } from "@/components/layout/chrome";
import { CARD, SECTION_LABEL, SECONDARY, MUTED } from "@/components/account/ui";
import { motion, useScroll, useSpring } from "framer-motion";

const sections: Array<{
  title: string;
  content: string;
  list?: string[];
  hasLink?: boolean;
}> = [
  {
    title: "1. Acceptance of Terms",
    content:
      "By accessing and using CrewDog, you accept and agree to be bound by the terms and provisions of this agreement. If you do not agree to these terms, please do not use our service.",
  },
  {
    title: "2. Service Description",
    content:
      "CrewDog provides job search analysis services that help identify hiring companies behind job postings. Results are provided on a best-effort basis and accuracy may vary based on available information.",
  },
  {
    title: "3. User Accounts",
    content:
      "When you create an account with us, you must provide accurate and complete information.",
    list: [
      "Maintaining the security of your account and password",
      "All activities that occur under your account",
      "Notifying us immediately of any unauthorized use",
    ],
  },
  {
    title: "4. Acceptable Use",
    content: "You agree not to:",
    list: [
      "Use the service for any illegal purpose",
      "Attempt to gain unauthorized access to our systems",
      "Interfere with or disrupt the service",
      "Use automated systems to access the service excessively",
      "Share your account credentials with others",
    ],
  },
  {
    title: "5. Subscription and Payment",
    content:
      "Paid subscriptions are billed in advance on a monthly or annual basis. You may cancel your subscription at any time, but refunds are not provided for partial periods.",
  },
  {
    title: "6. Intellectual Property",
    content:
      "The service and its original content, features, and functionality are owned by CrewDog and are protected by international copyright, trademark, and other intellectual property laws.",
  },
  {
    title: "7. Disclaimer of Warranties",
    content:
      'The service is provided "as is" without warranties of any kind. We do not guarantee that the service will be uninterrupted, secure, or error-free. Results are provided for informational purposes and accuracy is not guaranteed.',
  },
  {
    title: "8. Limitation of Liability",
    content:
      "In no event shall CrewDog be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of the service.",
  },
  {
    title: "9. Termination",
    content:
      "We may terminate or suspend your account immediately, without prior notice, for any breach of these terms. Upon termination, your right to use the service will cease immediately.",
  },
  {
    title: "10. Changes to Terms",
    content:
      "We reserve the right to modify these terms at any time. We will provide notice of significant changes by posting the new terms on this page.",
  },
  {
    title: "11. Contact",
    content:
      "Questions about these terms should be sent to us through our support page.",
    hasLink: true,
  },
];

export default function Terms() {
  const navigate = useNavigate();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <div className="flex min-h-screen flex-col bg-white font-grotesk text-[#1A1917] dark:bg-[#17161A] dark:text-[#ECEBE8]">
      {/* Reading progress bar */}
      <motion.div
        className="fixed left-0 right-0 top-0 z-50 h-1 origin-left bg-[#E0480F] dark:bg-[#FF5A1F]"
        style={{ scaleX }}
      />

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
        <div className="mx-auto w-full max-w-[800px] px-6">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-10"
          >
            <span className={SECTION_LABEL}>Legal</span>
            <h1 className="mt-3 text-[clamp(32px,5vw,44px)] font-semibold leading-[1.05] tracking-[-0.03em]">
              Terms of use
            </h1>
            <p className={`mt-4 text-[14px] ${MUTED}`}>
              Effective date: January 1, 2025
            </p>
          </motion.div>

          <div className="space-y-4">
            {sections.map((section, index) => (
              <motion.section
                key={index}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: index * 0.04 }}
                className={`p-7 sm:p-8 ${CARD}`}
              >
                <h2 className="text-[20px] font-semibold tracking-[-0.01em] sm:text-[22px]">
                  {section.title}
                </h2>
                <p className={`mt-3 text-[15px] leading-[1.7] ${SECONDARY}`}>
                  {section.content}
                  {section.hasLink && (
                    <>
                      {" "}
                      <Link
                        to="/support"
                        className="font-medium text-[#E0480F] hover:underline dark:text-[#FF5A1F]"
                      >
                        support page →
                      </Link>
                      .
                    </>
                  )}
                </p>
                {section.list && (
                  <ul className="mt-4 space-y-2.5">
                    {section.list.map((item, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="mt-[2px] flex-shrink-0 text-[#E0480F] dark:text-[#FF5A1F]">
                          ›
                        </span>
                        <span className={`text-[15px] leading-[1.6] ${SECONDARY}`}>
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
