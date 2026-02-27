import webpush from "web-push";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { sql } from "drizzle-orm";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

const RADIUS_KM = 15;

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const TYPE_LABELS: Record<string, string> = {
  electricity: "Sem electricidade",
  telecom_mobile: "Rede móvel em baixo",
  telecom_fixed: "Rede fixa em baixo",
  water: "Sem água",
  water_leak: "Rotura de água",
  roads: "Estrada cortada",
  roads_tree: "Árvore na estrada",
  roads_damage: "Dano na estrada",
  other_garbage: "Lixo / entulho",
  other: "Outro problema",
};

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  icon?: string;
  badge?: string;
};

export async function sendPushToNearby(report: {
  lat: number;
  lng: number;
  type: string;
  description?: string | null;
  parish?: string | null;
  priority: string;
}): Promise<void> {
  // Only notify for urgent reports
  if (report.priority !== "urgente") return;

  // Fetch all subscriptions that have coordinates within RADIUS_KM
  // We filter in JS to avoid PostGIS dependency
  const allSubs = await db
    .select()
    .from(pushSubscriptions)
    .where(sql`lat IS NOT NULL AND lng IS NOT NULL`);

  const nearby = allSubs.filter(
    (sub) =>
      sub.lat != null &&
      sub.lng != null &&
      haversineKm(report.lat, report.lng, sub.lat, sub.lng) <= RADIUS_KM
  );

  // Also include subscriptions without coordinates (opted in globally)
  const global = await db
    .select()
    .from(pushSubscriptions)
    .where(sql`lat IS NULL`);

  const targets = [...nearby, ...global];
  if (targets.length === 0) return;

  const typeLabel = TYPE_LABELS[report.type] ?? "Problema reportado";
  const location = report.parish ?? "Leiria";
  const payload: PushPayload = {
    title: `Alerta urgente — ${location}`,
    body: report.description
      ? `${typeLabel}: ${report.description.slice(0, 100)}`
      : typeLabel,
    url: "/map",
    icon: "/icon-192.png",
    badge: "/icon-96.png",
  };

  const dead: number[] = [];
  await Promise.allSettled(
    targets.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
      } catch (err: any) {
        // 410 Gone or 404 = subscription expired/revoked → delete it
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          dead.push(sub.id);
        }
      }
    })
  );

  if (dead.length > 0) {
    await db
      .delete(pushSubscriptions)
      .where(sql`id = ANY(${dead})`);
  }
}
