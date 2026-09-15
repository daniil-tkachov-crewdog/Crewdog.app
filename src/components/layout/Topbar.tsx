import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/auth/AuthProvider";

function Wordmark() {
  return (
    <span className="flex items-baseline gap-[2px] text-[24px] font-bold tracking-[-0.02em] text-white">
      Crew<b className="font-bold text-[#FF5A1F]">Dog</b>
      <span className="ml-[5px]">DC</span>
    </span>
  );
}

const linkCls =
  "font-['IBM_Plex_Mono',monospace] text-[13px] uppercase tracking-[0.06em] transition-colors";

export const Topbar = () => {
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu when route changes
  useEffect(() => {
    if (isMobileMenuOpen) setIsMobileMenuOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const isActive = (path: string) =>
    location.pathname === path ? "text-white" : "text-[#6F6C78] hover:text-white";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#0B0B0F] font-['Space_Grotesk',system-ui,sans-serif]">
      <div className="mx-auto flex w-full max-w-[1040px] items-center justify-between px-6 py-[18px]">
        {/* Logo */}
        <Link to="/" aria-label="Go to homepage">
          <Wordmark />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-7 md:flex">
          <Link to="/account" className={`${linkCls} ${isActive("/account")}`}>
            {isAuthenticated ? user?.name || user?.email : "Account"}
          </Link>

          {!isAuthenticated && (
            <>
              <Link to="/login" className={`${linkCls} ${isActive("/login")}`}>
                Login
              </Link>
              <Link
                to="/run"
                className="rounded-[2px] bg-[#FF5A1F] px-[18px] py-[10px] font-['IBM_Plex_Mono',monospace] text-[13px] font-semibold tracking-[0.04em] text-[#0B0B0F] transition-transform hover:-translate-y-px"
              >
                Get started
              </Link>
            </>
          )}
        </nav>

        {/* Mobile menu button */}
        <button
          className="text-white md:hidden"
          onClick={() => setIsMobileMenuOpen((v) => !v)}
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-menu"
          aria-label="Toggle navigation menu"
        >
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div
          id="mobile-menu"
          className="border-t border-white/10 bg-[#0B0B0F] md:hidden"
        >
          <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-4 px-6 py-6">
            <Link to="/account" className={`${linkCls} ${isActive("/account")}`}>
              {isAuthenticated ? user?.name || user?.email : "Account"}
            </Link>
            {!isAuthenticated && (
              <>
                <Link to="/login" className={`${linkCls} ${isActive("/login")}`}>
                  Login
                </Link>
                <Link
                  to="/run"
                  className="inline-block w-fit rounded-[2px] bg-[#FF5A1F] px-[18px] py-[10px] font-['IBM_Plex_Mono',monospace] text-[13px] font-semibold tracking-[0.04em] text-[#0B0B0F]"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
