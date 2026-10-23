// src/types/account.ts

export type Price = {
  amount?: number;
  currency?: string;
  interval?: "month" | "year";
};

export type SummaryRaw = {
  status?: string;
  renewalDate?: string | null;
  creditsRemaining?: number | null;
  remainingCredits?: number | null;
  searchCap?: number;
  cap?: number;
  searches?: { cap?: number; used?: number; remaining?: number };
  quota?: { cap?: number; used?: number; remaining?: number };
  used?: number;
  price?: Price;
  cancelAtPeriodEnd?: boolean;
  unlimited?: boolean;
  isAdmin?: boolean;
};

export type NormalizedSummary = {
  pro: boolean;
  unlimited: boolean;
  isAdmin: boolean;
  cap: number;
  used: number;
  remaining: number | null;
  renewalDate: string | null;
  cancelAtPeriodEnd: boolean;
  price?:
    | { amount: number; currency: string; interval: "month" | "year" }
    | undefined;
  status?: string;

  planCode?: string; // 'platinum' | 'silver' | 'gold' | 'business' | 'retention' | 'legacy_pro' | ...
  planLabel?: string; // 'Platinum' | 'Silver' | 'Gold' | 'Business' | 'Retention' | 'Free' | 'Admin' | 'Pro'
};

export type ContactStatus = "none" | "requested" | "accepted" | "messaged";

export type SearchContact = {
  name?: string;
  profileUrl?: string;
  title?: string;
  status?: ContactStatus;
};

export type SearchRow = {
  id: string;
  jobTitle?: string;
  companyName?: string;
  companyUrl?: string;
  jdExcerpt?: string;
  jdRaw?: string;
  createdAt?: string;
  sourceType?: string;
  sourceUrl?: string;
  whyCompany?: string;
  location?: string;
  isImportant?: boolean;
  contactStatuses?: Record<string, ContactStatus>;
  hrContacts?: SearchContact[];
  potentialLeads?: SearchContact[];
};

export type HistoryResp = {
  ok: boolean;
  items: SearchRow[];
  nextCursor?: string | null;
};

export type AccountUser = {
  // Optional because the only producer of this object, makeUser() in
  // src/data/account.mock.ts, does not set it, and no consumer reads it —
  // AccountHeader, ProfileInfo and SubscriptionCard use name, email, quota
  // and renewalDate only. Declaring it required made every call site a type
  // error that went unreported while account.types.ts was missing.
  id?: string;
  name: string;
  email: string;
  plan: "Free" | "Pro" | "Admin" | string;
  renewalDate?: string | null;
  quota: {
    used: number;
    total: number;
  };
};
