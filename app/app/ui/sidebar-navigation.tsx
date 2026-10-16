"use client";

import { Fragment, type ComponentType } from "react";
import { ArrowLeft } from "lucide-react";
import { ARCHITECT_PREVIEW_SCREEN, PORTAL_PREVIEW_SCREEN, SCREEN_GROUPS, type Screen, type ScreenDef } from "../../lib/screens";

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
  return <nav aria-label="Main navigation">
    {projectOpen && <button className="nav-back" onClick={() => navigate("projects")}><ArrowLeft size={16}/>Back to All projects</button>}
    {SCREEN_GROUPS.filter(group => group.scope === (projectOpen ? "project" : "global")).map(group => {
      const blocks: { section?: string; items: ScreenDef[] }[] = [];
      for (const item of group.items) {
        const previous = blocks.at(-1);
        if (item.section && previous?.section === item.section) previous.items.push(item);
        else blocks.push({ section: item.section, items: [item] });
      }
      return <div className="nav-group" key={group.label}><span className="nav-label">{group.label}</span>
        {blocks.map(block => block.section
          ? <div className="nav-section" role="group" aria-label={block.section} key={block.items[0].id}><span className="nav-section-label">{block.section}</span>{block.items.map(entry)}</div>
          : <Fragment key={block.items[0].id}>{block.items.map(entry)}</Fragment>)}
      </div>;
    })}
    {projectOpen && <div className="nav-group nav-preview"><button className={screen === PORTAL_PREVIEW_SCREEN.id ? "active" : ""} aria-current={screen === PORTAL_PREVIEW_SCREEN.id ? "page" : undefined} onClick={() => navigate(PORTAL_PREVIEW_SCREEN.id)}><Icon id={PORTAL_PREVIEW_SCREEN.id} name={PORTAL_PREVIEW_SCREEN.icon} size={17}/><span>Preview as subcontractor</span></button><button className={screen === ARCHITECT_PREVIEW_SCREEN.id ? "active" : ""} aria-current={screen === ARCHITECT_PREVIEW_SCREEN.id ? "page" : undefined} onClick={() => navigate(ARCHITECT_PREVIEW_SCREEN.id)}><Icon id={ARCHITECT_PREVIEW_SCREEN.id} name={ARCHITECT_PREVIEW_SCREEN.icon} size={17}/><span>Preview as architect</span></button></div>}
  </nav>;
}
