import { cellToBoundary as h3CellToBoundary, latLngToCell as h3LatLngToCell } from "h3-js";

export function latLngToCell(lat: number, lng: number, resolution = 7): string {
  return h3LatLngToCell(lat, lng, resolution);
}

export function cellToBoundary(cell: string): [number, number][] {
  return h3CellToBoundary(cell).map(([lat, lng]) => [lat, lng]);
}

export function getCellLabel(cell: string, city: string): string {
  const shortCell = cell.slice(-7, -1).toUpperCase();

  return `${city} cell ${shortCell}`;
}
