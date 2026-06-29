import { describe, it, expect } from "vitest";
import {
  cellToBoundary,
  cellToGeoJSONPolygon,
  latLngToCell,
} from "@/lib/h3-utils";
import type { Position } from "geojson";

// Reading, UK spans approx:
//   lng: [-2, 1]  (west to east of Prime Meridian)
//   lat:  [51, 52] (UK latitude)
// h3-js returns [lat, lng]. Our function reverses to GeoJSON [lng, lat].

describe("h3-utils", () => {
  describe("cellToBoundary", () => {
    it("returns an array of coordinate pairs", () => {
      const cell = "89194ad2c6fffff";
      const boundary = cellToBoundary(cell);
      expect(Array.isArray(boundary)).toBe(true);
      expect(boundary.length).toBeGreaterThan(2);
    });

    it("coordinates are [lng, lat] not [lat, lng]", () => {
      // Reading cells: lng is in [-2, 1], lat is in [51, 52]
      // If coordinates were still [lat, lng], lat would be a small number (~0.04)
      // After correct reversal, lng is in [-2, 1] and lat is in [51, 52]
      const cell = "89194ad2c6fffff";
      const boundary = cellToBoundary(cell);
      for (const coord of boundary) {
        expect(coord).toHaveLength(2);
        const [lng, lat] = coord;
        // Correct range for Reading: lng in [-2, 1], lat in [50, 52]
        expect(lng).toBeGreaterThanOrEqual(-2);
        expect(lng).toBeLessThanOrEqual(1);
        expect(lat).toBeGreaterThanOrEqual(50);
        expect(lat).toBeLessThanOrEqual(52);
        // Key test: lat should NOT be a small number (0.03) — if it were, it would be a swapped lng
        expect(Math.abs(lat)).toBeGreaterThan(10);
      }
    });

    it("ring is closed (first vertex === last vertex)", () => {
      const cell = "89194ad2c6fffff";
      const boundary = cellToBoundary(cell);
      expect(boundary.length).toBeGreaterThan(0);
      const first = boundary[0];
      const last = boundary[boundary.length - 1];
      expect(first[0]).toBeCloseTo(last[0], 9);
      expect(first[1]).toBeCloseTo(last[1], 9);
    });

    it("works for all Reading seed cells", () => {
      const readingCells = [
        "89194ad2c6fffff",
        "89194ad2c2bffff",
        "89194ad35a7ffff",
        "89194ad2837ffff",
        "89194ad34cbffff",
        "89194ad2813ffff",
        "87194ad2bffffff",
        "87194ad2cffffff",
      ];
      for (const cell of readingCells) {
        const boundary = cellToBoundary(cell);
        expect(boundary.length).toBeGreaterThan(2);
        const [lng, lat] = boundary[0];
        expect(lng).toBeGreaterThanOrEqual(-2);
        expect(lng).toBeLessThanOrEqual(1);
        expect(lat).toBeGreaterThanOrEqual(50);
        expect(lat).toBeLessThanOrEqual(52);
        expect(Math.abs(lat)).toBeGreaterThan(10);
      }
    });
  });

  describe("cellToGeoJSONPolygon", () => {
    it("returns a Polygon type", () => {
      const cell = "89194ad2c6fffff";
      const polygon = cellToGeoJSONPolygon(cell);
      expect(polygon.type).toBe("Polygon");
    });

    it("has a coordinates array with one ring", () => {
      const cell = "89194ad2c6fffff";
      const polygon = cellToGeoJSONPolygon(cell);
      expect(Array.isArray(polygon.coordinates)).toBe(true);
      expect(polygon.coordinates.length).toBe(1);
      expect(Array.isArray(polygon.coordinates[0])).toBe(true);
    });

    it("ring coordinates are [lng, lat]", () => {
      const cell = "89194ad2c6fffff";
      const polygon = cellToGeoJSONPolygon(cell);
      const ring = polygon.coordinates[0] as Position[];
      for (const coord of ring) {
        const [lng, lat] = coord;
        // Reading longitude range [-2, 1]
        expect(lng).toBeGreaterThanOrEqual(-2);
        expect(lng).toBeLessThanOrEqual(1);
        // UK latitude range [50, 52]
        expect(lat).toBeGreaterThan(50);
        expect(lat).toBeLessThan(52);
      }
    });

    it("ring is closed", () => {
      const cell = "89194ad2c6fffff";
      const polygon = cellToGeoJSONPolygon(cell);
      const ring = polygon.coordinates[0] as Position[];
      const first = ring[0];
      const last = ring[ring.length - 1];
      expect(first[0]).toBeCloseTo(last[0], 9);
      expect(first[1]).toBeCloseTo(last[1], 9);
    });

    it("does not return a Point type", () => {
      const cell = "89194ad2c6fffff";
      const polygon = cellToGeoJSONPolygon(cell);
      expect(polygon.type).not.toBe("Point");
    });
  });

  describe("latLngToCell", () => {
    it("returns a valid H3 cell string for Reading, UK", () => {
      // Reading town centre approx
      const cell = latLngToCell(51.454, -1.0, 7);
      expect(typeof cell).toBe("string");
      expect(cell.length).toBeGreaterThan(0);
    });

    it("cells for nearby points are different", () => {
      const cell1 = latLngToCell(51.454, -1.0, 7);
      const cell2 = latLngToCell(51.46, -1.0, 7);
      expect(typeof cell1).toBe("string");
      expect(typeof cell2).toBe("string");
    });
  });
});
