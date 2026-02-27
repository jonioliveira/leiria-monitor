import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rede Sentinela",
    short_name: "Sentinela",
    description:
      "Monitorização da recuperação de infraestruturas no distrito de Leiria após a tempestade Kristin",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0c0f1a",
    theme_color: "#1e3a5f",
    categories: ["utilities", "navigation"],
    prefer_related_applications: false,
    icons: [
      { src: "/icon-72.png",           sizes: "72x72",   type: "image/png" },
      { src: "/icon-96.png",           sizes: "96x96",   type: "image/png" },
      { src: "/icon-128.png",          sizes: "128x128", type: "image/png" },
      { src: "/icon-144.png",          sizes: "144x144", type: "image/png" },
      { src: "/icon-152.png",          sizes: "152x152", type: "image/png" },
      { src: "/icon-192.png",          sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-384.png",          sizes: "384x384", type: "image/png" },
      { src: "/icon-512.png",          sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Reportar problema",
        short_name: "Reportar",
        description: "Submeter um novo reporte no mapa",
        url: "/map",
        icons: [{ src: "/icon-96.png", sizes: "96x96" }],
      },
    ],
  };
}
