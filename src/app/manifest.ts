import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "כרם רעים — ספריית כלים קואופרטיבית",
    short_name: "כרם רעים",
    description: "השאלת כלים מהקרוואן הקהילתי",
    start_url: "/login",
    display: "standalone",
    background_color: "#f7f5f0",
    theme_color: "#185538",
    orientation: "portrait-primary",
    lang: "he",
    dir: "rtl",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
