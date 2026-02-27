/**
 * Client-side offline report queue.
 *
 * Primary path (Android/Chrome): the service worker's BackgroundSyncPlugin
 * intercepts the failed POST and replays it automatically via the Background
 * Sync API when connectivity returns.
 *
 * Fallback path (iOS/Safari): the report panel catches the network error,
 * calls queueReport(), and this module replays the queue the next time the
 * user opens the app with connectivity (via flushQueue() in OfflineBanner).
 */

const QUEUE_KEY = "offline-reports-queue";

export type QueuedReport = {
  id: string;
  data: Record<string, unknown>;
  queuedAt: string;
};

export function queueReport(data: Record<string, unknown>): void {
  const queue = getQueue();
  queue.push({
    id: typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now()),
    data,
    queuedAt: new Date().toISOString(),
  });
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // localStorage may be unavailable in some private-browsing contexts
  }
}

export function getQueue(): QueuedReport[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function getQueuedCount(): number {
  return getQueue().length;
}

export async function flushQueue(): Promise<number> {
  const queue = getQueue();
  if (queue.length === 0) return 0;

  let flushed = 0;
  const remaining: QueuedReport[] = [];

  for (const item of queue) {
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.data),
      });
      if (res.ok) {
        flushed++;
      } else {
        remaining.push(item);
      }
    } catch {
      remaining.push(item);
    }
  }

  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  } catch {
    // ignore
  }
  return flushed;
}
