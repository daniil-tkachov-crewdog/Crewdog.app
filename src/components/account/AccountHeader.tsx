// src/components/account/AccountHeader.tsx
import type { AccountUser } from "@/types/account";
import type { NormalizedSummary } from "@/services/account";
import { CARD, PANEL, SECTION_LABEL, SECONDARY, MUTED } from "./ui";

export default function AccountHeader({
  user,
  summary,
}: {
  user: AccountUser;
  summary: NormalizedSummary | null | undefined;
}) {
  const pro = summary?.pro ?? false;
  const unlimited = summary?.unlimited ?? false;

  const planLabel = unlimited
    ? "Admin"
    : summary?.planLabel ?? (pro ? "Pro" : "Free");

  const searchesUsed = summary?.used ?? user.quota?.used ?? 0;

  return (
    <div className={`px-6 py-7 sm:px-8 ${CARD}`}>
      <span className={SECTION_LABEL}>Your account</span>

      <div className="mt-5 flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-5">
          {/* Avatar */}
          <div className="flex h-[72px] w-[72px] flex-shrink-0 items-center justify-center rounded-full bg-[#E0480F] text-[30px] font-bold text-white dark:bg-[#FF5A1F] dark:text-[#0B0B0F]">
            {user.name.charAt(0).toUpperCase()}
          </div>

          {/* Info */}
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-semibold tracking-[-0.02em]">{user.name}</h1>
              <span className="rounded-full border border-[#E0480F]/40 px-[10px] py-[3px] text-[11px] font-medium uppercase tracking-[0.04em] text-[#E0480F] dark:border-[#FF5A1F]/40 dark:text-[#FF5A1F]">
                {planLabel}
              </span>
            </div>
            <p className={`mt-1 text-[15px] ${SECONDARY}`}>{user.email}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid w-full grid-cols-2 gap-3 sm:w-auto">
          {[
            { label: "Searches", value: searchesUsed },
            { label: "Tier", value: planLabel },
          ].map((s) => (
            <div key={s.label} className={`px-6 py-4 text-center ${PANEL}`}>
              <div className="text-[24px] font-semibold text-[#1A1917] dark:text-[#ECEBE8]">
                {s.value}
              </div>
              <div className={`mt-1 text-[11px] uppercase tracking-[0.06em] ${MUTED}`}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
