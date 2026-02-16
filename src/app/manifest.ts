import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rede Sentinela",
    short_name: "Sentinela",
    description:
      "Monitorização da recuperação de infraestruturas no distrito de Leiria após a tempestade Kristin",
    start_url: "/",
    display: "standalone",
    background_color: "#0c0f1a",
    theme_color: "#1e3a5f",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
