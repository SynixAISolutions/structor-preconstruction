"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocalDraft } from "../../lib/use-local-draft";
import { Button, Panel } from "./shared";
import { HAS_GOOGLE_3D_MAP, SiteMap, type Coordinates, type GoogleScene } from "./site-map";
import { geocodeSite, type SiteLocation } from "./site-context";
import "./schematic-site-render.css";

type BuildModel = () => Promise<ArrayBuffer>;
type Placement = Coordinates & { heading: number; heightFt: number };
type SavedPlacement = { site: string; position: Placement };

export function SchematicSiteRender({ site, projectAddress, buildModel, onSiteAddress }: {
  site: SiteLocation; projectAddress: string; buildModel: BuildModel; onSiteAddress: () => void;
}) {
  const address = (site.address || projectAddress).trim();
  return <Panel title="Site render" className="sm-site-render"><div className="site-body">
    {!HAS_GOOGLE_3D_MAP ? <p className="site-note">The photorealistic background requires a Google Maps key.</p>
      : site.lat !== null && site.lng !== null
        ? <LocatedSiteRender key={`${site.lat},${site.lng}`} site={{ lat: site.lat, lng: site.lng }} buildModel={buildModel}/>
        : <SiteRenderFromAddress key={address} address={address} buildModel={buildModel} onSiteAddress={onSiteAddress}/>}
  </div></Panel>;
}

function SiteRenderFromAddress({ address, buildModel, onSiteAddress }: {
  address: string; buildModel: BuildModel; onSiteAddress: () => void;
}) {
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!address) return;
    let live = true;
    // An address preview should not edit the project's saved map location.
    geocodeSite(address).then(site => { if (live) setCoordinates(site); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [address]);

  if (coordinates) return <LocatedSiteRender site={coordinates} buildModel={buildModel}/>;
  return <div className="sm-site-empty">
    <p className="site-note" role="status">{failed ? "The project address couldn't be located. Check the site street address."
      : address ? "Finding the project site…" : "Set a site address to place the building in its surroundings."}</p>
    <Button onClick={onSiteAddress}>Set site address</Button>
  </div>;
}

function LocatedSiteRender({ site, buildModel }: { site: Coordinates; buildModel: BuildModel }) {
  const siteKey = `${site.lat},${site.lng}`;
  const [saved, save] = useLocalDraft<SavedPlacement | null>("site-model-placement", null);
  const [scene, setScene] = useState<GoogleScene | null>(null);
  const [building, setBuilding] = useState<{ build: BuildModel; url?: string; error?: string } | null>(null);
  const [modelError, setModelError] = useState("");
  const model = useRef<InstanceType<GoogleScene["Model3D"]> | null>(null);
  const placement = saved?.site === siteKey ? saved.position : { ...site, heading: 0, heightFt: 0 };
  const { lat, lng, heading, heightFt } = placement;
  const url = building?.build === buildModel ? building.url : undefined;
  const buildError = building?.build === buildModel ? building.error : undefined;
  const sceneReady = !!scene;

  useEffect(() => {
    if (!sceneReady) return;
    let live = true;
    let objectUrl: string | undefined;
    buildModel().then(binary => {
      if (!live) return;
      objectUrl = URL.createObjectURL(new Blob([binary], { type: "model/gltf-binary" }));
      setBuilding({ build: buildModel, url: objectUrl });
    }).catch(error => {
      if (live) setBuilding({ build: buildModel, error: error instanceof Error ? error.message : "The drawing model couldn't be prepared." });
    });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [buildModel, sceneReady]);

  useEffect(() => {
    if (!scene || !url) return;
    setModelError("");
    try {
      model.current = new scene.Model3D({
        src: url, altitudeMode: "RELATIVE_TO_GROUND",
        position: { lat: site.lat, lng: site.lng, altitude: 0 },
        orientation: { heading: 0 },
      });
    } catch {
      setModelError("Google Maps couldn't display the building.");
    }
    return () => { model.current?.remove(); model.current = null; };
  }, [scene, url, site.lat, site.lng]);

  useEffect(() => {
    const object = model.current;
    if (!scene || !object) return;
    object.position = { lat, lng, altitude: .3048 * heightFt };
    object.orientation = { heading };
    if (!object.parentNode) {
      scene.map.append(object);
      if (lat !== site.lat || lng !== site.lng) scene.map.center = { lat, lng, altitude: 0 };
    }
  }, [scene, url, lat, lng, heading, heightFt, site.lat, site.lng]);

  function centerOnBuilding(position = placement) {
    if (!scene) return;
    scene.map.center = { lat: position.lat, lng: position.lng, altitude: 0 };
    scene.map.range = 250;
    scene.map.tilt = 62;
    scene.map.heading = 25;
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const position = {
      lat: Number(values.get("latitude")), lng: Number(values.get("longitude")),
      heading: Number(values.get("heading")) % 360, heightFt: Number(values.get("height")),
    };
    if (Object.values(position).some(value => !Number.isFinite(value))) return;
    save({ site: siteKey, position });
    centerOnBuilding(position);
  }

  return <>
    <div className="sm-site-status">
      <p className="site-note">{saved?.site === siteKey
        ? "Saved site placement. Check it against the site survey."
        : "Approximate placement from the site address. Align the building against the site plan or survey."}</p>
      {url && <Button onClick={() => centerOnBuilding()}>Center on building</Button>}
    </div>
    <SiteMap lat={site.lat} lng={site.lng} label="Building in its photorealistic surroundings" mode="SATELLITE" onReady={setScene}/>
    {(buildError || modelError) && <p className="site-error" role="alert">{buildError || modelError}</p>}
    {sceneReady && !url && !buildError && <p className="site-note sm-site-loading" role="status">Preparing the drawing model for the site…</p>}
    {url && !modelError && <details className="sm-site-placement">
      <summary>Adjust building placement</summary>
      <form onSubmit={apply}>
        <label className="ui-field">Latitude of ground-floor center<input key={lat} name="latitude" type="number" min="-90" max="90" step="any" required defaultValue={lat}/></label>
        <label className="ui-field">Longitude of ground-floor center<input key={lng} name="longitude" type="number" min="-180" max="180" step="any" required defaultValue={lng}/></label>
        <label className="ui-field">Clockwise rotation from north (°)<input key={heading} name="heading" type="number" min="0" max="360" step="any" required defaultValue={heading}/></label>
        <label className="ui-field">Ground-floor offset above terrain (ft)<input key={heightFt} name="height" type="number" step="any" required defaultValue={heightFt}/></label>
        <Button type="submit">Save placement</Button>
      </form>
    </details>}
  </>;
}
