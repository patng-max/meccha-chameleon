import { cellToBoundary as h3CellToBoundary, latLngToCell as h3LatLngToCell } from "h3-js";
import type { Polygon, Position } from "geojson";

export function latLngToCell(lat: number, lng: number, resolution = 7): string {
  return h3LatLngToCell(lat, lng, resolution);
}

/**
 * Returns H3 cell boundary in GeoJSON [lng, lat] format with ring closed.
 * h3-js cellToBoundary returns [[lat, lng], ...] — we reverse to GeoJSON [lng, lat].
 * GeoJSON Polygon requires the ring to be closed (first vertex === last vertex).
 */
export function cellToBoundary(cell: string): Position[] {
  const raw = h3CellToBoundary(cell);
  // Reverse [lat, lng] → [lng, lat] and close the ring
  const coords: Position[] = raw.map(([lat, lng]) => [lng, lat] as Position);
  if (coords.length > 0) {
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      coords.push([...first] as Position);
    }
  }
  return coords;
}

/**
 * Builds a GeoJSON Polygon from an H3 cell ID.
 * Coordinates are [lng, lat] and the ring is closed.
 */
export function cellToGeoJSONPolygon(cell: string): Polygon {
  return {
    type: "Polygon",
    coordinates: [cellToBoundary(cell)],
  };
}

export function getCellLabel(cell: string, city: string): string {
  const shortCell = cell.slice(-7, -1).toUpperCase();
  return `${city} cell ${shortCell}`;
}
