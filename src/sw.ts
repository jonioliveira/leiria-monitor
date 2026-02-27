/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  BackgroundSyncPlugin,
  CacheFirst,
  NetworkFirst,
  NetworkOnly,
  Serwist,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Queue report POST requests for background sync (Android/Chrome)
// iOS fallback is handled client-side in report-queue.ts
const reportBgSync = new BackgroundSyncPlugin("reports-queue", {
  maxRetentionTime: 24 * 60, // retry for up to 24 hours (in minutes)
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Serve /offline when a navigation request fails (user is offline and page is not cached)
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
  runtimeCaching: [
    {
      // Report submission — queue for background sync when offline
      matcher: ({ url, request }) =>
        url.pathname === "/api/reports" && request.method === "POST",
      handler: new NetworkOnly({
        plugins: [reportBgSync],
      }),
    },
    {
      // Map tiles — cache-first (tile servers rarely change content)
      matcher: ({ url }) => url.hostname.endsWith("basemaps.cartocdn.com"),
      handler: new CacheFirst({
        cacheName: "map-tiles",
        maxAgeFrom: "last-fetched",
      }),
    },
    {
      // All API GET routes — network-first so data is always fresh when online,
      // but cached responses are served immediately when offline
      matcher: ({ url, request }) =>
        url.pathname.startsWith("/api/") && request.method === "GET",
      handler: new NetworkFirst({
        cacheName: "api-data",
        networkTimeoutSeconds: 5,
      }),
    },
    {
      // Static assets — cache-first (hashed filenames ensure cache busting)
      matcher: ({ request }) =>
        request.destination === "script" ||
        request.destination === "style" ||
        request.destination === "font" ||
        request.destination === "image",
      handler: new CacheFirst({
        cacheName: "static-assets",
      }),
    },
  ],
});

serwist.addEventListeners();
