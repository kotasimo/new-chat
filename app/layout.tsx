import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yosoku Cup",
  description: "無料ポイントで遊ぶワールドカップ予測ゲーム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
