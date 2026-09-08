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
    title: "1. Information We Collect",
    content:
      "We collect information you provide direct to us, including when you create an account, run job searches, or contact us for support. This may include your name, email address, and the job descriptions you submit for analysis.",
  },
  {
    title: "2. How We Use Your Information",
    content: "We use the information we collect to:",
    list: [
      "Provide, maintain, and improve our services",
      "Process your job search requests",
      "Send you technical notices and support messages",
      "Respond to your comments and questions",
      "Monitor and analyze trends, usage, and activities",
    ],
  },
  {
    title: "3. Information Sharing",
    content:
      "We do not share your personal information with third parties except as described in this policy. We may share information with service providers who perform services on our behalf, such as hosting and data analysis.",
  },
  {
    title: "4. Data Security",
    content:
      "We take reasonable measures to help protect your personal information from loss, theft, misuse, unauthorized access, disclosure, alteration, and destruction.",
  },
  {
    title: "5. Data Retention",
    content:
      "We retain your account information for as long as your account is active or as needed to provide you services. Search history may be deleted automatically after a specified period.",
  },
  {
    title: "6. Your Rights",
    content:
      "You have the right to access, update, or delete your personal information at any time through your account settings. You may also contact us to request deletion of your account.",
  },
  {
    title: "7. Changes to This Policy",
    content:
      "We may update this privacy policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the effective date.",
  },
  {
    title: "8. Contact Us",
    content:
      "If you have any questions about this privacy policy, please contact us through our support page.",
    hasLink: true,
  },
];

export default function Privacy() {
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
            <span className={SECTION_LABEL}>Privacy &amp; security</span>
            <h1 className="mt-3 text-[clamp(32px,5vw,44px)] font-semibold leading-[1.05] tracking-[-0.03em]">
              Privacy policy
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
