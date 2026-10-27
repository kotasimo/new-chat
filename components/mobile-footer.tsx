import Link from "next/link";

/**
 * 左の列はスマホだと上の帯に畳まれ、免責と規約のリンクが出せなくなる。
 * その置き場所として本文の末尾に出す。PCでは左の列にあるので隠す。
 */
export function MobileFooter() {
  return (
    <footer className="mobile-footer">
      <p>
        <strong>無料ポイントの予想ゲーム。</strong>
        現金・暗号資産・換金はありません。倍率は
        <a href="https://polymarket.com" target="_blank" rel="noreferrer">
          polymarket.com
        </a>
        の予測価格から自動換算しています。
      </p>
      <nav aria-label="サイト情報">
        <Link href="/guide">遊び方</Link>
        <Link href="/terms">利用規約</Link>
        <Link href="/privacy">プライバシー</Link>
        <Link href="/contact">お問い合わせ</Link>
      </nav>
    </footer>
  );
}
