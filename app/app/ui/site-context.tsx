"use client";

// The exterior model's surroundings (Marcel's Software Features list, item 19: "Exterior Model - shows the building from the
// outside, maybe we can link it to google maps 3D api to mimic the exterior surroundings"). Google's photorealistic 3D map
// of the site, from the Maps JavaScript API's 3D maps (Map3DElement), centred on the project's site address, which is
// geocoded once and kept per project. It needs a Google Maps Platform key with billing, the Maps JavaScript API, the
// Map Tiles API (the 3D tiles) and the Geocoding API (the browser's Geocoder needs it); NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is added in Vercel (never typed in by an agent). Until then the panel
// says how to switch it on. Site context is UI work (AGENTS.md); the model itself is untouched.

import { useEffect, useState, type FormEvent } from "react";
import { MapPin, Mountain } from "lucide-react";
import type { Project } from "../../lib/projects";
import { useLocalDraft } from "../../lib/use-local-draft";
import { Button, Panel } from "./shared";

import { HAS_GOOGLE_3D_MAP, loadGoogleMaps, SiteMap, type Coordinates } from "./site-map";

export type SiteLocation = { address: string; lat: number | null; lng: number | null };
/** Project 1's site, as the model's caption gives it (38.917° N / 77.068° W). */
const SAMPLE_SITE: SiteLocation = { address: "Washington, DC", lat: 38.917, lng: -77.068 };

export function useSiteLocation(project: Project, sample: boolean) {
  return useLocalDraft<SiteLocation>("site-context", sample ? SAMPLE_SITE : { address: project.location, lat: null, lng: null });
}
export type SiteLocationDraft = ReturnType<typeof useSiteLocation>;

export async function geocodeSite(address: string): Promise<SiteLocation & Coordinates> {
  const maps = await loadGoogleMaps();
  const { Geocoder } = await maps.importLibrary("geocoding") as {
    Geocoder: new () => {
      geocode: (request: { address: string }) => Promise<{ results: {
        geometry: { location: { lat: () => number; lng: () => number } }; formatted_address: string;
      }[] }>;
    };
  };
  const { results: [match] } = await new Geocoder().geocode({ address });
  if (!match) throw new Error("Google couldn't locate the site. Check the street address.");
  const point = match.geometry.location;
  return { address: match.formatted_address || address, lat: point.lat(), lng: point.lng() };
}

export function SiteContext({ project, draft }: { project: Project; draft: SiteLocationDraft }) {
  const [site, setSite] = draft;
  // A real project's drafts start blank (lib/project-scope), so its address box starts from the project's location.
  const [address, setAddress] = useState(site.address || project.location);
  useEffect(() => { if (site.address) setAddress(site.address); }, [site.address]); // the team's saved address, once it arrives
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function locate(event: FormEvent) {
    event.preventDefault();
    const where = address.trim();
    if (!where) return;
    setError("");
    if (!HAS_GOOGLE_3D_MAP) { setSite({ address: where, lat: null, lng: null }); return; }
    setBusy(true);
    try {
      const located = await geocodeSite(where);
      setSite(located);
      setAddress(located.address);
    } catch (e) { setError(e instanceof Error ? e.message : "The address couldn't be found."); }
    finally { setBusy(false); }
  }

  return <Panel title="Site and surroundings" subtitle="The building's real neighbourhood in Google's photorealistic 3D map: drag to orbit, scroll to zoom."><div className="site-body">
    <form className="site-form" onSubmit={locate}>
      <label className="site-field"><MapPin size={15}/><span className="mu-sr">Site address</span><input value={address} onChange={e => setAddress(e.target.value)} placeholder="Site street address, e.g. 123 Main St NW, Washington, DC"/></label>
      <Button type="submit" disabled={busy}>{busy ? "Finding…" : "Show site"}</Button>
    </form>
    {error && <p className="site-error" role="alert">{error}</p>}
    {!HAS_GOOGLE_3D_MAP
      ? <details className="site-setup">
          <summary><Mountain size={18}/><span><strong>The 3D surroundings are off</strong><small>They switch on once Structor's Google Maps key is added. The address above is kept for this project. <em>How to add the key</em></small></span></summary>
          <ol>
            <li>In Google Cloud, on a project with billing, turn on the <b>Maps JavaScript API</b>, the <b>Map Tiles API</b> and the <b>Geocoding API</b> (it finds the address).</li>
            <li>Create an API key limited to those three APIs and to Structor's web addresses (the live site and the previews you test on).</li>
            <li>In Vercel → Settings → Environment Variables, add <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> for Production and Preview, then redeploy.</li>
          </ol>
        </details>
      : site.lat === null || site.lng === null
        ? <p className="site-note">Enter the site's street address and choose Show site.</p>
        : <SiteMap lat={site.lat} lng={site.lng} label={`3D map around ${site.address}`}/>}
  </div></Panel>;
}
