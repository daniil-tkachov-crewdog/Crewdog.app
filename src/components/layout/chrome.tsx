import React from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

// Live-text wordmark: "Crew" in ink, "Dog" in accent. No image asset.
export const Wordmark: React.FC<{ className?: string }> = ({ className }) => (
  <span
    className={`flex items-baseline gap-[2px] font-grotesk text-[18px] font-bold tracking-[-0.02em] text-[#1A1917] dark:text-[#ECEBE8] ${className ?? ""}`}
  >
    Crew<span className="text-[#E0480F] dark:text-[#FF5A1F]">Dog</span>
  </span>
);

export const ThemeToggle: React.FC<{ className?: string }> = ({ className }) => {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-[#6E6B64] transition-[background] duration-150 hover:bg-[rgba(26,25,23,0.06)] dark:text-[#96938C] dark:hover:bg-[rgba(255,255,255,0.07)] ${className ?? ""}`}
    >
      {mounted && isDark ? (
        <Sun className="h-[18px] w-[18px]" />
      ) : (
        <Moon className="h-[18px] w-[18px]" />
      )}
    </button>
  );
};
