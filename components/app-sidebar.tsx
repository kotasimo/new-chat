"use client";

import {
  ChartNoAxesColumnIncreasing,
  Clock3,
  ReceiptText,
  Search,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchWithAnonymousAuth } from "@/lib/anonymous-auth";

const navItems = [
  { label: "予測する", href: "/", icon: Trophy },
  { label: "取引履歴", href: "/transactions", icon: ReceiptText },
  { label: "ランキング", href: "/ranking", icon: ChartNoAxesColumnIncreasing },
  { label: "終了市場", href: "/history", icon: Clock3 },
];

const DISPLAY_NAME_CACHE_KEY = "yosoku_display_name";

export function AppSidebar() {
  const pathname = usePathname();
  const [points, setPoints] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState(() => {
    if (typeof window === "undefined") {
      return "ゲスト";
    }

    return window.localStorage.getItem(DISPLAY_NAME_CACHE_KEY) ?? "ゲスト";
  });
  const [draftName, setDraftName] = useState(displayName);
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    let ignore = false;

    function updateDisplayName(name: string) {
      window.localStorage.setItem(DISPLAY_NAME_CACHE_KEY, name);
      setDisplayName(name);
      setDraftName(name);
    }

    async function loadProfile() {
      try {
        const response = await fetchWithAnonymousAuth("/api/profile");
        const result = await response.json();

        if (!response.ok) return;

        if (!ignore) {
          updateDisplayName(result.profile.displayName);
          setPoints(result.profile.points);
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
        setPoints(points);
      }
    }

    window.addEventListener("yosoku:points-updated", updatePoints);
    return () => window.removeEventListener("yosoku:points-updated", updatePoints);
  }, []);

  async function saveDisplayName() {
    const nextName = draftName.trim();

    if (!nextName || nextName.length > 16) {
      return;
    }

    setSavingName(true);

    try {
      const response = await fetchWithAnonymousAuth("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ displayName: nextName }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "表示名を更新できませんでした。");
      }

      window.localStorage.setItem(DISPLAY_NAME_CACHE_KEY, result.profile.displayName);
      setDisplayName(result.profile.displayName);
      setDraftName(result.profile.displayName);
      setEditingName(false);
    } catch {
      setDraftName(displayName);
    } finally {
      setSavingName(false);
    }
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">Y</div>
        <span>Yosoku Cup</span>
      </div>
      <div className="sidebar-balance" aria-label="保有ポイント">
        {points === null ? "確認中" : `${points.toLocaleString("ja-JP")}pt`}
      </div>
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

      <div className="sidebar-profile">
        <span>アカウント</span>
        {editingName ? (
          <div className="sidebar-profile-edit">
            <input
              aria-label="表示名"
              maxLength={16}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
            />
            <button disabled={savingName} type="button" onClick={saveDisplayName}>
              {savingName ? "保存中" : "保存"}
            </button>
          </div>
        ) : (
          <div className="sidebar-profile-view">
            <strong suppressHydrationWarning>{displayName}</strong>
            <button type="button" onClick={() => setEditingName(true)}>
              変更
            </button>
          </div>
        )}
        <small>この端末に予想履歴を保存しています。</small>
      </div>

      <nav className="sidebar-legal" aria-label="サイト情報">
        <Link href="/guide">遊び方</Link>
        <Link href="/terms">利用規約</Link>
        <Link href="/privacy">プライバシー</Link>
        <Link href="/contact">お問い合わせ</Link>
      </nav>
    </aside>
  );
}
