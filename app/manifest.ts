import type { MetadataRoute } from "next";

// Makes "Install app" / "Add to Home Screen" produce a proper app: our name and
// icon, its own window without the browser bar. The icons are generated from
// docs/brand/*.svg — the maskable one is full-bleed navy so Android's circle and
// squircle crops never show a white corner.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FMI HANNI",
    short_name: "HANNI",
    description: "Hub for Asset Needs, Notices & Inspections",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2C377D",
    icons: [
      { src: "/brand/hanni-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/hanni-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/hanni-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
