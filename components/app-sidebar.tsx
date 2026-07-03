import { Flame, Medal, Trophy, TrendingUp } from "lucide-react";

const navItems = [
  { label: "ワールドカップ", active: true, icon: "status" },
  { label: "優勝国", icon: Trophy },
  { label: "試合ごと", icon: Medal },
  { label: "人気", icon: Flame },
  { label: "ランキング", icon: TrendingUp },
];

export function AppSidebar() {
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

          return (
            <button
              className={`nav-item ${item.active ? "active" : ""}`}
              key={item.label}
              type="button"
            >
              {Icon ? <Icon size={16} aria-hidden="true" /> : <span className="status-dot" />}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
