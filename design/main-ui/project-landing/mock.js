// Main UI mockups: shared behaviour and charts. Static design files, not app code.
// Navigation is copied from app/lib/screens.ts (labels, groups and sections unchanged). Numbers are sample data for Project 1.

const NAV = {
  workspace: { label: "WORKSPACE", items: ["All projects", "Subcontractor directory", "Subcontractor ratings", "Subcontractor aggregate limits", "Estimator workload", "Unit cost database", "AI memory"] },
  preconstruction: { label: "PRECONSTRUCTION", items: ["Preconstruction to-do", "Project information", "Project files", "RFP requirements", "Scopes & bid forms", "Drawing Flip", "Revision comparison", "Structor Check & RFIs", "Contract comparison",
    ["Subcontractor outreach", "Bid packages", "Bid leveling", "Compliance"],
    ["Preconstruction budget", "Quantity takeoffs", "Budget summary", "Allowances", "Value engineering", "Assumptions & clarifications"],
    ["3D model studio", "Interior finishes", "MEP coordination", "Structural model", "Exterior model"]] },
  contracts: { label: "CONTRACTS & PROCUREMENT", items: ["Scope review & buyout", "Contracts", "Exhibits", "List of drawings", "List of specifications"] },
  operations: { label: "OPERATIONS", items: ["Project schedule", "Submittal packages"] },
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const svg = (w, h, body) => `<svg viewBox="0 0 ${w} ${h}" role="img" aria-hidden="true">${body}</svg>`;

// ---------- Charts (same data in every variation) ----------
const CHARTS = {
  // Bid deadline: milestone marks on a 19 Jan to 2 Feb axis (like Ref 1's "Activity" rows).
  timeline() {
    const x = d => 50 + d * (106 / 14), rows = [["RFIs", 16, [0, 1, 8]], ["Scopes", 38, [1, 6, 7]], ["Bids", 60, [10, 12, 14]]];
    let b = "";
    rows.forEach(([name, y, days]) => {
      b += `<text x="40" y="${y + 4}" text-anchor="end" font-size="9">${name}</text>`;
      days.forEach((d, i) => { const w = i === days.length - 1 ? 9 : 6; b += `<rect x="${x(d) - w / 2}" y="${y - 7}" width="${w}" height="14" rx="2.5" fill="${d === 14 ? "#ff9a6e" : "#ec7444"}" opacity="${d === 14 ? 1 : .85}"/>`; });
    });
    [["19", 0], ["23", 4], ["27", 8], ["2 Feb", 14]].forEach(([t, d]) => b += `<text x="${x(d)}" y="84" text-anchor="middle" font-size="8.5">${t}</text>`);
    return svg(166, 88, b);
  },
  // Bids received: cumulative invited (amber) vs received (lime) step lines (like Ref 1's "Sleep").
  steps() {
    const inv = [2, 6, 6, 14, 14, 20, 24, 24], got = [0, 0, 2, 5, 9, 12, 16, 18], X = i => 26 + i * 17, Y = v => 66 - v * 2.3;
    const path = arr => arr.reduce((p, v, i) => i === 0 ? `M${X(0)} ${Y(v)}` : p + ` H${X(i) - 5} C${X(i) - 1} ${Y(arr[i - 1])} ${X(i) - 1} ${Y(v)} ${X(i) + 3} ${Y(v)}`, "") + ` H${X(arr.length - 1) + 6}`;
    let b = [0, 12, 24].map(v => `<text x="12" y="${Y(v) + 3}" text-anchor="middle" font-size="8.5">${v}</text>`).join("");
    b += `<path d="${path(inv)}" fill="none" stroke="#f3b23a" stroke-width="2.2" stroke-linecap="round"/><path d="${path(got)}" fill="none" stroke="#cfe35e" stroke-width="2.2" stroke-linecap="round"/>`;
    [["19", 0], ["23", 2.5], ["27", 5], ["2 Feb", 7.3]].forEach(([t, i]) => b += `<text x="${X(i)}" y="84" text-anchor="middle" font-size="8.5">${t}</text>`);
    return svg(160, 88, b);
  },
  // Scope & bid forms: published scope blocks per trade (like Ref 1's "Heart").
  blocks() {
    const trades = [["DM", 4], ["CO", 5], ["ST", 3], ["ME", 4], ["EL", 2], ["SW", 5], ["DW", 1]];
    let b = "";
    trades.forEach(([t, n], i) => {
      const x = 8 + i * 21;
      b += `<rect x="${x}" y="4" width="15" height="62" rx="3" fill="rgba(255,255,255,.07)"/>`;
      for (let k = 0; k < n; k++) b += `<rect x="${x + 1.5}" y="${54 - k * 12.2}" width="12" height="10" rx="2" fill="${k === n - 1 && n < 5 ? "#ec7444" : "#f3b23a"}"/>`;
      b += `<text x="${x + 7.5}" y="82" text-anchor="middle" font-size="8.5">${t}</text>`;
    });
    return svg(156, 86, b);
  },
  // Budget trend: three soft waves (like Ref 1's "Wellness score").
  waves() {
    const wave = (amp, k, ph, col, op) => { let d = ""; for (let x = 0; x <= 300; x += 4) { const env = Math.sin(Math.PI * x / 300); d += `${x ? "L" : "M"}${x} ${35 + amp * env * Math.sin(k * x / 300 * Math.PI * 2 + ph)}`; } return `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.8" opacity="${op}"/>`; };
    return svg(300, 70, wave(20, 1.6, 0, "#ec7444", 1) + wave(17, 1.6, 1.4, "#f3b23a", .9) + wave(14, 2.1, 2.6, "#ffffff", .35) + wave(10, 2.4, 4, "#ffffff", .18));
  },
  // Trade package pulse: dense waveform bars, orange in the middle (like Ref 1's "Focus activity").
  pulse() {
    let b = "", seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 78; i++) {
      const env = .25 + .75 * Math.sin(Math.PI * i / 77), h = 6 + rnd() * 34 * env, mid = Math.abs(i - 39) < 2;
      b += `<rect x="${i * 3.85}" y="${32 - (mid ? 30 : h / 2)}" width="1.6" height="${mid ? 60 : h}" rx=".8" fill="${mid ? "#ec7444" : "rgba(255,255,255,.42)"}"/>`;
    }
    return svg(300, 64, b);
  },
  // Readiness gauge: tick arc (like Ref 1's tall "Speed" card).
  gauge(el) {
    const pct = +(el.dataset.pct || 62), n = 48, cx = 100, cy = 98, r1 = 86, r2 = 72; let b = "";
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (1.12 - i * 1.24 / (n - 1)), long = i % 6 === 0, rr = long ? r2 - 6 : r2;
      const on = i / (n - 1) <= pct / 100;
      b += `<line x1="${cx + r1 * Math.cos(a)}" y1="${cy - r1 * Math.sin(a)}" x2="${cx + rr * Math.cos(a)}" y2="${cy - rr * Math.sin(a)}" stroke="${on ? "#fff" : "rgba(255,255,255,.22)"}" stroke-width="${long ? 2.4 : 1.6}" stroke-linecap="round"/>`;
    }
    b += `<path d="M100 2 l5 12 h-10 z" fill="#fff"/><line x1="100" y1="16" x2="100" y2="34" stroke="#fff" stroke-width="1.4"/>`;
    return svg(200, 134, b); // arc ends ~32px below its centre (cy 98), so the box is 134 tall
  },
  // Main page: planning value split by project (one bar, three segments).
  split() {
    const p = [["Project 1", 33.3, "#ec7444"], ["Project 2", 26.8, "#f3b23a"], ["Project 3", 12.3, "#cfe35e"]], total = 72.4; let x = 0, b = "";
    p.forEach(([name, v, col], i) => { const w = v / total * 296;
      b += `<rect x="${x + 2}" y="14" width="${w - 4}" height="16" rx="8" fill="${col}" opacity="${i ? .85 : 1}"/>`;
      b += `<text x="${x + 4}" y="48" font-size="10">${name}</text><text x="${x + 4}" y="61" font-size="10" style="fill:#f5f0e9">$${v}M</text>`; x += w; });
    return svg(300, 66, b);
  },
  // Main page: bid days across 2026 (RFI deadline small, bid day tall).
  year() {
    const m = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"], X = (mo, d) => 10 + (mo + d / 31) * 23.5; let b = "";
    m.forEach((t, i) => { b += `<text x="${X(i, 15)}" y="62" text-anchor="middle" font-size="9">${t}</text><line x1="${X(i, 0)}" y1="8" x2="${X(i, 0)}" y2="48" stroke="rgba(255,255,255,.07)"/>`; });
    [[0, 20, 1, "#ec7444"], [1, 2, 0, "#ec7444"], [9, 2, 1, "#cfe35e"], [9, 16, 0, "#cfe35e"], [9, 23, 1, "#f3b23a"], [10, 6, 0, "#f3b23a"]].forEach(([mo, d, rfi, col]) => {
      const x = X(mo, d); b += rfi ? `<rect x="${x - 2}" y="30" width="4" height="14" rx="2" fill="${col}" opacity=".6"/>` : `<rect x="${x - 3}" y="8" width="6" height="36" rx="3" fill="${col}"/>`; });
    return svg(300, 66, b);
  },
  // Budget by version: tall bars, one highlighted (used by variation C, like Ref 4's electricity chart).
  bars() {
    const v = [44, 30, 52, 88, 40, 24, 58], labels = ["Concept", "SD", "DD 50", "DD", "CD 50", "CD", "GMP"]; let b = "";
    v.forEach((h, i) => { const x = 6 + i * 44, hi = i === 3;
      b += `<rect x="${x}" y="${100 - h}" width="34" height="${h}" rx="8" fill="${hi ? "url(#hiGrad)" : "rgba(255,255,255,.10)"}"/>`;
      b += `<text x="${x + 17}" y="114" text-anchor="middle" font-size="9">${labels[i]}</text>`; });
    b = `<defs><linearGradient id="hiGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a6e"/><stop offset="1" stop-color="#ec7444" stop-opacity=".25"/></linearGradient></defs>` + b +
      `<line x1="${6 + 3 * 44 + 17}" y1="12" x2="${6 + 3 * 44 + 17}" y2="100" stroke="#fff" stroke-width="1.2" opacity=".8"/><circle cx="${6 + 3 * 44 + 17}" cy="12" r="5" fill="#ec7444" stroke="#fff" stroke-width="2"/>`;
    return svg(310, 118, b);
  },
};

function drawCharts() { $$("[data-chart]").forEach(el => { el.classList.add("chart"); el.innerHTML = CHARTS[el.dataset.chart](el); }); }

// ---------- Menus: nav groups open a frosted dropdown; profile opens its menu ----------
function menuHtml(key) {
  if (key === "profile") return `<h4>MARCEL KHOURY · ESTIMATOR</h4>
    <button class="menu-item"><i data-lucide="settings-2"></i>Settings</button>
    <button class="menu-item"><i data-lucide="pause"></i>Reduce animation</button>
    <button class="menu-item"><i data-lucide="folder-open"></i>Switch project</button><hr>
    <button class="menu-item"><i data-lucide="log-out"></i>Sign out</button>`;
  const g = NAV[key]; if (!g) return "";
  // Which screen is open comes from <body data-current>. Links that have a mockup go to it.
  const current = document.body.dataset.current || "Preconstruction to-do";
  const MOCKS = { "All projects": "../projects/index.html", "Preconstruction to-do": "../project-landing/b2.html" };
  const link = s => `<a href="${MOCKS[s] || "#"}" class="${s === current ? "is-current" : ""}">${s}</a>`;
  return `<h4>${g.label}${key !== "workspace" ? " · PROJECT 1" : ""}</h4>` + g.items.map(it => Array.isArray(it)
    ? `<h5>${it[0]}</h5>` + it.slice(1).map(link).join("") : link(it)).join("");
}
function setupMenus() {
  const menu = document.createElement("div"); menu.className = "menu"; menu.setAttribute("role", "menu"); document.body.append(menu);
  let owner = null;
  const close = () => { menu.classList.remove("is-open"); owner?.setAttribute("aria-expanded", "false"); owner = null; };
  $$("[data-menu]").forEach(btn => {
    btn.setAttribute("aria-haspopup", "true"); btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", e => {
      e.stopPropagation();
      if (owner === btn) return close();
      close(); owner = btn; menu.innerHTML = menuHtml(btn.dataset.menu); window.lucide?.createIcons();
      const r = btn.getBoundingClientRect(), side = btn.dataset.side || "below";
      menu.style.left = side === "right" ? `${r.right + 12}px` : `${Math.min(r.left, innerWidth - 270)}px`;
      menu.style.top = side === "right" ? `${Math.max(12, r.top - 8)}px` : `${r.bottom + 10}px`;
      menu.style.right = "auto";
      if (btn.dataset.align === "end") { menu.style.left = "auto"; menu.style.right = `${innerWidth - r.right}px`; }
      menu.classList.add("is-open"); btn.setAttribute("aria-expanded", "true");
    });
  });
  document.addEventListener("click", e => { if (!menu.contains(e.target)) close(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { const o = owner; close(); o?.focus(); } });
}

// ---------- Ask box, parallax, toast ----------
function toast(msg) { let t = $(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
  t.textContent = msg; t.classList.add("is-on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("is-on"), 2600); }
function setupAsk() {
  $$("form.ask-form").forEach(f => f.addEventListener("submit", e => { e.preventDefault(); const q = f.querySelector("input").value.trim();
    toast(q ? `In the app this opens Ask Structor with: "${q}"` : "In the app this opens Ask Structor with this page's suggested questions"); }));
}
function setupParallax() {
  const bg = $(".bg"); if (!bg || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  addEventListener("scroll", () => { bg.style.transform = `translate3d(0, ${scrollY * -0.25}px, 0) scale(${1 + Math.min(scrollY, 600) / 6000})`; }, { passive: true });
}
function setupPassive() {
  $$("[data-toast]").forEach(b => b.addEventListener("click", e => { if (b.getAttribute("href") === "#") e.preventDefault(); toast(b.dataset.toast); }));
  document.addEventListener("click", e => { const a = e.target.closest('a[href="#"]'); if (a && !a.dataset.toast) { e.preventDefault(); toast(`"${a.textContent.trim()}" isn't mocked up yet`); } });
}

document.addEventListener("DOMContentLoaded", () => { drawCharts(); setupMenus(); setupAsk(); setupParallax(); setupPassive(); window.lucide?.createIcons(); });
