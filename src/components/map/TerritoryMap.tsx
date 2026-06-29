"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { TerritoryCellFeature } from "@/lib/contracts/territory";
import "maplibre-gl/dist/maplibre-gl.css";

const FACTION_COLORS: Record<string, string> = {
  verdant: "#15803d",
  ember: "#c2410c",
  tide: "#0369a1",
  unclaimed: "#9ca3af",
  contested: "#ca8a04",
};

const READING_CENTER: [number, number] = [-1.0, 51.45]; // [lng, lat]
const DEFAULT_ZOOM = 13;

export interface TerritoryMapProps {
  cells: TerritoryCellFeature[];
}

export function TerritoryMap({ cells }: TerritoryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const styleUrl =
      process.env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL ??
      "https://tiles.openfreemap.org/styles/liberty";

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: READING_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    mapRef.current = map;

    map.on("load", () => {
      if (!mapRef.current) return;

      const sourceId = "territory-cells";
      const fillLayerId = "territory-fill";
      const lineLayerId = "territory-line";

      mapRef.current.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: cells,
        },
      });

      // Fill layer with faction-based coloring
      mapRef.current.addLayer({
        id: fillLayerId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": [
            "case",
            ["==", ["get", "controllerFaction"], "verdant"], FACTION_COLORS.verdant,
            ["==", ["get", "controllerFaction"], "ember"], FACTION_COLORS.ember,
            ["==", ["get", "controllerFaction"], "tide"], FACTION_COLORS.tide,
            ["==", ["get", "state"], "contested"], FACTION_COLORS.contested,
            FACTION_COLORS.unclaimed,
          ],
          "fill-opacity": 0.55,
        },
      });

      // Line layer for cell borders
      mapRef.current.addLayer({
        id: lineLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "controllerFaction"], "verdant"], FACTION_COLORS.verdant,
            ["==", ["get", "controllerFaction"], "ember"], FACTION_COLORS.ember,
            ["==", ["get", "controllerFaction"], "tide"], FACTION_COLORS.tide,
            ["==", ["get", "state"], "contested"], FACTION_COLORS.contested,
            "#6b7280",
          ],
          "line-width": 1.5,
          "line-opacity": 0.8,
        },
      });

      // Popup on click
      mapRef.current.on("click", fillLayerId, (e) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0] as unknown as TerritoryCellFeature;
        const props = feature.properties;
        const isUnclaimed = props.state === "unclaimed";

        const popupContent = `
          <div style="font-family: system-ui, sans-serif; font-size: 13px; min-width: 160px;">
            <strong style="font-size: 14px;">${props.areaLabel}</strong>
            <hr style="margin: 6px 0; border: none; border-top: 1px solid #e5e7eb;" />
            <dl style="margin: 0; display: grid; grid-template-columns: auto auto; gap: 2px 8px;">
              <dt style="color: #6b7280;">State</dt>
              <dd style="font-weight: 600; text-transform: capitalize;">${props.state}</dd>
              <dt style="color: #6b7280;">Controller</dt>
              <dd style="font-weight: 600; text-transform: capitalize;">${props.controllerFaction ?? "—"}</dd>
              <dt style="color: #6b7280;">Active hides</dt>
              <dd style="font-weight: 600;">${props.activeHideCount}</dd>
              <dt style="color: #6b7280;">Contested</dt>
              <dd style="font-weight: 600;">${props.contestedHideCount}</dd>
            </dl>
            ${isUnclaimed ? `
              <hr style="margin: 8px 0 6px; border: none; border-top: 1px solid #e5e7eb;" />
              <button
                id="found-cell-btn"
                style="width: 100%; padding: 6px 10px; border-radius: 6px; border: none; background: #6366f1; color: #fff; font-size: 12px; font-weight: 600; cursor: pointer;"
              >
                Found this territory
              </button>
              <p style="margin: 6px 0 0; font-size: 11px; color: #6b7280; text-align: center;">
                Coming soon: deploy a scout
              </p>
            ` : ""}
          </div>
        `;

        new maplibregl.Popup({ closeButton: true, maxWidth: "220px" })
          .setLngLat(e.lngLat)
          .setDOMContent(
            (function () {
              const div = document.createElement("div");
              div.innerHTML = popupContent;
              // Handle "Found this territory" button if present
              const btn = div.querySelector("#found-cell-btn");
              if (btn) {
                btn.addEventListener("click", () => {
                  alert("Hide deployment will be available in Milestone 4.");
                });
              }
              return div;
            })(),
          )
          .addTo(mapRef.current!);
      });

      // Change cursor on hover
      mapRef.current.on("mouseenter", fillLayerId, () => {
        if (mapRef.current) mapRef.current.getCanvas().style.cursor = "pointer";
      });
      mapRef.current.on("mouseleave", fillLayerId, () => {
        if (mapRef.current) mapRef.current.getCanvas().style.cursor = "";
      });
    });

    map.on("error", (e) => {
      console.error("[TerritoryMap] MapLibre error:", e);
      setError("Failed to load the map. Please try again.");
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [cells]);

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "#fca5a5",
          background: "#1e293b",
          borderRadius: "12px",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: "60vh", borderRadius: "12px", overflow: "hidden" }}
      aria-label="Reading territory map"
    />
  );
}
