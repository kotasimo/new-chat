import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#111412",
          color: "white",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "white",
              color: "#111412",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 44,
              fontWeight: 900,
            }}
          >
            Y
          </div>
          <div style={{ fontSize: 42, fontWeight: 900 }}>Yosoku Cup</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 78,
              fontWeight: 900,
              lineHeight: 1.08,
            }}
          >
            <span>世界の予測オッズで、</span>
            <span>無料で遊ぶ。</span>
          </div>
          <div
            style={{
              color: "#d9e4dc",
              display: "flex",
              fontSize: 28,
              lineHeight: 1.5,
              marginTop: 28,
              maxWidth: 900,
            }}
          >
            Polymarketの予測価格を参考にした、ポイント制のワールドカップ予想ゲーム。
          </div>
        </div>

        <div style={{ display: "flex", gap: 14 }}>
          {["市場を選ぶ", "ポイントで予想", "的中で増える", "試合開始で締切"].map((item) => (
            <div
              key={item}
              style={{
                border: "1px solid rgba(255,255,255,0.22)",
                borderRadius: 999,
                color: "#111412",
                background: "#ffd24a",
                fontSize: 24,
                fontWeight: 900,
                padding: "12px 18px",
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
