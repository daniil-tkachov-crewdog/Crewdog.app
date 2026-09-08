// src/pages/account.tsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HelpCircle, History, Settings, User } from "lucide-react";
import { Wordmark, ThemeToggle } from "@/components/layout/chrome";
import { CARD } from "@/components/account/ui";
import DownsellModal from "@/components/account/DownsellModal";
import CancelSurveyModal from "@/components/account/CancelSurveyModal";
import SupportForm from "@/components/account/SupportForm";
import { makeUser } from "@/data/account.mock";
import AccountHeader from "@/components/account/AccountHeader";
import ProfileInfo from "@/components/account/ProfileInfo";
import SubscriptionCard from "@/components/account/SubscriptionCard";
import SearchHistory from "@/components/account/SearchHistory";
import SecuritySection from "@/components/account/SecuritySection";
import {
  fetchAccountSummary,
  type NormalizedSummary,
} from "@/services/account";
import { cancelSubscription } from "@/services/billing";

export default function AccountPage() {
  const navigate = useNavigate();
  const { user: authUser, signOut } = useAuth();

  const [activeTab, setActiveTab] = useState<
    "general" | "history" | "settings" | "support"
  >("general");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDownsellModal, setShowDownsellModal] = useState(false);
  const [summary, setSummary] = useState<NormalizedSummary | null>(null);

  const user = makeUser(authUser);

  const refreshSummary = async () => {
    try {
      const s = await fetchAccountSummary();
      setSummary(s);
    } catch {
      /* noop */
    }
  };

  useEffect(() => {
    refreshSummary();
    const onVis = () => {
      if (document.visibilityState === "visible") refreshSummary();
    };
    document.addEventListener("visibilitychange", onVis);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("gc-activity");
      bc.addEventListener("message", (e) => {
        if (e?.data?.type === "search_used") refreshSummary();
      });
    } catch {}
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      bc?.close();
    };
  }, []);

  const handleStartCancel = () => {
    if (summary?.pro || user.plan !== "Free") {
      setShowCancelModal(true);
    }
  };
  const handleCancelContinue = async () => {
    setShowCancelModal(false);

    // Check if user is platinum
    const planLabel = summary?.planLabel ?? user.plan;
    const isPlatinum = planLabel?.toLowerCase().includes("platinum");

    if (isPlatinum) {
      // Platinum users: show downsell modal with downgrade option
      setShowDownsellModal(true);
    } else {
      // Other pro users: call cancel API direct
      try {
        await cancelSubscription();
        toast.success(
          "Cancellation scheduled. You keep access and credits until your current period ends."
        );
        await refreshSummary();
      } catch (e: any) {
        toast.error(e?.message || "Cancel failed.");
      }
    }
  };
  const handleCancelFinalize = async () => {
    setShowDownsellModal(false);
    await refreshSummary();
    toast.success("Subscription cancelled successfully");
  };
  const handleAcceptDownsell = async () => {
    setShowDownsellModal(false);
    await refreshSummary();
    toast.success("Subscription downgraded to £2/month");
  };

  const tabCls =
    "flex items-center justify-center gap-2 rounded-[10px] px-3 py-[9px] text-[13px] font-medium transition-colors data-[state=active]:bg-[rgba(26,25,23,0.07)] data-[state=active]:text-[#1A1917] data-[state=inactive]:text-[#6E6B64] data-[state=inactive]:hover:bg-[rgba(26,25,23,0.05)] dark:data-[state=active]:bg-[rgba(255,255,255,0.09)] dark:data-[state=active]:text-[#ECEBE8] dark:data-[state=inactive]:text-[#96938C] dark:data-[state=inactive]:hover:bg-[rgba(255,255,255,0.05)]";

  return (
    <div className="flex min-h-screen flex-col bg-white font-grotesk text-[#1A1917] dark:bg-[#17161A] dark:text-[#ECEBE8]">
      <header className="flex h-14 shrink-0 items-center justify-between px-6">
        <Link to="/chat">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-1">
          <Link
            to="/run"
            className="rounded-lg px-3 py-[6px] text-[13px] text-[#6E6B64] transition-colors hover:text-[#1A1917] dark:text-[#96938C] dark:hover:text-[#ECEBE8]"
          >
            ← Dashboard
          </Link>
          <ThemeToggle />
          <button
            onClick={async () => {
              await signOut();
              toast.success("Logged out successfully");
              navigate("/");
            }}
            className="rounded-lg px-3 py-[6px] text-[13px] text-[#6E6B64] transition-colors hover:text-[#E0480F] dark:text-[#96938C] dark:hover:text-[#FF5A1F]"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="flex-1 pb-16 pt-6">
        <div className="mx-auto w-full max-w-[1040px] px-6">
          <AccountHeader user={user} summary={summary} />

          <div className={`mt-6 px-5 py-6 sm:px-7 ${CARD}`}>
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as typeof activeTab)}
            >
              <TabsList className="mb-8 grid h-auto w-full grid-cols-4 gap-1 bg-transparent p-0">
                <TabsTrigger value="general" className={tabCls}>
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">Profile</span>
                </TabsTrigger>
                <TabsTrigger value="history" className={tabCls}>
                  <History className="h-4 w-4" />
                  <span className="hidden sm:inline">Activity</span>
                </TabsTrigger>
                <TabsTrigger value="settings" className={tabCls}>
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">Settings</span>
                </TabsTrigger>
                <TabsTrigger value="support" className={tabCls}>
                  <HelpCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Help</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-10">
                <ProfileInfo user={user} />
                <SubscriptionCard
                  user={user}
                  summary={summary}
                  onRefresh={refreshSummary}
                  onCancel={handleStartCancel}
                />
              </TabsContent>

              <TabsContent value="history" className="space-y-8">
                <SearchHistory />
              </TabsContent>

              <TabsContent value="settings" className="space-y-8">
                <SecuritySection />
              </TabsContent>

              <TabsContent value="support" className="space-y-8">
                <SupportForm userEmail={user.email} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      <CancelSurveyModal
        open={showCancelModal}
        onOpenChange={setShowCancelModal}
        onContinue={handleCancelContinue}
      />
      <DownsellModal
        open={showDownsellModal}
        onOpenChange={setShowDownsellModal}
        onAccept={handleAcceptDownsell}
        onCancelAnyway={handleCancelFinalize}
      />
    </div>
  );
}
