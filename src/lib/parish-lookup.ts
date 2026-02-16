import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";

interface ParishProperties {
  Freguesia: string;
  Concelho: string;
  [key: string]: unknown;
}

type ParishFeatureCollection = FeatureCollection<
  Polygon | MultiPolygon,
  ParishProperties
>;

let _geojson: ParishFeatureCollection | null = null;

function getGeoJSON(): ParishFeatureCollection {
  if (!_geojson) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _geojson = require("./geojson/leiria-freguesias.json") as ParishFeatureCollection;
  }
  return _geojson;
}

export function resolveParish(
  lat: number,
  lng: number,
): { parish: string; concelho: string } | null {
  const pt = point([lng, lat]);
  const fc = getGeoJSON();

  for (const feature of fc.features) {
    if (booleanPointInPolygon(pt, feature)) {
      return {
        parish: feature.properties.Freguesia,
        concelho: feature.properties.Concelho,
      };
    }
  }

  return null;
}
