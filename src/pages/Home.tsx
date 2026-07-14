import { Link } from "react-router-dom";
import { Topbar } from "@/components/layout/Topbar";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";

/**
 * Landing page — "CrewDog Radar" prototype.
 * Faithful implementation of the Claude Design "Landing Page Prototype.html"
 * handoff. The shared Topbar and Footer (with the existing footer links) are
 * kept; only the landing content adopts the new editorial / radar aesthetic.
 *
 * Palette (scoped to this page via arbitrary values):
 *   ember     #FF5A1F   ink      #0B0B0F   ink-soft  #15151C
 *   paper     #F4F2EE   paperDim #E4E1D9   mute      #6F6C78
 */

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5 },
};

const PROCESS_STEPS = [
  {
    num: "01",
    tone: "light" as const,
    title: "Spot the demand",
    body: "Find a recent competitor job advert.",
  },
  {
    num: "02",
    tone: "light" as const,
    title: "Read the signals",
    body: "Paste the job description in Crewdog app.",
  },
  {
    num: "03",
    tone: "dark" as const,
    title: "Identify the likely client",
    body: "Turn the competitor advert into a named company worth approaching — the likely end client behind the post, with the confidence to act on it.",
  },
  {
    num: "04",
    tone: "dark" as const,
    title: "Reveal the likely contact",
    body: "Radar surfaces the likely LinkedIn contact at that company — the person worth connecting with — so you start the conversation direct.",
    tag: "Radar Contact · Direct tier",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F4F2EE] text-[#0B0B0F] font-['Space_Grotesk',system-ui,sans-serif]">
      <Topbar />

      <main className="flex-1">
        {/* ── Hero ── */}
        <header className="relative overflow-hidden bg-[#0B0B0F] text-white">
          {/* Radar sweep decoration */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-40 -top-20 h-[520px] w-[520px] rounded-full border border-[#FF5A1F]/20 max-[720px]:right-[-220px] max-[720px]:opacity-50"
          >
            <div className="absolute inset-20 rounded-full border border-[#FF5A1F]/[0.14]" />
            <div className="absolute inset-[170px] rounded-full border border-[#FF5A1F]/10" />
          </div>

          <div className="mx-auto w-full max-w-[1040px] px-6 py-[72px] pb-[88px]">
            <motion.div {...fadeUp}>
              <span className="mb-7 block font-['IBM_Plex_Mono',monospace] text-[13px] uppercase tracking-[0.22em] text-[#FF5A1F]">
                Competitor advert intelligence · Energy &amp; Data Centres
              </span>
              <h1 className="max-w-[13ch] text-[clamp(44px,9vw,92px)] font-bold leading-[0.96] tracking-[-0.03em]">
                Paste the advert. <em className="not-italic text-[#FF5A1F]">Find the lead.</em>
              </h1>
              <p className="mt-[30px] max-w-[54ch] text-[clamp(17px,2.4vw,20px)] leading-[1.6] text-[#C9C6CF]">
                For recruiters in energy and data centres. Every competitor job post carries
                signals about the end client. Paste the advert and Radar reads those signals —
                then names the company likely behind it, and the people likely doing the hiring.
              </p>
              <div className="mt-10 flex flex-wrap gap-[14px]">
                <Link
                  to="/run"
                  className="rounded-[2px] bg-[#FF5A1F] px-[26px] py-[15px] text-[15px] font-semibold text-[#0B0B0F] transition-transform duration-150 hover:-translate-y-0.5"
                >
                  Paste an advert
                </Link>
              </div>
            </motion.div>
          </div>
        </header>

        {/* ── Contrast strip — the positioning line ── */}
        <section className="bg-[#FF5A1F] text-[#0B0B0F]">
          <div className="mx-auto flex w-full max-w-[1040px] flex-wrap items-baseline gap-[14px] px-6 py-[22px]">
            <span className="font-['IBM_Plex_Mono',monospace] text-[12px] font-semibold uppercase tracking-[0.18em]">
              The difference
            </span>
            <p className="text-[clamp(16px,2.4vw,19px)] font-medium tracking-[-0.01em]">
              Radar shows you who to connect with. Others just say an advert{" "}
              <em className="not-italic font-semibold">might</em> point to a client.
            </p>
          </div>
        </section>

        {/* ── Process ── */}
        <section id="how" className="pb-6 pt-20">
          <div className="mx-auto w-full max-w-[1040px] px-6">
            <motion.div {...fadeUp} className="mb-12">
              <span className="font-['IBM_Plex_Mono',monospace] text-[13px] uppercase tracking-[0.2em] text-[#FF5A1F]">
                // the four moves
              </span>
              <h2 className="mt-[14px] max-w-[18ch] text-[clamp(30px,5vw,46px)] leading-[1.02] tracking-[-0.02em]">
                From a competitor advert to a conversation
              </h2>
              <p className="mt-[18px] max-w-[56ch] text-[17px] leading-[1.6] text-[#55525E]">
                Every competitor post carries signals about who's hiring. Radar reads them and
                points you to the connections worth approaching — in seconds, on every advert
                you feed it.
              </p>
            </motion.div>

            <div className="grid gap-[18px]">
              {PROCESS_STEPS.map((step) => {
                const dark = step.tone === "dark";
                return (
                  <motion.article
                    key={step.num}
                    {...fadeUp}
                    className={
                      "grid grid-cols-[auto_1fr] items-start gap-[26px] rounded-md px-[30px] py-[34px] max-[720px]:grid-cols-1 max-[720px]:gap-3 " +
                      (dark
                        ? "bg-[#0B0B0F] text-white"
                        : "border border-[#E4E1D9] bg-white")
                    }
                  >
                    <div className="font-['IBM_Plex_Mono',monospace] text-[34px] font-semibold leading-none text-[#FF5A1F]">
                      {step.num}
                    </div>
                    <div>
                      <h3
                        className={
                          "mb-[10px] text-[24px] tracking-[-0.01em] " +
                          (dark ? "text-white" : "")
                        }
                      >
                        {step.title}
                      </h3>
                      <p
                        className={
                          "max-w-[52ch] text-[16px] leading-[1.6] " +
                          (dark ? "text-[#B9B6C0]" : "text-[#55525E]")
                        }
                      >
                        {step.body}
                      </p>
                      {step.tag && (
                        <span className="mt-4 inline-block rounded-[2px] border border-[#FF5A1F]/[0.35] px-[10px] py-[5px] font-['IBM_Plex_Mono',monospace] text-[12px] tracking-[0.06em] text-[#FF5A1F]">
                          {step.tag}
                        </span>
                      )}
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Signals callout ── */}
        <section className="pb-20 pt-16">
          <div className="mx-auto w-full max-w-[1040px] px-6">
            <motion.div
              {...fadeUp}
              className="rounded-md bg-[#15151C] px-9 py-11 text-white"
            >
              <span className="font-['IBM_Plex_Mono',monospace] text-[13px] uppercase tracking-[0.18em] text-[#FF5A1F]">
                What Radar gives you
              </span>
              <h2 className="my-[14px] mb-7 max-w-[20ch] text-[clamp(26px,4vw,38px)] tracking-[-0.02em]">
                Signals in. Connections worth approaching out.
              </h2>
              <p className="mt-1 max-w-[54ch] text-[17px] leading-[1.6] text-[#C9C6CF]">
                Radar reads the signals across live competitor adverts and suggests the companies
                that hire people like this — so you spend your time on real demand, not guesswork.
                Feed it a post, get a shortlist of connections worth approaching.
              </p>
            </motion.div>
          </div>
        </section>

        {/* ── CV handoff ── */}
        <section className="pb-[72px]">
          <div className="mx-auto w-full max-w-[1040px] px-6">
            <motion.div
              {...fadeUp}
              className="flex flex-wrap items-center justify-between gap-7 rounded-md border border-[#E4E1D9] border-l-4 border-l-[#FF5A1F] bg-white px-[34px] py-[38px]"
            >
              <div>
                <span className="font-['IBM_Plex_Mono',monospace] text-[13px] uppercase tracking-[0.18em] text-[#FF5A1F]">
                  Next step · CrewDog CV
                </span>
                <h2 className="my-3 max-w-[22ch] text-[clamp(22px,3.4vw,30px)] tracking-[-0.02em]">
                  Found the connection? Now make the approach land.
                </h2>
                <p className="max-w-[54ch] text-[16px] leading-[1.6] text-[#55525E]">
                  Format your best CV to send to these connections, and start the conversation
                  with your MPC — your most placeable candidate, ready to go.
                </p>
              </div>
              <a
                href="https://crewdogcv.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 whitespace-nowrap rounded-[2px] bg-[#FF5A1F] px-[26px] py-[15px] text-[15px] font-semibold text-[#0B0B0F] transition-transform duration-150 hover:-translate-y-0.5"
              >
                Open CrewDog CV →
              </a>
            </motion.div>
          </div>
        </section>

        {/* ── Close CTA ── */}
        <section id="start" className="bg-[#0B0B0F] py-[84px] text-center text-white">
          <div className="mx-auto w-full max-w-[1040px] px-6">
            <motion.div {...fadeUp}>
              <h2 className="mx-auto max-w-[16ch] text-[clamp(32px,6vw,60px)] leading-none tracking-[-0.03em]">
                Paste the advert. <em className="not-italic text-[#FF5A1F]">Get the lead.</em>
              </h2>
              <p className="mx-auto mb-9 mt-[22px] max-w-[46ch] text-[18px] text-[#C9C6CF]">
                Start free. See the likely client behind your first competitor post in under a
                minute.
              </p>
              <Link
                to="/run"
                className="inline-block rounded-[2px] bg-[#FF5A1F] px-[26px] py-[15px] text-[15px] font-semibold text-[#0B0B0F] transition-transform duration-150 hover:-translate-y-0.5"
              >
                Run your first search
              </Link>
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
