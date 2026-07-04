import type { Metadata } from "next";
import "./globals.css";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Yosoku Cup",
    template: "%s | Yosoku Cup",
  },
  description: "Polymarketの予測価格を参考に、無料ポイントで遊ぶワールドカップ予測ゲーム。",
  applicationName: "Yosoku Cup",
  keywords: [
    "Yosoku Cup",
    "ワールドカップ",
    "予想ゲーム",
    "予測市場",
    "Polymarket",
    "サッカー",
  ],
  authors: [{ name: "Yosoku Cup" }],
  creator: "Yosoku Cup",
  publisher: "Yosoku Cup",
  openGraph: {
    title: "Yosoku Cup",
    description: "世界の予測オッズで、無料で遊ぶ。",
    url: "/",
    siteName: "Yosoku Cup",
    locale: "ja_JP",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Yosoku Cup",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Yosoku Cup",
    description: "世界の予測オッズで、無料で遊ぶ。",
    images: ["/opengraph-image"],
  },
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/icon",
    apple: "/apple-icon",
  },
  manifest: "/manifest.webmanifest",
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

function getSiteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (value) {
    try {
      return new URL(value).origin;
    } catch {
      // Fall through to the local default when the env var is incomplete.
    }
  }

  return "http://127.0.0.1:3000";
}
