// client/features/admin/AdminPage.tsx
//
// The admin console: a tab strip over six panels. Reached only through
// RequireAdmin, and everything it reads and writes is additionally protected
// by RLS on the tables behind it.

import { useState } from "react";
import WebTrafficTab from "@/features/admin/tabs/WebTrafficTab";
import UsersTab from "@/features/admin/tabs/UsersTab";
import ApiTab from "@/features/admin/tabs/ApiTab";
import PromptsTab from "@/features/admin/tabs/PromptsTab";
import AgentTab from "@/features/admin/tabs/AgentTab";
import SeoTab from "@/features/admin/tabs/SeoTab";

const TABS = ["Web Traffic", "Users", "API", "Prompts", "AI Agent", "SEO"] as const;
type Tab = (typeof TABS)[number];

const Admin = () => {
  const [active, setActive] = useState<Tab>("Users");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b py-4">
        <h1 className="text-center text-xl font-semibold">
          Crewdog.app - Admin
        </h1>
      </header>

      <nav className="border-b">
        <div className="flex justify-center gap-2 px-4">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active === tab
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </nav>

      <main className="p-6">
        {active === "Web Traffic" && <WebTrafficTab />}
        {active === "Users" && <UsersTab />}
        {active === "API" && <ApiTab />}
        {active === "Prompts" && <PromptsTab />}
        {active === "AI Agent" && <AgentTab />}
        {active === "SEO" && <SeoTab />}
      </main>
    </div>
  );
};

export default Admin;
