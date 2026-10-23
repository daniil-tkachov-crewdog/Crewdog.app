// client/App.tsx
//
// The application shell: providers, the router, and the two things that sit
// outside every page (scroll restoration and the consent banner).
//
// The routes themselves are in routes.tsx. Provider nesting order matters —
// AuthProvider wraps the router because the route guards read the session,
// and both toasters sit above it so a page can raise one while navigating.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import ScrollToTop from "@/components/layout/ScrollToTop";
import ConsentBanner from "@/components/layout/ConsentBanner";
import { AuthProvider } from "@/features/auth/AuthProvider";
import usePageViews from "@/core/analytics/usePageViews";
import { AppRoutes } from "@/routes";

const queryClient = new QueryClient();

/**
 * Reports client-side navigations to /api/track. Rendered rather than called
 * from App because the hook needs to be inside the router to see location
 * changes.
 */
function AnalyticsBoot() {
  usePageViews();
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AnalyticsBoot />
            <ScrollToTop />
            <AppRoutes />
            <ConsentBanner />
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
