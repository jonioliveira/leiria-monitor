/**
 * API client for Rede Sentinela.
 *
 * During Epic 2 (Next.js → Go API migration):
 * - Set NEXT_PUBLIC_API_BASE_URL="" (empty) → calls Next.js API routes at /api/...
 * - Set NEXT_PUBLIC_API_BASE_URL="https://api.redesentinela.com" → calls Go API directly
 *
 * All fetch calls in the app should eventually migrate to use apiFetch() so
 * the cutover (Epic 2.8) is a one-line env var change.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/**
 * Drop-in replacement for fetch() that prepends the Go API base URL when set.
 * Falls back to relative /api/... URLs (Next.js routes) when not set.
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = BASE_URL ? `${BASE_URL}${path}` : path;
  return fetch(url, init);
}
