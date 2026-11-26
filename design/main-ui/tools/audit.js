// Visual audit for the dark rebuild. Paste into the browser console (or run via the browser tool) on the local app.
// window.__audit(["projects", "leveling", …]) walks each screen by hash and reports:
//   light:    opaque light boxes left over from the light theme (bg luminance > .55)
//   darkText: text whose colour is too dark to read on the dark theme (luminance < .22)
//   overlap:  visible text boxes that overlap another unrelated text box by > 25% of the smaller one
//   spill:    text that overflows its own box without scrolling (clipped/overlapping neighbours)
//   pageX:    the page itself scrolls sideways
// Results are grouped by a short selector so one CSS fix can clear many hits.
(() => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rgba = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const visible = e => { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(e); return cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > .05; };
  const ownText = e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
  const sel = e => { const c = [...e.classList].filter(x => !/^(is-|active|open)/.test(x)).slice(0, 2).join("."); const p = e.parentElement?.closest("[class]"); const pc = p ? "." + [...p.classList][0] : ""; return `${pc} ${e.tagName.toLowerCase()}${c ? "." + c : ""}`.trim(); };
  // Screen-reader-only text (clipped to nothing) is not on screen, so it can't overlap anything.
  const srOnly = e => { for (let p = e; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.clipPath === "inset(50%)" || cs.clip === "rect(0px, 0px, 0px, 0px)" || (p.offsetWidth <= 1 && p.offsetHeight <= 1)) return true; } return false; };
  const skip = e => e.closest("canvas, svg, .model-studio, .mu-gauge, [aria-hidden='true'], .ui-modal-backdrop, nextjs-portal") || srOnly(e)
    // A closed <details> group lays out its links but never paints them.
    || e.closest("details:not([open]) > :not(summary)");
  // The part of an element actually on screen: intersected with every ancestor that clips it (scrolling panels, folded
  // nav groups, the scrolling content). null when nothing is left, e.g. links inside a collapsed group.
  const clipBox = e => { const r0 = e.getBoundingClientRect(); let b = { left: r0.left, top: r0.top, right: r0.right, bottom: r0.bottom };
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p);
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible" || cs.clipPath !== "none") { const q = p.getBoundingClientRect();
        b = { left: Math.max(b.left, q.left), top: Math.max(b.top, q.top), right: Math.min(b.right, q.right), bottom: Math.min(b.bottom, q.bottom) };
        if (b.right - b.left < 1 || b.bottom - b.top < 1) return null; } }
    return { ...b, width: b.right - b.left, height: b.bottom - b.top }; };
  // Inside the scrolling content, only what is actually on screen counts (rows scrolled under the top bar are clipped, not overlapping).
  const onScreen = (e, view) => { if (!view || !view.contains(e)) return true; const r = e.getBoundingClientRect(), v = view.getBoundingClientRect(); return r.bottom > v.top + 1 && r.top < v.bottom - 1; };
  function scan() {
    const root = document.querySelector(".product-app"), view = document.querySelector(".product-content");
    const all = [...root.querySelectorAll("*")].filter(e => !skip(e) && visible(e) && onScreen(e, view) && clipBox(e));
    const out = { light: {}, darkText: {}, overlap: {}, spill: {}, pageX: document.documentElement.scrollWidth > innerWidth + 1 };
    const bump = (k, s) => (out[k][s] = (out[k][s] || 0) + 1);
    const texts = [];
    for (const e of all) {
      const cs = getComputedStyle(e), bg = rgba(cs.backgroundColor);
      if (bg && bg.a > .85 && lum(bg) > .55 && e.offsetWidth > 24 && e.offsetHeight > 14 && !e.matches("img, video, input[type=checkbox], input[type=radio]")) bump("light", sel(e));
      if (ownText(e)) {
        const c = rgba(cs.color); if (c && c.a > .5 && lum(c) < .22 && !e.closest(".ui-btn.primary, .mu-pill.is-primary, .mu-send, .mu-team, [class*='avatar']")) bump("darkText", sel(e));
        if (e.scrollWidth > e.clientWidth + 3 && cs.overflowX === "visible" && cs.whiteSpace !== "normal" && e.clientWidth > 0) bump("spill", sel(e));
        texts.push([e, clipBox(e)]); // the on-screen part only (a half-scrolled row isn't "under" the top bar)
      }
    }
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const [a, ra] = texts[i], [b, rb] = texts[j];
      if (a.contains(b) || b.contains(a)) continue;
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w <= 0 || h <= 0) continue;
      const small = Math.min(ra.width * ra.height, rb.width * rb.height);
      if (w * h > .25 * small) bump("overlap", `${sel(a)}  ×  ${sel(b)}`);
    }
    return out;
  }
  window.__audit = async (ids, wait = 1600, { ignore = /voice-launcher|ask-launcher/ } = {}) => {
    const report = {};
    for (const id of ids) {
      location.hash = id; await sleep(wait);
      const content = document.querySelector(".product-content"); const res = { top: scan() };
      if (content && content.scrollHeight > content.clientHeight + 200) { content.scrollTo({ top: content.scrollHeight }); await sleep(350); res.bottom = scan(); content.scrollTo({ top: 0 }); }
      const merged = { light: {}, darkText: {}, overlap: {}, spill: {}, pageX: res.top.pageX || res.bottom?.pageX || false };
      for (const part of [res.top, res.bottom].filter(Boolean)) for (const k of ["light", "darkText", "overlap", "spill"]) for (const [s, n] of Object.entries(part[k])) if (!(ignore && k !== "overlap" && ignore.test(s))) merged[k][s] = Math.max(merged[k][s] || 0, n);
      const clean = Object.fromEntries(Object.entries(merged).filter(([k, v]) => k === "pageX" ? v : Object.keys(v).length));
      if (Object.keys(clean).length) report[id] = clean;
    }
    return report;
  };
  return "audit ready";
})();
