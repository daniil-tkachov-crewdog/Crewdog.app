// client/features/account/fixtures/account.mock.ts
//
// Placeholder content for the account screen.
//
// makeUser() is live — the account page calls it for the header and plan
// label, filling in the real name and email from the session. The three
// lists below it are not: they are design fixtures for the achievements,
// activity and history sections, and nothing imports them. Real history
// comes from api/history.ts.

import { Award, Briefcase, Crown, Star, Target } from "lucide-react";
import type {
  AccountUser,
  Achievement,
  ActivityItem,
  SearchItem,
} from "@/features/account/fixtures/account.types";

export const makeUser = (authUser?: {
  name?: string | null;
  email?: string | null;
}): AccountUser => ({
  name: authUser?.name || "User",
  email: authUser?.email || "",
  plan: "Free",
  quota: { used: 2, total: 3 },
  subscriptionStatus: "active",
  renewalDate: "February 1, 2025",
  memberSince: "January 2024",
  totalSearches: 47,
  successRate: 92,
});

export const accountSearches: SearchItem[] = [
  {
    id: 1,
    date: "2025-01-15",
    company: "TechCorp Industries",
    status: "completed",
    results: 23,
    duration: "2.3s",
  },
  {
    id: 2,
    date: "2025-01-10",
    company: "Digital Solutions Ltd",
    status: "completed",
    results: 18,
    duration: "1.8s",
  },
  {
    id: 3,
    date: "2025-01-05",
    company: "Innovation Labs",
    status: "completed",
    results: 31,
    duration: "2.1s",
  },
];

export const accountAchievements: Achievement[] = [
  {
    icon: Star,
    name: "First Search",
    description: "Completed your first job search",
    unlocked: true,
  },
  {
    icon: Target,
    name: "10 Searches",
    description: "Reached 10 successful searches",
    unlocked: true,
  },
  {
    icon: Award,
    name: "Power User",
    description: "Used the platform for 30 days",
    unlocked: false,
  },
  {
    icon: Crown,
    name: "Premium Member",
    description: "Upgraded to premium",
    unlocked: false,
  },
];

export const accountActivity: ActivityItem[] = [
  {
    action: "Searched for jobs at TechCorp",
    time: "2 hours ago",
    icon: Briefcase,
  },
  { action: "Updated profile information", time: "1 day ago", icon: Crown }, // you can swap icon if you prefer User
  { action: "Upgraded to Premium", time: "3 days ago", icon: Crown },
];
