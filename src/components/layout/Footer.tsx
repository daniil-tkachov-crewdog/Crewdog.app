import { Link } from "react-router-dom";
import { Twitter, Linkedin, Mail } from "lucide-react";
import { gaEvent } from "@/analytics/gtm";

const sections = [
  {
    title: "Product",
    links: [
      { to: "/run", label: "Run Search" },
      { to: "/pricing", label: "Pricing" },
      { href: "https://crewdogcv.ai/", label: "CrewdogCV" },
    ],
  },
  {
    title: "Support",
    links: [
      { to: "/support", label: "Contact" },
      { to: "/faq", label: "FAQ" },
      { to: "/account", label: "My Account" },
    ],
  },
  {
    title: "Legal",
    links: [
      { to: "/privacy", label: "Privacy Policy" },
      { to: "/terms", label: "Terms of Use" },
    ],
  },
] as const;

const socials = [
  { icon: Twitter, label: "Twitter", href: "#" },
  { icon: Linkedin, label: "LinkedIn", href: "#" },
  { icon: Mail, label: "Email", href: "mailto:hello@crewdog.ai" },
];

export const Footer = () => {
  function track(event: string, params?: Record<string, any>) {
    (window as any).dataLayer = (window as any).dataLayer || [];
    (window as any).dataLayer.push({ event, ...(params || {}) });
    try {
      gaEvent(event, params);
    } catch {}
  }

  function handleFooterNavClick(label: string, to: string) {
    track("footer_link_click", { label, to });
  }

  function handleSocialClick(label: string, href: string) {
    track("social_link_click", { label, href });
  }

  function reopenConsent() {
    try {
      localStorage.removeItem("gc-consent-v1");
    } catch {}
    track("manage_cookies_click");
    location.reload();
  }

  const linkCls =
    "text-[14px] text-[#9A97A3] transition-colors hover:text-white";

  return (
    <footer className="border-t border-white/10 bg-[#0B0B0F] font-['Space_Grotesk',system-ui,sans-serif] text-white">
      <div className="mx-auto w-full max-w-[1040px] px-6 py-14">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
          {/* Brand */}
          <div className="md:col-span-5">
            <span className="flex items-baseline gap-[2px] text-[24px] font-bold tracking-[-0.02em]">
              Crew<b className="font-bold text-[#FF5A1F]">Dog</b>
              <span className="ml-[5px]">DC</span>
            </span>
            <p className="mt-4 max-w-[34ch] text-[14px] leading-[1.6] text-[#9A97A3]">
              Read the advert. Find the lead. Competitor advert intelligence for
              energy &amp; data-centre recruiters.
            </p>

            {/* Socials */}
            <div className="mt-6 flex gap-3">
              {socials.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  onClick={() => handleSocialClick(social.label, social.href)}
                  aria-label={social.label}
                  className="flex h-10 w-10 items-center justify-center rounded-[3px] border border-white/10 text-[#9A97A3] transition-colors hover:border-[#FF5A1F] hover:text-white"
                >
                  <social.icon className="h-[18px] w-[18px]" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {sections.map((section) => (
            <div key={section.title} className="md:col-span-2">
              <h4 className="mb-4 font-['IBM_Plex_Mono',monospace] text-[12px] uppercase tracking-[0.12em] text-[#FF5A1F]">
                {section.title}
              </h4>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={"to" in link ? link.to : link.href}>
                    {"to" in link ? (
                      <Link
                        to={link.to}
                        onClick={() => handleFooterNavClick(link.label, link.to)}
                        className={linkCls}
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => handleFooterNavClick(link.label, link.href)}
                        className={linkCls}
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-8 md:flex-row md:items-center">
          <p className="font-['IBM_Plex_Mono',monospace] text-[12px] tracking-[0.04em] text-[#6F6C78]">
            © 2025 CrewDog DC · Built in Aberdeen
          </p>
          <div className="flex items-center gap-6 font-['IBM_Plex_Mono',monospace] text-[12px] tracking-[0.04em] text-[#6F6C78]">
            <button
              type="button"
              onClick={reopenConsent}
              className="underline underline-offset-2 transition-colors hover:text-white"
              title="Manage cookies"
            >
              Manage cookies
            </button>
            <span className="flex items-center gap-2">
              <span className="h-[6px] w-[6px] rounded-full bg-[#FF5A1F]" />
              All systems operational
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
