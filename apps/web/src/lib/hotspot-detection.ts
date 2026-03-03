export interface Hotspot {
  lat: number;
  lng: number;
  reportIds: number[];
  count: number;
}

/** Haversine distance in meters */
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const RADIUS_M = 500;
const MIN_REPORTS = 3;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Greedy clustering: for each un-assigned report, gather all reports within
 * 500 m that were created in the last 24 h. If ≥ 3, emit a hotspot.
 */
export function detectHotspots(
  reports: { id: number; lat: number; lng: number; createdAt: string }[],
): Hotspot[] {
  const now = Date.now();
  const recent = reports.filter(
    (r) => now - new Date(r.createdAt).getTime() <= WINDOW_MS,
  );

  const used = new Set<number>();
  const hotspots: Hotspot[] = [];

  for (const seed of recent) {
    if (used.has(seed.id)) continue;

    const cluster = recent.filter(
      (r) =>
        !used.has(r.id) &&
        haversineMeters(seed.lat, seed.lng, r.lat, r.lng) <= RADIUS_M,
    );

    if (cluster.length >= MIN_REPORTS) {
      const ids = cluster.map((r) => r.id);
      ids.forEach((id) => used.add(id));

      // Centroid
      const lat = cluster.reduce((s, r) => s + r.lat, 0) / cluster.length;
      const lng = cluster.reduce((s, r) => s + r.lng, 0) / cluster.length;

      hotspots.push({ lat, lng, reportIds: ids, count: ids.length });
    }
  }

  return hotspots;
}
