import { useEffect, useState } from "react";

// Small-screen detection for mobile-specific layouts. Uses matchMedia so the
// layout responds to rotation / window resizing, not just the initial load.
const MOBILE_QUERY = "(max-width: 768px)";

export function useIsMobile(query = MOBILE_QUERY) {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
