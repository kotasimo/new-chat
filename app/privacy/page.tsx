import { SitePage } from "@/components/site-page";

export const metadata = {
  title: "プライバシーポリシー | Yosoku Cup",
};

export default function PrivacyPage() {
  return (
    <SitePage
      title="プライバシーポリシー"
      description="Yosoku Cupで扱う情報と、その使い道についてまとめています。"
    >
      <section>
        <h2>取得する情報</h2>
        <p>
          Yosoku Cupでは、ゲストID、表示名、保有ポイント、予想履歴、ポイント履歴、
          利用端末に保存されるセッション情報を扱います。決済情報や本人確認情報は取得しません。
        </p>
      </section>

      <section>
        <h2>利用目的</h2>
        <p>
          取得した情報は、予想機能、ポイント管理、ランキング表示、不正利用の防止、
          サービス改善のために利用します。
        </p>
      </section>

      <section>
        <h2>端末への保存</h2>
        <p>
          ゲスト利用を継続するため、ブラウザの保存領域にセッション情報や表示名の一部を保存します。
          これらを削除すると、同じゲスト情報を利用できなくなる場合があります。
        </p>
      </section>

      <section>
        <h2>外部サービス</h2>
        <p>
          データ保存、認証、配信、アクセス解析などのために、Supabase、Vercelなどの外部サービスを利用する場合があります。
          また、予測市場の参考情報としてPolymarketの公開情報を利用します。
        </p>
      </section>

      <section>
        <h2>第三者提供</h2>
        <p>
          法令に基づく場合を除き、取得したユーザー情報を本人の同意なく第三者へ販売することはありません。
          ランキングなど、サービス上で表示される情報は他ユーザーから閲覧される場合があります。
        </p>
      </section>

      <section>
        <h2>改定</h2>
        <p>
          サービス内容の変更に合わせて、このポリシーを更新することがあります。
          重要な変更がある場合は、サービス上でわかりやすく案内します。
        </p>
      </section>
    </SitePage>
  );
}
