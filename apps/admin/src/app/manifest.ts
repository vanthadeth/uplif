import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "UPLIF Platform", short_name: "UPLIF Platform", start_url: "/", scope: "/", display: "standalone",
    background_color: "#ffffff", theme_color: "#1D5FD1",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
