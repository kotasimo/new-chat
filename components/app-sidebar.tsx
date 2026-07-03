"use client";

import { Clock3, Flame, Medal, Trophy, TrendingUp } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "ワールドカップ", href: "/", icon: "status" },
  { label: "終了市場", href: "/history", icon: Clock3 },
  { label: "優勝国", href: "/", icon: Trophy },
  { label: "試合ごと", href: "/", icon: Medal },
  { label: "人気", href: "/", icon: Flame },
  { label: "ランキング", href: "/", icon: TrendingUp },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">Y</div>
        <span>Yosoku Cup</span>
      </div>

      <div className="nav-title">マーケット</div>
      <nav className="nav-list" aria-label="メインナビゲーション">
        {navItems.map((item) => {
          const Icon = item.icon === "status" ? null : item.icon;
          const active = item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

          return (
            <Link
              className={`nav-item ${active ? "active" : ""}`}
              href={item.href}
              key={item.label}
            >
              {Icon ? <Icon size={16} aria-hidden="true" /> : <span className="status-dot" />}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
