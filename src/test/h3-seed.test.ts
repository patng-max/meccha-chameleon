import { describe, it, expect } from "vitest";
import { latLngToCell } from "@/lib/h3-utils";
import { getResolution } from "h3-js";

describe("H3 seed cell validation", () => {
  describe("Reading landmark coordinates generate res 7 cells", () => {
    const readingLandmarks = [
      { name: "Reading Town Centre", lat: 51.454, lng: -0.974 },
      { name: "Forbury Gardens", lat: 51.456, lng: -0.971 },
      { name: "Reading Station", lat: 51.4563, lng: -0.9638 },
      { name: "Caversham", lat: 51.465, lng: -0.968 },
      { name: "Abbey Quarter", lat: 51.459, lng: -0.978 },
      { name: "Oracle", lat: 51.452, lng: -0.969 },
    ];

    for (const { name, lat, lng } of readingLandmarks) {
      it(`${name} (${lat}, ${lng}) generates a valid res 7 cell`, () => {
        const cell = latLngToCell(lat, lng, 7);
        expect(typeof cell).toBe("string");
        expect(cell.length).toBe(15); // res 7 cells have 15 hex chars
        expect(getResolution(cell)).toBe(7);
      });
    }

    it("all landmark cells have resolution exactly 7", () => {
      const cells = readingLandmarks.map(({ lat, lng }) => latLngToCell(lat, lng, 7));
      for (const cell of cells) {
        expect(getResolution(cell)).toBe(7);
      }
    });

    it("geographically close points generate different cells", () => {
      // Town centre (~51.454, -0.974) and Caversham (~51.465, -0.968) are
      // ~1.5km apart — should be in different res 7 cells (res 7 edge ~917m).
      // Town centre and Forbury Gardens are only ~230m apart and fall in the same
      // res 7 cell — this is expected behavior at this resolution.
      const townCentre = latLngToCell(51.454, -0.974, 7);
      const caversham = latLngToCell(51.465, -0.968, 7);
      expect(townCentre).not.toBe(caversham);
    });
  });

  describe("Validated Reading res 7 cells for migration 003", () => {
    // These cells were generated from public landmark coordinates and verified
    // with getResolution() === 7 before being included in migration 003.
    const validatedReadingCells = [
      { cell: "87195d2b1ffffff", areaLabel: "Reading Town Centre", sourceLat: 51.454, sourceLng: -0.974 },
      { cell: "87195d2b5ffffff", areaLabel: "Caversham", sourceLat: 51.465, sourceLng: -0.968 },
      { cell: "87195d2b0ffffff", areaLabel: "Abbey Quarter", sourceLat: 51.459, sourceLng: -0.978 },
      { cell: "87195d2b3ffffff", areaLabel: "Whitley", sourceLat: 51.444, sourceLng: -0.985 },
      { cell: "87195d2b2ffffff", areaLabel: "Tilehurst", sourceLat: 51.464, sourceLng: -1.008 },
      { cell: "87195d2b6ffffff", areaLabel: "South Reading", sourceLat: 51.438, sourceLng: -0.975 },
    ];

    it("each validated cell is confirmed as res 7", () => {
      for (const { cell } of validatedReadingCells) {
        expect(getResolution(cell)).toBe(7);
      }
    });

    it("each validated cell has correct length (15 hex chars)", () => {
      for (const { cell } of validatedReadingCells) {
        expect(cell).toMatch(/^[0-9a-f]{15}$/);
      }
    });
  });
});
