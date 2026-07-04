import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Yosoku Cup",
    short_name: "Yosoku",
    description: "無料ポイントで遊ぶワールドカップ予測ゲーム",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6f2",
    theme_color: "#111412",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
