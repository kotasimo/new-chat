"use client";

import {
  ChartNoAxesColumnIncreasing,
  Clock3,
  ReceiptText,
  Search,
  Trophy,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchWithAnonymousAuth } from "@/lib/anonymous-auth";
import { leagueLogos } from "@/lib/league-logos";
import { leagues, type LeagueId } from "@/lib/leagues";

const navItems = [
  { label: "予測する", href: "/", icon: Trophy },
  { label: "マイページ", href: "/me", icon: ReceiptText },
  { label: "ランキング", href: "/ranking", icon: ChartNoAxesColumnIncreasing },
  { label: "終了市場", href: "/history", icon: Clock3 },
];

type AppSidebarProps = {
  activeLeague?: LeagueId | null;
  /** ホームは自分の状況の帯で資産を大きく出すので、ここでは重ねて出さない。 */
  hideBalance?: boolean;
};

export function AppSidebar({ activeLeague = null, hideBalance = false }: AppSidebarProps) {
  const pathname = usePathname();
  const [assets, setAssets] = useState<number | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadProfile() {
      try {
        const response = await fetchWithAnonymousAuth("/api/profile");
        const result = await response.json();

        if (!response.ok) return;

        if (!ignore) {
          setAssets(
            typeof result.assets === "number" ? result.assets : result.profile.points,
          );
        }
      } catch {
        // Keep the fallback name. Sidebar should never block the app.
      }
    }

    loadProfile();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    function updatePoints(event: Event) {
      const points = (event as CustomEvent<{ points?: number }>).detail?.points;
      if (typeof points === "number") {
        setAssets(points);
      }
    }

    window.addEventListener("yosoku:points-updated", updatePoints);
    return () => window.removeEventListener("yosoku:points-updated", updatePoints);
  }, []);

  return (
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="予測する画面へ戻る">
        <div className="brand-mark">Y</div>
      </Link>
      {hideBalance ? null : (
        <div className="sidebar-balance" aria-label="資産">
          {assets === null ? "—" : `${assets.toLocaleString("ja-JP")}pt`}
        </div>
      )}
      {pathname === "/" ? (
        <button
          aria-label="マーケット検索"
          className="mobile-search-trigger"
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("yosoku:open-search"))}
        >
          <Search size={18} aria-hidden="true" />
        </button>
      ) : null}

      <div className="nav-title">マーケット</div>
      <nav className="nav-list" aria-label="メインナビゲーション">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

          return (
            <Link
              className={`nav-item ${active ? "active" : ""}`}
              href={item.href}
              key={item.label}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="nav-title">リーグ</div>
      <nav className="nav-list league-nav" aria-label="リーグ">
        <Link
          className={`nav-item ${pathname === "/" && !activeLeague ? "active" : ""}`}
          href="/"
        >
          <span className="league-logo-slot" aria-hidden="true">
            ★
          </span>
          <span>注目</span>
        </Link>
        {leagues.map((league) => {
          const logo = leagueLogos[league.id];

          return (
            <Link
              className={`nav-item ${activeLeague === league.id ? "active" : ""}`}
              href={`/?league=${league.id}`}
              key={league.id}
            >
              <span className="league-logo-slot" aria-hidden="true">
                {logo ? (
                  <Image src={logo} alt="" width={18} height={18} />
                ) : (
                  league.label.slice(0, 1)
                )}
              </span>
              <span>{league.label}</span>
            </Link>
          );
        })}
      </nav>

      <p className="sidebar-note">
        <strong>無料ポイントの予想ゲーム。</strong>
        現金・暗号資産・換金はありません。倍率は
        <a href="https://polymarket.com" target="_blank" rel="noreferrer">
          polymarket.com
        </a>
        の予測価格から自動換算しています。
      </p>

      <nav className="sidebar-legal" aria-label="サイト情報">
        <Link href="/guide">遊び方</Link>
        <Link href="/terms">利用規約</Link>
        <Link href="/privacy">プライバシー</Link>
        <Link href="/contact">お問い合わせ</Link>
      </nav>
    </aside>
  );
}
