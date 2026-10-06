import React from "react";
import { ArrowUpRight, Briefcase, ChevronDown, Home, Mail, Phone, Search } from "lucide-react";
import {
  lookupContactField,
  type ContactField,
  type ContactLookupResult,
} from "@/services/contactLookup";
import type {
  JobResult,
  PersonResult,
  PlaceResult,
  ResultGroup,
  ResultSummary,
} from "@/types/chatResults";

// Unfolding result cards for the chat page: one grouped panel per workflow run,
// each row folded to the basics plus a Visit button, unfolded to the details.

type FollowUp = (prompt: string) => void;

// Whether the paid contact lookup is offered on person cards, and whether this
// visitor is allowed to use it. Threaded down from Chat rather than read here,
// so one settings fetch serves every card on the page.
export type ContactLookupCtx = { enabled: boolean; signedIn: boolean };

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const joinDot = (...parts: (string | undefined)[]) =>
  parts.filter((p) => p && p.trim()).join(" · ");

const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// "£1,050 pcm" -> "£1.05k", "£725 pcm" -> "£725": short enough for the tile.
function shortPrice(price: string): string {
  const m = price.match(/([£€$])\s?([\d,]+(?:\.\d+)?)/);
  if (!m) return price.split(/\s/)[0] || "—";
  const n = Number(m[2].replace(/,/g, ""));
  if (n >= 1000) return `${m[1]}${+(n / 1000).toFixed(2)}k`;
  return `${m[1]}${m[2]}`;
}

const pricePeriod = (price: string) =>
  /\bp\.?w\b|week/i.test(price) ? "pw" : /pcm|month|p\/m/i.test(price) ? "pcm" : "";

// --- Shared bits --------------------------------------------------------------

const ExternalArrow = () => (
  <ArrowUpRight className="h-3 w-3 shrink-0" strokeWidth={2.4} />
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex flex-col gap-1">
    <span className="text-[11.5px] font-medium uppercase tracking-[0.04em] text-[#8A877F] dark:text-[#7E7B74]">
      {label}
    </span>
    <span className="text-[13px] text-[#1A1917] dark:text-[#ECEBE8]">
      {children}
    </span>
  </div>
);

const PrimaryLink: React.FC<{ href: string; children: React.ReactNode }> = ({
  href,
  children,
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-[7px] rounded-[9px] bg-[#E0480F] px-[14px] py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#C63E0C] hover:text-white dark:bg-[#FF5A1F] dark:text-[#0B0B0F] dark:hover:bg-[#FF7140] dark:hover:text-[#0B0B0F]"
  >
    {children}
    <ExternalArrow />
  </a>
);

const SecondaryButton: React.FC<{
  onClick: () => void;
  children: React.ReactNode;
  // The contact lookup spends money per click, so its buttons need a state in
  // which they are visibly present but cannot be pressed — while one call is in
  // flight, or when the visitor is not signed in.
  disabled?: boolean;
  title?: string;
  icon?: React.ReactNode;
}> = ({ onClick, children, disabled, title, icon }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="flex items-center gap-[7px] rounded-[9px] border border-[rgba(26,25,23,0.14)] bg-white px-[14px] py-2 text-[13px] text-[#1A1917] transition-colors hover:border-[rgba(26,25,23,0.28)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-[rgba(26,25,23,0.14)] dark:border-[rgba(255,255,255,0.14)] dark:bg-[#1F1E24] dark:text-[#ECEBE8] dark:hover:border-[rgba(255,255,255,0.28)] dark:disabled:hover:border-[rgba(255,255,255,0.14)]"
  >
    {icon}
    {children}
  </button>
);

const Pill: React.FC<{ tone: "violet" | "neutral" | "green"; children: React.ReactNode }> = ({
  tone,
  children,
}) => {
  const tones = {
    violet:
      "bg-[rgba(139,92,246,0.1)] text-[#6D3FD9] dark:bg-[rgba(167,139,250,0.14)] dark:text-[#B9A2FB]",
    neutral:
      "bg-[rgba(26,25,23,0.06)] text-[#5F5D57] dark:bg-[rgba(255,255,255,0.08)] dark:text-[#A6A39C]",
    green:
      "bg-[rgba(34,140,90,0.1)] text-[#1C7A4D] dark:bg-[rgba(52,190,120,0.14)] dark:text-[#5FD39A]",
  };
  return (
    <span
      className={`rounded-full px-2 py-[2px] text-[11.5px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
};

// One folding row. The header is the folded card; `children` is the unfolded body.
const ResultRow: React.FC<{
  open: boolean;
  onToggle: () => void;
  avatar: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  line2: string;
  line3?: React.ReactNode;
  visitLabel: string;
  url: string;
  children: React.ReactNode;
}> = ({ open, onToggle, avatar, title, badge, line2, line3, visitLabel, url, children }) => (
  <div className="border-b border-[rgba(26,25,23,0.09)] dark:border-[rgba(255,255,255,0.08)]">
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={`flex cursor-pointer items-center gap-3 px-4 py-[13px] transition-colors hover:bg-[#FAFAF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgba(224,72,15,0.35)] sm:gap-[14px] dark:hover:bg-[#26252B] ${
        open ? "bg-[#FAFAF8] dark:bg-[#26252B]" : ""
      }`}
    >
      {avatar}
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold text-[#1A1917] dark:text-[#ECEBE8]">
            {title}
          </span>
          {badge}
        </div>
        {line2 && (
          <span className="truncate text-[13.5px] text-[#5F5D57] dark:text-[#A6A39C]">
            {line2}
          </span>
        )}
        {line3 && (
          <span className="text-[12.5px] text-[#8A877F] dark:text-[#7E7B74]">
            {line3}
          </span>
        )}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#1A1917] px-[13px] py-[7px] text-[12.5px] font-medium text-white transition-colors duration-150 hover:bg-[#E0480F] hover:text-white dark:bg-[#ECEBE8] dark:text-[#17161A] dark:hover:bg-[#FF5A1F] dark:hover:text-white"
      >
        {visitLabel}
        <ExternalArrow />
      </a>
      <ChevronDown
        className={`h-4 w-4 shrink-0 text-[#8A877F] transition-transform duration-200 ${
          open ? "rotate-180" : ""
        }`}
      />
    </div>
    {open && (
      <div className="chat-unfold flex flex-col gap-[14px] bg-[#FAFAF8] pb-[18px] pl-4 pr-4 pt-[2px] sm:pl-[68px] dark:bg-[#26252B]">
        {children}
      </div>
    )}
  </div>
);

const avatarCls =
  "flex h-[38px] w-[38px] shrink-0 items-center justify-center bg-[#EDECE7] text-[#1A1917] dark:bg-[#33323A] dark:text-[#ECEBE8]";

// --- Contact lookup -----------------------------------------------------------
//
// Two buttons per person card, one datapoint each. Nothing here runs on render:
// Lusha bills per revealed datapoint, so the call happens on a click and only
// for the field clicked. A resolved field replaces its own button, so the same
// profile cannot be bought twice from the same card — and the server-side cache
// catches the cases this local state cannot see (a reload, another chat, another
// user).
//
// Deliberately NOT routed through onFollowUp: that prop is Chat's send(), so a
// lookup through it would cost a metered chat turn and leave the model deciding
// whether to make the call.

type FieldState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; values: string[]; cached: boolean }
  | { status: "empty"; cached: boolean }
  | { status: "error"; message: string };

const CONTACT_FIELDS = [
  { field: "phone" as ContactField, label: "Check phone number", noun: "Phone" },
  { field: "email" as ContactField, label: "Check email", noun: "Email" },
];

const fieldIcon = (field: ContactField) =>
  field === "phone" ? (
    <Phone className="h-[13px] w-[13px] shrink-0" strokeWidth={2.2} />
  ) : (
    <Mail className="h-[13px] w-[13px] shrink-0" strokeWidth={2.2} />
  );

const toState = (r: ContactLookupResult): FieldState => {
  if (r.status === "success") return { status: "done", values: r.values, cached: r.cached };
  if (r.status === "not_found") return { status: "empty", cached: r.cached };
  return { status: "error", message: r.message };
};

const ContactActions: React.FC<{ url: string; ctx: ContactLookupCtx }> = ({
  url,
  ctx,
}) => {
  const [states, setStates] = React.useState<Record<ContactField, FieldState>>({
    phone: { status: "idle" },
    email: { status: "idle" },
  });

  // The re-entry guard has to be a ref, not the state above: two clicks in one
  // tick both close over the same `states`, so a state check would let both
  // through and bill twice for the same datapoint.
  const inFlight = React.useRef<Partial<Record<ContactField, boolean>>>({});

  const check = async (field: ContactField) => {
    if (inFlight.current[field] || states[field].status !== "idle") return;
    inFlight.current[field] = true;
    setStates((s) => ({ ...s, [field]: { status: "loading" } }));
    try {
      const result = await lookupContactField(url, field);
      setStates((s) => ({ ...s, [field]: toState(result) }));
    } finally {
      inFlight.current[field] = false;
    }
  };

  const pending = CONTACT_FIELDS.filter(
    ({ field }) => states[field].status === "idle" || states[field].status === "loading"
  );
  const resolved = CONTACT_FIELDS.filter(
    ({ field }) => !pending.some((q) => q.field === field)
  );

  return (
    <>
      {!!pending.length && (
      <div className="flex flex-wrap gap-2">
        {pending.map(({ field, label }) => {
          const st = states[field];
          return (
            <SecondaryButton
              key={field}
              icon={fieldIcon(field)}
              onClick={() => void check(field)}
              disabled={!ctx.signedIn || st.status === "loading"}
              title={
                ctx.signedIn
                  ? undefined
                  : "Sign in to check contact details"
              }
            >
              {st.status === "loading" ? "Checking…" : label}
            </SecondaryButton>
          );
        })}
      </div>
      )}

      {!!resolved.length && (
        <div className="flex flex-col gap-2">
          {resolved.map(({ field, noun }) => {
            const st = states[field];
            return (
              <div
                key={field}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px]"
              >
                <span className="text-[11.5px] font-medium uppercase tracking-[0.04em] text-[#8A877F] dark:text-[#7E7B74]">
                  {noun}
                </span>
                {st.status === "done" ? (
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    {st.values.map((v) => (
                      <a
                        key={v}
                        href={field === "phone" ? `tel:${v.replace(/\s/g, "")}` : `mailto:${v}`}
                        className="font-medium text-[#1A1917] underline decoration-[rgba(26,25,23,0.3)] underline-offset-2 dark:text-[#ECEBE8] dark:decoration-[rgba(255,255,255,0.3)]"
                      >
                        {v}
                      </a>
                    ))}
                  </span>
                ) : (
                  <span className="text-[#5F5D57] dark:text-[#A6A39C]">
                    {st.status === "empty"
                      ? "Not on record for this profile."
                      : st.status === "error"
                        ? st.message
                        : null}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!ctx.signedIn && (
        <p className="text-[12px] text-[#8A877F] dark:text-[#7E7B74]">
          Sign in to check phone numbers and emails.
        </p>
      )}
    </>
  );
};

// --- Rows per workflow --------------------------------------------------------

const PersonRow: React.FC<{
  p: PersonResult;
  open: boolean;
  onToggle: () => void;
  onFollowUp: FollowUp;
  contactLookup?: ContactLookupCtx;
}> = ({ p, open, onToggle, onFollowUp, contactLookup }) => {
  const initials = p.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const conf = p.confidence ? `${Math.round(p.confidence * 100)}%` : "";
  return (
    <ResultRow
      open={open}
      onToggle={onToggle}
      avatar={
        <span
          className={`${avatarCls} rounded-full text-[13px] font-semibold tracking-[0.02em] ${
            p.available
              ? "shadow-[0_0_0_2px_#fff,0_0_0_3.5px_rgba(139,92,246,0.55)] dark:shadow-[0_0_0_2px_#1F1E24,0_0_0_3.5px_rgba(167,139,250,0.6)]"
              : ""
          }`}
        >
          {initials}
        </span>
      }
      title={p.name}
      badge={
        p.available ? (
          <Pill tone="violet">Open to work</Pill>
        ) : p.tier === "unconfirmed" ? (
          <Pill tone="neutral">Unconfirmed</Pill>
        ) : p.tag ? (
          <Pill tone="neutral">{p.tag}</Pill>
        ) : null
      }
      line2={[p.title, p.company].filter(Boolean).join(" · ")}
      line3={p.location}
      visitLabel="Profile"
      url={p.url}
    >
      {p.available && p.signal && (
        <div className="rounded-[10px] bg-[rgba(139,92,246,0.07)] px-3 py-[10px] text-[13.5px] leading-[1.55] text-[#25231F] dark:bg-[rgba(167,139,250,0.1)] dark:text-[#DEDCD7]">
          “{p.signal}”
          {(p.signal_source || p.signal_date) && (
            <div className="mt-1 text-[12px] text-[#6D3FD9] dark:text-[#B9A2FB]">
              {joinDot(p.signal_source, p.signal_date)}
            </div>
          )}
        </div>
      )}
      {p.tier === "unconfirmed" && !!p.unconfirmed?.length && (
        <div className="rounded-[10px] bg-[rgba(26,25,23,0.04)] px-3 py-[10px] text-[13.5px] leading-[1.55] text-[#5F5D57] dark:bg-[rgba(255,255,255,0.05)] dark:text-[#A6A39C]">
          Found in the search, but the evidence did not confirm{" "}
          {p.unconfirmed.join(", ")}. Worth a look at the profile.
        </div>
      )}
      {(!!p.matched?.length || conf || !!p.routes?.length) && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-x-5 gap-y-3">
          {!!p.matched?.length && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium uppercase tracking-[0.04em] text-[#8A877F] dark:text-[#7E7B74]">
                Matched
              </span>
              <div className="flex flex-wrap gap-[5px]">
                {p.matched.map((m) => (
                  <span
                    key={m}
                    className="rounded-[6px] border border-[rgba(26,25,23,0.12)] bg-white px-[7px] py-[2px] text-[12px] text-[#1A1917] dark:border-[rgba(255,255,255,0.12)] dark:bg-[#1F1E24] dark:text-[#ECEBE8]"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
          {conf && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium uppercase tracking-[0.04em] text-[#8A877F] dark:text-[#7E7B74]">
                Confidence
              </span>
              <div className="flex items-center gap-2">
                <div className="h-[5px] max-w-[110px] flex-1 overflow-hidden rounded-full bg-[rgba(26,25,23,0.1)] dark:bg-[rgba(255,255,255,0.12)]">
                  <div
                    className="h-full rounded-full bg-[#1A1917] dark:bg-[#ECEBE8]"
                    style={{ width: conf }}
                  />
                </div>
                <span className="text-[12.5px] tabular-nums text-[#1A1917] dark:text-[#ECEBE8]">
                  {conf}
                </span>
              </div>
            </div>
          )}
          {!!p.routes?.length && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium uppercase tracking-[0.04em] text-[#8A877F] dark:text-[#7E7B74]">
                Found via
              </span>
              <span className="text-[13px] text-[#1A1917] dark:text-[#ECEBE8]">
                {sentenceCase(p.routes.join(", "))}
              </span>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <PrimaryLink href={p.url}>Open LinkedIn profile</PrimaryLink>
        <SecondaryButton
          onClick={() =>
            onFollowUp(
              `Draft a short intro message I can send ${p.name}${
                p.title ? ` (${[p.title, p.company].filter(Boolean).join(" at ")})` : ""
              } on LinkedIn: ${p.url}`
            )
          }
        >
          Draft an intro message
        </SecondaryButton>
      </div>
      {contactLookup?.enabled && <ContactActions url={p.url} ctx={contactLookup} />}
    </ResultRow>
  );
};

const JobRow: React.FC<{
  j: JobResult;
  open: boolean;
  onToggle: () => void;
  onFollowUp: FollowUp;
}> = ({ j, open, onToggle, onFollowUp }) => {
  const check =
    j.verified === true
      ? { text: "Live", color: "bg-[#22A06B]" }
      : j.verified === false
        ? { text: "Blocked our check, open it to confirm", color: "bg-[#D08B2C]" }
        : null;
  const host = hostOf(j.url);
  return (
    <ResultRow
      open={open}
      onToggle={onToggle}
      avatar={
        <span className={`${avatarCls} rounded-[10px] text-[14px] font-semibold`}>
          {(j.company || j.title).charAt(0).toUpperCase()}
        </span>
      }
      title={j.title}
      badge={j.is_agency ? <Pill tone="neutral">Agency</Pill> : null}
      line2={joinDot(j.company, j.location)}
      line3={
        (j.salary || j.status_text) && (
          <>
            {j.salary && (
              <span className="font-medium text-[#1A1917] dark:text-[#ECEBE8]">
                {j.salary}
              </span>
            )}
            {j.salary && j.status_text && " · "}
            {j.status_text}
          </>
        )
      }
      visitLabel="Apply"
      url={j.url}
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-5 gap-y-3">
        {j.employment_type && <Field label="Type">{j.employment_type}</Field>}
        {j.posted_date && <Field label="Posted">{j.posted_date}</Field>}
        {j.source && <Field label="Source">{j.source}</Field>}
        {check && (
          <Field label="Link check">
            <span className="flex items-center gap-1.5">
              <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${check.color}`} />
              {check.text}
            </span>
          </Field>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <PrimaryLink href={j.url}>View advert on {host}</PrimaryLink>
        <SecondaryButton
          onClick={() =>
            onFollowUp(
              `Find the hiring manager for the ${j.title} role${
                j.company ? ` at ${j.company}` : ""
              }${j.location ? ` in ${j.location}` : ""}: ${j.url}`
            )
          }
        >
          Find the hiring manager
        </SecondaryButton>
      </div>
    </ResultRow>
  );
};

const PlaceRow: React.FC<{
  h: PlaceResult;
  open: boolean;
  onToggle: () => void;
  onFollowUp: FollowUp;
}> = ({ h, open, onToggle, onFollowUp }) => {
  const allMatch = h.misses.length === 0 && h.matches.length > 0;
  const period = pricePeriod(h.price);
  return (
    <ResultRow
      open={open}
      onToggle={onToggle}
      avatar={
        <div className={`${avatarCls} flex-col rounded-[10px] leading-[1.05]`}>
          <span className="text-[13px] font-semibold">{shortPrice(h.price)}</span>
          {period && (
            <span className="text-[9.5px] text-[#6E6B64] dark:text-[#96938C]">
              {period}
            </span>
          )}
        </div>
      }
      title={h.title}
      badge={allMatch ? <Pill tone="green">Meets all</Pill> : null}
      line2={joinDot(h.location, h.bills)}
      line3={joinDot(h.available_from, h.status_text)}
      visitLabel="Listing"
      url={h.url}
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-x-5 gap-y-3">
        {h.price && <Field label="Price">{h.price}</Field>}
        {h.furnished && <Field label="Furnished">{h.furnished}</Field>}
        {h.listed_by && <Field label="Listed by">{h.listed_by}</Field>}
        {h.source && <Field label="Source">{h.source}</Field>}
      </div>
      {(h.matches.length > 0 || h.misses.length > 0) && (
        <div className="flex flex-wrap gap-[5px]">
          {h.matches.map((m) => (
            <span
              key={`m-${m}`}
              className="flex items-center gap-1 rounded-[6px] bg-[rgba(34,140,90,0.08)] px-2 py-[3px] text-[12px] text-[#1C7A4D] dark:bg-[rgba(52,190,120,0.12)] dark:text-[#5FD39A]"
            >
              ✓ {m}
            </span>
          ))}
          {h.misses.map((m) => (
            <span
              key={`x-${m}`}
              className="flex items-center gap-1 rounded-[6px] bg-[rgba(224,72,15,0.08)] px-2 py-[3px] text-[12px] text-[#B8390B] dark:bg-[rgba(255,90,31,0.12)] dark:text-[#FF8A5C]"
            >
              ✕ {m}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <PrimaryLink href={h.url}>View on {h.source || hostOf(h.url)}</PrimaryLink>
        <SecondaryButton
          onClick={() =>
            onFollowUp(
              `What's the commute from ${h.title}${
                h.location ? ` in ${h.location}` : ""
              } to the data centre I'm looking at? Listing: ${h.url}`
            )
          }
        >
          Check the commute
        </SecondaryButton>
      </div>
    </ResultRow>
  );
};

// --- Group panel --------------------------------------------------------------

// Jobs arrive in two blocks: the ones on the company's own website, then
// everything else — boards, agencies, and the recruitment platforms employers
// rent. The order already carries that, but the candidate needs to see which is
// which, since applying on the company's own site means no middleman, so each
// block gets a heading — and only when both blocks are actually there.
const JOB_SECTIONS = {
  direct: "Company career pages",
  board: "Via job boards, platforms & agencies",
} as const;

const jobSection = (j: JobResult) => (j.source_type === "board" ? "board" : "direct");

const SectionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="border-b border-[rgba(26,25,23,0.07)] bg-[rgba(26,25,23,0.025)] px-4 py-[7px] text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[#6E6B64] dark:border-[rgba(255,255,255,0.07)] dark:bg-[rgba(255,255,255,0.03)] dark:text-[#96938C]">
    {children}
  </div>
);

const GROUP_META = {
  people: {
    label: "People",
    icon: (
      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[4px] bg-[#1A1917] text-[10px] font-bold text-white dark:bg-[#ECEBE8] dark:text-[#17161A]">
        in
      </span>
    ),
  },
  jobs: { label: "Jobs", icon: <Briefcase className="h-[15px] w-[15px]" /> },
  places: { label: "Places", icon: <Home className="h-[15px] w-[15px]" /> },
} as const;

export const ResultGroupCard: React.FC<{
  group: ResultGroup;
  onFollowUp: FollowUp;
  contactLookup?: ContactLookupCtx;
}> = ({ group, onFollowUp, contactLookup }) => {
  const n = group.items.length;
  // Folded by default except the first, so the strongest result is visible.
  const [open, setOpen] = React.useState<boolean[]>(() =>
    group.items.map((_, i) => i === 0)
  );
  const allOpen = open.every(Boolean);
  const toggle = (i: number) =>
    setOpen((o) => o.map((v, k) => (k === i ? !v : v)));
  const meta = GROUP_META[group.kind];
  // A single heading over the whole list says nothing, so the sections only
  // appear once there is something on both sides of the line.
  const splitJobs =
    group.kind === "jobs" &&
    group.items.some((j) => jobSection(j) === "direct") &&
    group.items.some((j) => jobSection(j) === "board");

  return (
    <div className="overflow-hidden rounded-[14px] border border-[rgba(26,25,23,0.12)] bg-white dark:border-[rgba(255,255,255,0.12)] dark:bg-[#1F1E24]">
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(26,25,23,0.09)] bg-[#F7F7F5] px-4 py-[11px] dark:border-[rgba(255,255,255,0.08)] dark:bg-[#141317]">
        <span className="flex items-center gap-2 text-[12.5px] font-medium text-[#5F5D57] dark:text-[#A6A39C]">
          {meta.icon}
          {meta.label} · {n} {n === 1 ? "result" : "results"}
        </span>
        {n > 1 && (
          <button
            type="button"
            onClick={() => setOpen(group.items.map(() => !allOpen))}
            className="px-1 py-[2px] text-[12.5px] text-[#6E6B64] transition-colors hover:text-[#1A1917] dark:text-[#96938C] dark:hover:text-[#ECEBE8]"
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>
      <div className="-mb-px">
        {group.kind === "people" &&
          group.items.map((p, i) => (
            <PersonRow
              key={p.url}
              p={p}
              open={open[i]}
              onToggle={() => toggle(i)}
              onFollowUp={onFollowUp}
              contactLookup={contactLookup}
            />
          ))}
        {group.kind === "jobs" &&
          group.items.map((j, i) => {
            const section = jobSection(j);
            const showHeader =
              splitJobs && (i === 0 || jobSection(group.items[i - 1]) !== section);
            return (
              <React.Fragment key={j.url}>
                {showHeader && <SectionHeader>{JOB_SECTIONS[section]}</SectionHeader>}
                <JobRow
                  j={j}
                  open={open[i]}
                  onToggle={() => toggle(i)}
                  onFollowUp={onFollowUp}
                />
              </React.Fragment>
            );
          })}
        {group.kind === "places" &&
          group.items.map((h, i) => (
            <PlaceRow
              key={h.url}
              h={h}
              open={open[i]}
              onToggle={() => toggle(i)}
              onFollowUp={onFollowUp}
            />
          ))}
      </div>
    </div>
  );
};

// "Searched LinkedIn · 14 profiles checked · 5 matched", opening to the steps.
export const ToolSummary: React.FC<{ summary: ResultSummary }> = ({ summary }) => {
  const [open, setOpen] = React.useState(false);
  const hasSteps = summary.steps.length > 0;
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => hasSteps && setOpen((v) => !v)}
        aria-expanded={hasSteps ? open : undefined}
        className="flex items-center gap-2 self-start py-1 text-left text-[13.5px] text-[#6E6B64] transition-colors hover:text-[#1A1917] dark:text-[#96938C] dark:hover:text-[#ECEBE8]"
      >
        <Search className="h-[14px] w-[14px] shrink-0" strokeWidth={2.2} />
        <span>{summary.label}</span>
        {hasSteps && (
          <ChevronDown
            className={`h-[14px] w-[14px] shrink-0 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        )}
      </button>
      {open && (
        <div className="chat-unfold mb-[2px] ml-1.5 mt-1.5 flex flex-col gap-2 border-l-[1.5px] border-[rgba(26,25,23,0.12)] py-[2px] pl-4 text-[13px] leading-[1.5] text-[#6E6B64] dark:border-[rgba(255,255,255,0.14)] dark:text-[#96938C]">
          {summary.steps.map(([label, text]) => (
            <div key={label}>
              <span className="text-[#1A1917] dark:text-[#ECEBE8]">{label}</span> ·{" "}
              {text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Plain-text version of the cards, for Copy and for the model's view of
// earlier turns (it never saw the list as text, but later turns refer to it).
export function resultsToText(results: ResultGroup[]): string {
  return results
    .map((g) => {
      const lines =
        g.kind === "people"
          ? g.items.map((p) =>
              `- ${joinDot(p.name, [p.title, p.company].filter(Boolean).join(" at "), p.location, p.available ? "open to work" : "")} — ${p.url}`
            )
          : g.kind === "jobs"
            ? g.items.map((j) =>
                `- ${joinDot(
                  j.title,
                  j.company,
                  j.location,
                  j.salary,
                  j.is_agency
                    ? "agency"
                    : jobSection(j) === "direct"
                      ? "direct"
                      : "job board"
                )} — ${j.url}`
              )
            : g.items.map((h) =>
                `- ${joinDot(h.title, h.location, h.price, h.bills)} — ${h.url}`
              );
      return `${GROUP_META[g.kind].label}:\n${lines.join("\n")}`;
    })
    .join("\n\n");
}
