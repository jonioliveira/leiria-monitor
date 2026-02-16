/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Map tiles — cache-first (they rarely change)
      matcher: ({ url }) => url.hostname.endsWith("basemaps.cartocdn.com"),
      handler: new CacheFirst({
        cacheName: "map-tiles",
        maxAgeFrom: "last-fetched",
      }),
    },
    {
      // API routes — stale-while-revalidate for offline support
      matcher: ({ url }) =>
        url.pathname.startsWith("/api/reports") ||
        url.pathname.startsWith("/api/antennas") ||
        url.pathname.startsWith("/api/electricity"),
      handler: new StaleWhileRevalidate({
        cacheName: "api-data",
      }),
    },
    {
      // Static assets — cache-first
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
