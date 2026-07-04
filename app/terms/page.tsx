import { SitePage } from "@/components/site-page";

export const metadata = {
  title: "利用規約 | Yosoku Cup",
};

export default function TermsPage() {
  return (
    <SitePage
      title="利用規約"
      description="Yosoku Cupを利用する前に確認してほしい基本ルールです。"
    >
      <section>
        <h2>サービスについて</h2>
        <p>
          Yosoku Cupは、ワールドカップなどの予測市場を題材に、無料ポイントで予想を楽しむゲームです。
          現金、暗号資産、賞品、その他の金銭的価値への交換はできません。
        </p>
      </section>

      <section>
        <h2>予測データ</h2>
        <p>
          表示する確率や倍率は、Polymarketなど外部の予測市場データを参考にしています。
          Yosoku CupはPolymarketの公式サービスではなく、表示内容の完全性や最新性を保証しません。
        </p>
      </section>

      <section>
        <h2>ポイントと予想</h2>
        <p>
          ユーザーは保有ポイントを使って予想できます。予想した時点の倍率を記録し、
          結果が確定したあとに的中判定とポイント反映を行います。
          試合開始後や締切後の市場には予想できません。
        </p>
      </section>

      <section>
        <h2>ゲスト利用</h2>
        <p>
          このサービスはログインなしで利用できます。ゲスト情報は利用中の端末やブラウザに紐づくため、
          ブラウザのデータ削除、端末変更、シークレットモード利用などにより復元できなくなる場合があります。
        </p>
      </section>

      <section>
        <h2>禁止事項</h2>
        <p>
          不正アクセス、過度な自動操作、脆弱性の悪用、他ユーザーや運営を妨害する行為、
          サービスの趣旨に反する行為を禁止します。
        </p>
      </section>

      <section>
        <h2>免責</h2>
        <p>
          本サービスは娯楽目的で提供されます。外部データの遅延、誤り、サービス停止、
          ユーザーデータの消失などによって生じた損害について、運営は法令で認められる範囲で責任を負いません。
        </p>
      </section>
    </SitePage>
  );
}
