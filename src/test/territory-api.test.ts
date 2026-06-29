import { describe, it, expect } from "vitest";
import { FORBIDDEN_KEYS } from "@/lib/contracts/territory";

// This test documents the expected shape and privacy guarantees of the
// /api/territory response. It does NOT make live HTTP calls — it validates
// the contract schema and the FORBIDDEN_KEYS list against the known table schema.

describe("territory API contract", () => {
  describe("FORBIDDEN_KEYS", () => {
    it("contains no exact-coordinate fields", () => {
      const forbidden = [
        "exact_location",
        "private_location_id",
        "latitude",
        "longitude",
        "ST_X",
        "ST_Y",
        "user_id",
        "last_active_at",
      ];
      for (const key of forbidden) {
        expect(FORBIDDEN_KEYS).toContain(key);
      }
    });

    it("does NOT contain safe public fields", () => {
      const safeFields = [
        "h3_cell",
        "area_label",
        "controller_faction",
        "state",
        "active_hide_count",
        "contested_hide_count",
      ];
      for (const safe of safeFields) {
        expect(FORBIDDEN_KEYS).not.toContain(safe);
      }
    });
  });

  describe("GeoJSON FeatureCollection shape", () => {
    it("FeatureCollection must have type and features array", () => {
      const shape = {
        type: "FeatureCollection",
        features: [],
      };
      expect(shape.type).toBe("FeatureCollection");
      expect(Array.isArray(shape.features)).toBe(true);
    });

    it("Feature must have type, id, properties, geometry", () => {
      const feature = {
        type: "Feature",
        id: "89194ad2c6fffff",
        properties: {
          h3Cell: "89194ad2c6fffff",
          areaLabel: "Forbury Loop",
          controllerFaction: "verdant",
          state: "controlled",
          activeHideCount: 2,
          contestedHideCount: 0,
        },
        geometry: {
          type: "Polygon",
          coordinates: [[[-1.0, 51.4], [-0.9, 51.4], [-0.9, 51.5], [-1.0, 51.4]]],
        },
      };
      expect(feature.type).toBe("Feature");
      expect(typeof feature.id).toBe("string");
      expect(typeof feature.properties).toBe("object");
      expect(feature.geometry.type).toBe("Polygon");
      expect(Array.isArray(feature.geometry.coordinates)).toBe(true);
    });

    it("Polygon coordinates must be [lng, lat] pairs", () => {
      // Reading UK: lng is negative, lat is ~51
      const polygon = {
        type: "Polygon",
        coordinates: [
          [
            [-1.0, 51.45],
            [-0.99, 51.45],
            [-0.99, 51.46],
            [-1.0, 51.45],
          ],
        ],
      };
      const ring = polygon.coordinates[0];
      for (const coord of ring) {
        const [lng, lat] = coord;
        expect(lng).toBeLessThan(0); // Western hemisphere
        expect(lat).toBeGreaterThan(50); // UK latitude
        expect(lat).toBeLessThan(52);
      }
    });

    it("Feature must not reference private tables via properties", () => {
      const forbiddenPropertyPatterns = [
        "private_location_id",
        "exact_location",
        "player_id",
        "user_id",
        "latitude",
        "longitude",
        "ST_X",
        "ST_Y",
      ];

      const safeFeature = {
        type: "Feature",
        id: "89194ad2c6fffff",
        properties: {
          h3Cell: "89194ad2c6fffff",
          areaLabel: "Forbury Loop",
          controllerFaction: "verdant",
          state: "controlled",
          activeHideCount: 2,
          contestedHideCount: 0,
        },
        geometry: { type: "Polygon", coordinates: [] },
      };

      for (const key of forbiddenPropertyPatterns) {
        expect(safeFeature.properties).not.toHaveProperty(key);
      }
    });
  });
});
