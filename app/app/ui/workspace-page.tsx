import { useEffect, useRef, type ReactNode } from "react";
import type { Screen } from "../../lib/screens";

export function WorkspacePage({ screen, children }: { screen: Screen; children: ReactNode }) {
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    // End the entrance window before later data updates or tab changes insert new panels.
    const timeout = window.setTimeout(() => page?.removeAttribute("data-page-entering"), 240);
    return () => window.clearTimeout(timeout);
  }, []);

  return <div ref={pageRef} className="page-enter" data-screen={screen} data-page-entering="">{children}</div>;
}
