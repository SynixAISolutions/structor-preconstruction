"use client";

import { Fragment, type ComponentType } from "react";
import { ArrowLeft } from "lucide-react";
import { SidebarGroup } from "./sidebar-controls";
import { ARCHITECT_VIEW, PORTAL_PREVIEW_SCREEN, SCREEN_GROUPS, type Screen, type ScreenDef } from "../../lib/screens";

export function SidebarNavigation({ screen, projectOpen, navigate, icon: Icon }: {
  screen: Screen;
  projectOpen: boolean;
  navigate: (screen: Screen) => void;
  icon: ComponentType<{ name: string; size: number; id?: Screen }>;
}) {
  function entry(item: ScreenDef) {
    return <button key={item.id} className={screen === item.id ? "active" : ""} onClick={() => navigate(item.id)} aria-current={screen === item.id ? "page" : undefined}>
      <Icon id={item.id} name={item.icon} size={17}/><span>{item.label}</span>{item.count && <small>{item.count}</small>}
    </button>;
  }
  if (screen === "architect") return <nav aria-label="Main navigation"><button className="nav-back" onClick={()=>navigate("specs")}><ArrowLeft size={16}/>Return to contractor view</button><SidebarGroup label="ARCHITECT VIEW">{entry(ARCHITECT_VIEW.items[0])}</SidebarGroup></nav>;
  return <nav aria-label="Main navigation">
    {projectOpen && <button className="nav-back" onClick={() => navigate("projects")}><ArrowLeft size={16}/>Back to All projects</button>}
    {SCREEN_GROUPS.filter(group => group.scope === (projectOpen ? "project" : "global")).map(group => {
      const blocks: { section?: string; items: ScreenDef[] }[] = [];
      for (const item of group.items) {
        const previous = blocks.at(-1);
        if (item.section && previous?.section === item.section) previous.items.push(item);
        else blocks.push({ section: item.section, items: [item] });
      }
      return <SidebarGroup key={group.label} label={group.label}>
        {blocks.map(block => block.section
          ? <SidebarGroup key={block.items[0].id} label={block.section} section>{block.items.map(entry)}</SidebarGroup>
          : <Fragment key={block.items[0].id}>{block.items.map(entry)}</Fragment>)}
      </SidebarGroup>;
    })}
    {projectOpen && <div className="nav-group nav-preview"><button className={screen === PORTAL_PREVIEW_SCREEN.id ? "active" : ""} aria-current={screen === PORTAL_PREVIEW_SCREEN.id ? "page" : undefined} onClick={() => navigate(PORTAL_PREVIEW_SCREEN.id)}><Icon id={PORTAL_PREVIEW_SCREEN.id} name={PORTAL_PREVIEW_SCREEN.icon} size={17}/><span>Preview as subcontractor</span></button><button onClick={()=>navigate("architect")}><Icon name="BookOpenText" size={17}/><span>Preview as architect</span></button></div>}
  </nav>;
}
