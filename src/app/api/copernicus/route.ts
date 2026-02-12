import { NextResponse } from "next/server";

export const revalidate = 1800;

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(
      "https://mapping.emergency.copernicus.eu/activations/api/activations/EMSR861/",
      { signal: controller.signal }
    );

    if (!res.ok) {
      throw new Error(`Copernicus EMS returned ${res.status}`);
    }

    const raw = await res.json();

    const activation = {
      code: raw.code ?? "EMSR861",
      name: raw.name ?? null,
      countries: (raw.countries ?? []).map((c: any) => c.short_name ?? c.name ?? c),
      activationTime: raw.activationTime ?? raw.activation_time ?? null,
      closed: raw.closed ?? null,
      n_aois: raw.n_aois ?? 0,
      n_products: raw.n_products ?? 0,
      drmPhase: raw.drmPhase ?? raw.drm_phase ?? null,
      centroid: raw.centroid ?? null,
    };

    const isActive = !activation.closed;
    let status: "ok" | "warning" | "critical" | "unknown" = "unknown";
    if (activation.code) {
      status = isActive ? "warning" : "ok";
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      source: "Copernicus Emergency Management Service",
      source_url: "https://mapping.emergency.copernicus.eu/activations/EMSR861",
      status,
      activation,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
