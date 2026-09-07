import { useState } from "react";

const TABS = ["Users", "API", "Prompts", "Settings"] as const;
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
        {/* Placeholder content — tabs intentionally empty for now */}
      </main>
    </div>
  );
};

export default Admin;
