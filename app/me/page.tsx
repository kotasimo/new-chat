import { AccountCard } from "@/components/account-card";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileFooter } from "@/components/mobile-footer";
import { MyPage } from "@/components/my-page";

export const dynamic = "force-dynamic";

export default function MyPageRoute() {
  return (
    <div className="app-shell">
      <AppSidebar />
      <div className="board-layout single">
        <main className="history-page">
          <header className="history-header">
            <div>
              <h1>マイページ</h1>
              <p>予想の成績と、賭け方のくせをまとめています。</p>
            </div>
            <AccountCard />
          </header>

          <MyPage />
          <MobileFooter />
        </main>
      </div>
    </div>
  );
}
