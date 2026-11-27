"use client";

// The exterior model's surroundings (Marcel's Software Features list, item 19: "Exterior Model - shows the building from the
// outside, maybe we can link it to google maps 3D api to mimic the exterior surroundings"). Google's photorealistic 3D map
// of the site, from the Maps JavaScript API's 3D maps (Map3DElement), centred on the project's site address, which is
// geocoded once and kept per project. It needs a Google Maps Platform key with billing, the Maps JavaScript API, the
// Map Tiles API (the 3D tiles) and the Geocoding API (the browser's Geocoder needs it); NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is added in Vercel (never typed in by an agent). Until then the panel
// says how to switch it on. Site context is UI work (AGENTS.md); the model itself is untouched.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { MapPin, Mountain } from "lucide-react";
import type { Project } from "../../lib/projects";
import { useLocalDraft } from "../../lib/use-local-draft";
import { Button, Panel } from "./shared";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
type Site = { address: string; lat: number | null; lng: number | null };
/** Project 1's site, as the model's caption gives it (38.917° N / 77.068° W). */
const SAMPLE_SITE: Site = { address: "Washington, DC", lat: 38.917, lng: -77.068 };

type GoogleMaps = { importLibrary: (name: string) => Promise<Record<string, unknown>> };
let loading: Promise<GoogleMaps> | null = null;
/** Google's loader, once per page; a key Google refuses calls gm_authFailure instead of failing the script. */
function loadGoogleMaps(key: string, onAuthFailure: () => void): Promise<GoogleMaps> {
  const w = window as unknown as { google?: { maps?: GoogleMaps }; __structorMaps?: () => void; gm_authFailure?: () => void };
  w.gm_authFailure = onAuthFailure;
  if (w.google?.maps?.importLibrary) return Promise.resolve(w.google.maps);
  loading ??= new Promise<GoogleMaps>((resolve, reject) => {
    w.__structorMaps = () => w.google?.maps ? resolve(w.google.maps) : reject(new Error("Google Maps didn't start."));
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=beta&loading=async&callback=__structorMaps`;
    script.async = true;
    script.onerror = () => { loading = null; reject(new Error("Google Maps couldn't be reached. Check the connection and try again.")); };
    document.head.append(script);
  });
  return loading;
}

export function SiteContext({ project, sample }: { project: Project; sample: boolean }) {
  const [site, setSite] = useLocalDraft<Site>("site-context", sample ? SAMPLE_SITE : { address: project.location, lat: null, lng: null });
  // A real project's drafts start blank (lib/project-scope), so its address box starts from the project's location.
  const [address, setAddress] = useState(site.address || project.location);
  useEffect(() => { if (site.address) setAddress(site.address); }, [site.address]); // the team's saved address, once it arrives
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  // Draw the 3D map whenever the site has coordinates (and a key exists).
  useEffect(() => {
    if (!KEY || site.lat === null || site.lng === null || !holder.current) return;
    let live = true; const box = holder.current;
    loadGoogleMaps(KEY, () => live && setError("Google refused the Maps key. Check that the Maps JavaScript API, Map Tiles API and Geocoding API are on for it, and that this site's address is allowed."))
      .then(maps => maps.importLibrary("maps3d"))
      .then(lib => {
        if (!live) return;
        const Map3D = lib.Map3DElement as new (options: Record<string, unknown>) => HTMLElement;
        // "HYBRID" is the photorealistic imagery with labels; Google's default ("ROADMAP") is a flat-coloured 3D map.
        const map = new Map3D({ center: { lat: site.lat, lng: site.lng, altitude: 0 }, range: 520, tilt: 62, heading: 25, mode: "HYBRID" });
        map.className = "site-map-3d";
        box.replaceChildren(map);
      })
      .catch((e: Error) => live && setError(e.message || "The 3D map couldn't be shown."));
    return () => { live = false; };
  }, [site.lat, site.lng]);

  async function locate(event: FormEvent) {
    event.preventDefault();
    const where = address.trim();
    if (!where) return;
    setError("");
    if (!KEY) { setSite({ address: where, lat: null, lng: null }); return; }
    setBusy(true);
    try {
      const maps = await loadGoogleMaps(KEY, () => setError("Google refused the Maps key."));
      const { Geocoder } = await maps.importLibrary("geocoding") as { Geocoder: new () => { geocode: (r: { address: string }) => Promise<{ results: { geometry: { location: { lat: () => number; lng: () => number } }; formatted_address: string }[] }> } };
      const { results } = await new Geocoder().geocode({ address: where });
      if (!results.length) { setError(`Google found no place called "${where}". Try the street address.`); return; }
      const at = results[0].geometry.location;
      setSite({ address: results[0].formatted_address || where, lat: at.lat(), lng: at.lng() });
      setAddress(results[0].formatted_address || where);
    } catch (e) { setError(e instanceof Error ? e.message : "The address couldn't be found."); }
    finally { setBusy(false); }
  }

  return <Panel title="Site and surroundings" subtitle="The building's real neighbourhood in Google's photorealistic 3D map: drag to orbit, scroll to zoom."><div className="site-body">
    <form className="site-form" onSubmit={locate}>
      <label className="site-field"><MapPin size={15}/><span className="mu-sr">Site address</span><input value={address} onChange={e => setAddress(e.target.value)} placeholder="Site street address, e.g. 123 Main St NW, Washington, DC"/></label>
      <Button type="submit" disabled={busy}>{busy ? "Finding…" : "Show site"}</Button>
    </form>
    {error && <p className="site-error" role="alert">{error}</p>}
    {!KEY
      ? <details className="site-setup">
          <summary><Mountain size={18}/><span><strong>The 3D surroundings are off</strong><small>They switch on once Structor's Google Maps key is added. The address above is kept for this project. <em>How to add the key</em></small></span></summary>
          <ol>
            <li>In Google Cloud, on a project with billing, turn on the <b>Maps JavaScript API</b>, the <b>Map Tiles API</b> and the <b>Geocoding API</b> (it finds the address).</li>
            <li>Create an API key limited to those three APIs and to Structor's web addresses (the live site and the previews you test on).</li>
            <li>In Vercel → Settings → Environment Variables, add <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> for Production and Preview, then redeploy.</li>
          </ol>
        </details>
      : site.lat === null
        ? <p className="site-note">Enter the site's street address and choose Show site.</p>
        : <div className="site-map" ref={holder} aria-label={`3D map around ${site.address}`}/>}
  </div></Panel>;
}
