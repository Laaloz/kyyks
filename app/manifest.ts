import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rookiapp",
    short_name: "Rookiapp",
    description: "Coach-first training planner and workout tracker.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f7fc",
    theme_color: "#f3f7fc",
    lang: "fi",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
