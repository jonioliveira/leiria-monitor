import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { antennas } from "@/db/schema";
import { verifyCronSecret } from "@/lib/cron-auth";
import { sql } from "drizzle-orm";

export const maxDuration = 60;

const GEOJSON_BASE =
  "https://raw.githubusercontent.com/avataranedotas/antenas_mobile/main";

const OPERATOR_FILES: { file: string; name: string }[] = [
  { file: "meo.geojson", name: "MEO" },
  { file: "nos.geojson", name: "NOS" },
  { file: "vdf.geojson", name: "Vodafone" },
  { file: "digi.geojson", name: "DIGI" },
];

const BBOX = {
  latMin: 39.15,
  latMax: 40.05,
  lngMin: -9.45,
  lngMax: -8.1,
};

interface GeoJsonFeature {
  type: string;
  geometry: { type: string; coordinates: [number, number] };
  properties: Record<string, string | undefined>;
}

interface GeoJsonCollection {
  type: string;
  features: GeoJsonFeature[];
}

function normalizeOperator(raw: string): string[] {
  return raw
    .split(/[;,/]/)
    .map((s) =>
      s
        .trim()
        .replace(/\s*P$/i, "")
        .replace(/^vodafone$/i, "Vodafone")
        .replace(/^meo$/i, "MEO")
        .replace(/^nos$/i, "NOS")
        .replace(/^digi$/i, "DIGI")
    )
    .filter(Boolean);
}

function detectTechnologies(props: Record<string, string | undefined>): string[] {
  const techs: string[] = [];
  if (props["communication:gsm"] === "yes" || props["frequency"]?.includes("900") || props["frequency"]?.includes("1800"))
    techs.push("2G");
  if (props["communication:umts"] === "yes" || props["frequency"]?.includes("2100"))
    techs.push("3G");
  if (props["communication:lte"] === "yes" || props["frequency"]?.includes("800") || props["frequency"]?.includes("2600"))
    techs.push("4G");
  if (props["communication:nr"] === "yes" || props["frequency"]?.includes("3500") || props["frequency"]?.includes("700"))
    techs.push("5G");
  if (techs.length === 0 && props["communication:mobile_phone"] === "yes")
    techs.push("Móvel");
  return techs;
}

function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

async function fetchGeoJson(
  file: string,
  operatorName: string
): Promise<{ features: GeoJsonFeature[]; operator: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(`${GEOJSON_BASE}/${file}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    if (!res.ok) return { features: [], operator: operatorName };

    const data: GeoJsonCollection = await res.json();
    return { features: data.features ?? [], operator: operatorName };
  } catch {
    return { features: [], operator: operatorName };
  }
}

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    const results = await Promise.allSettled(
      OPERATOR_FILES.map((op) => fetchGeoJson(op.file, op.name))
    );

    // Group features by coordinate
    const grouped = new Map<
      string,
      {
        lat: number;
        lng: number;
        operators: Set<string>;
        owner: string | null;
        type: string;
        technologies: Set<string>;
      }
    >();

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const { features, operator: fileOperator } = result.value;

      for (const f of features) {
        if (f.geometry?.type !== "Point") continue;
        const [lng, lat] = f.geometry.coordinates;

        if (lat < BBOX.latMin || lat > BBOX.latMax || lng < BBOX.lngMin || lng > BBOX.lngMax)
          continue;

        const key = coordKey(lat, lng);
        const props = f.properties ?? {};

        const ops = props.operator
          ? normalizeOperator(props.operator)
          : [fileOperator];

        const techs = detectTechnologies(props);
        const owner = props.owner ?? null;
        const manMade = props.man_made ?? "other";
        const type = manMade === "mast" ? "mast" : manMade === "tower" ? "tower" : "other";

        if (grouped.has(key)) {
          const existing = grouped.get(key)!;
          ops.forEach((o) => existing.operators.add(o));
          techs.forEach((t) => existing.technologies.add(t));
          if (owner && !existing.owner) existing.owner = owner;
        } else {
          grouped.set(key, {
            lat,
            lng,
            operators: new Set(ops),
            owner,
            type,
            technologies: new Set(techs),
          });
        }
      }
    }

    const rows = Array.from(grouped.values()).map((g) => ({
      lat: g.lat,
      lng: g.lng,
      operators: Array.from(g.operators),
      owner: g.owner,
      type: g.type,
      technologies: Array.from(g.technologies),
    }));

    // Delete stale and insert fresh
    await db.delete(antennas).where(sql`1=1`);

    if (rows.length > 0) {
      // Insert in batches of 500 to avoid parameter limits
      const BATCH_SIZE = 500;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        await db.insert(antennas).values(rows.slice(i, i + BATCH_SIZE));
      }
    }

    return NextResponse.json({
      success: true,
      ingested: rows.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
