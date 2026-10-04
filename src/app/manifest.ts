import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Laundroweb",
    short_name: "Laundroweb",
    description: "Laundromat management dashboard",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#030712",
    theme_color: "#030712",
    icons: [
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-180.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
