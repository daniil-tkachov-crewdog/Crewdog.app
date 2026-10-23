// client/components/layout/ScrollToTop.tsx
//
// Puts a client-side navigation back at the top of the page.
//
// The browser restores scroll position on a real page load, but a router
// navigation is not one: without this, following a footer link from halfway
// down a long page lands halfway down the next one. Renders nothing.

import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
