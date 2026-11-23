import { ChevronDown, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ReactNode } from "react";

export function SidebarGroup({ label, children, section = false }: {
  label: string;
  children: ReactNode;
  section?: boolean;
}) {
  return (
    <details className={section ? "nav-section sidebar-group" : "nav-group sidebar-group"}>
      <summary className={section ? "nav-section-label" : "nav-label"}>
        <span>{label}</span><ChevronDown size={13} aria-hidden="true" />
      </summary>
      {children}
    </details>
  );
}

export function SidebarToggle({ expanded, onToggle, mobile = false }: {
  expanded: boolean;
  onToggle: () => void;
  mobile?: boolean;
}) {
  const Icon = mobile ? Menu : expanded ? PanelLeftClose : PanelLeftOpen;
  const label = expanded ? "Close navigation" : "Open navigation";
  return (
    <button type="button" className={mobile ? "ui-icon-btn mobile-menu" : "ui-icon-btn nav-toggle-desktop"}
      aria-label={label} title={label} aria-controls="workspace-navigation" aria-expanded={expanded} onClick={onToggle}>
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
