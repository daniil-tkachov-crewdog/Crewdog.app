// Shared styling tokens for the Account page, aligned to the /chat redesign.
// Space Grotesk everywhere, warm neutrals, accent #E0480F (light) / #FF5A1F (dark),
// soft rounded corners, subtle hover washes, full light + dark support.

export const CARD =
  "rounded-[14px] border border-[rgba(26,25,23,0.1)] bg-white dark:border-[rgba(255,255,255,0.1)] dark:bg-[#1F1E24]";

export const PANEL =
  "rounded-[12px] border border-[rgba(26,25,23,0.08)] bg-[#F7F7F5] p-4 dark:border-[rgba(255,255,255,0.07)] dark:bg-[#141317]";

export const INPUT =
  "w-full rounded-[10px] border border-[rgba(26,25,23,0.14)] bg-white px-[14px] py-[11px] text-[15px] text-[#1A1917] transition-colors placeholder:text-[#6E6B64] focus:border-[#E0480F] focus:outline-none dark:border-[rgba(255,255,255,0.12)] dark:bg-[#17161A] dark:text-[#ECEBE8] dark:placeholder:text-[#96938C] dark:focus:border-[#FF5A1F]";

// Primary action: ink fill that shifts to accent on hover (mirrors the chat send button).
export const BTN_PRIMARY =
  "rounded-[10px] bg-[#1A1917] px-[18px] py-[10px] text-[14px] font-medium text-white transition-[transform,background,color] duration-200 hover:-translate-y-[1px] hover:bg-[#E0480F] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#ECEBE8] dark:text-[#17161A] dark:hover:bg-[#FF5A1F] dark:hover:text-white";

// Prominent CTA: accent fill.
export const BTN_ACCENT =
  "rounded-[10px] bg-[#E0480F] px-[18px] py-[10px] text-[14px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#FF5A1F] dark:text-[#0B0B0F]";

export const BTN_GHOST =
  "rounded-[10px] border border-[rgba(26,25,23,0.14)] px-[18px] py-[10px] text-[14px] font-medium text-[#1A1917] transition-colors hover:border-[rgba(26,25,23,0.26)] hover:bg-[rgba(26,25,23,0.04)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[rgba(255,255,255,0.12)] dark:text-[#ECEBE8] dark:hover:border-[rgba(255,255,255,0.24)] dark:hover:bg-[rgba(255,255,255,0.05)]";

// Small caps section label (replaces the "// section" mono tags).
export const SECTION_LABEL =
  "text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#6E6B64] dark:text-[#96938C]";

export const FIELD_LABEL =
  "mb-[10px] block text-[12px] font-medium tracking-[0.02em] text-[#6E6B64] dark:text-[#96938C]";

export const MUTED = "text-[#6E6B64] dark:text-[#96938C]";
export const SECONDARY = "text-[#5F5D57] dark:text-[#A6A39C]";
export const ACCENT = "text-[#E0480F] dark:text-[#FF5A1F]";
export const BORDER = "border-[rgba(26,25,23,0.1)] dark:border-[rgba(255,255,255,0.1)]";
