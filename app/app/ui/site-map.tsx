"use client";

import { useEffect, useRef, useState } from "react";

export const HAS_GOOGLE_3D_MAP = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export type Coordinates = { lat: number; lng: number };
type MapPosition = Coordinates & { altitude: number };
type ModelOrientation = { heading: number; tilt: number };
type AltitudeMode = "CLAMP_TO_GROUND" | "RELATIVE_TO_GROUND";
type ModelOptions = {
  src: string;
  altitudeMode: AltitudeMode;
  position: MapPosition;
  orientation: ModelOrientation;
};
type BuildingElement = HTMLElement & { position: MapPosition; orientation: ModelOrientation; altitudeMode: AltitudeMode };
type MapElement = HTMLElement & {
  center: MapPosition;
  range: number;
  tilt: number;
  heading: number;
};
export type GoogleScene = {
  map: MapElement;
  Model3D: new (options: ModelOptions) => BuildingElement;
};

type GoogleMaps = { importLibrary: (name: string) => Promise<Record<string, unknown>> };
let loading: Promise<GoogleMaps> | null = null;
const authFailures = new Set<() => void>();

export function loadGoogleMaps(): Promise<GoogleMaps> {
  const w = window as unknown as { google?: { maps?: GoogleMaps }; __structorMaps?: () => void; gm_authFailure?: () => void };
  if (w.google?.maps?.importLibrary) return Promise.resolve(w.google.maps);
  loading ??= new Promise<GoogleMaps>((resolve, reject) => {
    w.gm_authFailure = () => { authFailures.forEach(report => report()); };
    w.__structorMaps = () => w.google?.maps ? resolve(w.google.maps) : reject(new Error("Google Maps didn't start."));
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&v=beta&loading=async&callback=__structorMaps`;
    script.async = true;
    script.onerror = () => { loading = null; reject(new Error("Google Maps couldn't be reached. Check the connection and try again.")); };
    document.head.append(script);
  });
  return loading;
}

export function SiteMap({ lat, lng, label, mode = "HYBRID", onReady }: Coordinates & {
  label: string;
  mode?: "HYBRID" | "SATELLITE";
  onReady?: (scene: GoogleScene | null) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const box = holder.current;
    if (!box) return;
    let live = true;
    setError("");
    const authFailure = () => setError("Google refused the Maps key. Check that this site's address is allowed for the key.");
    authFailures.add(authFailure);
    loadGoogleMaps()
      .then(maps => maps.importLibrary("maps3d"))
      .then(lib => {
        if (!live) return;
        const Map3D = lib.Map3DElement as new (options: Record<string, unknown>) => MapElement;
        const map = new Map3D({
          center: { lat, lng, altitude: 0 },
          range: mode === "SATELLITE" ? 250 : 520,
          tilt: 62, heading: 25, mode,
        });
        map.className = "site-map-3d";
        box.append(map);
        onReady?.({ map, Model3D: lib.Model3DElement as GoogleScene["Model3D"] });
      })
      .catch((e: Error) => live && setError(e.message || "The 3D map couldn't be shown."));
    return () => {
      live = false;
      authFailures.delete(authFailure);
      box.replaceChildren();
      onReady?.(null);
    };
  }, [lat, lng, mode, onReady]);

  return <>
    {error && <p className="site-error" role="alert">{error}</p>}
    <div className="site-map" ref={holder} aria-label={label}/>
  </>;
}
