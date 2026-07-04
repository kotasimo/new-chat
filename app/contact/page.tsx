import { SitePage } from "@/components/site-page";

export const metadata = {
  title: "お問い合わせ | Yosoku Cup",
};

const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export default function ContactPage() {
  return (
    <SitePage
      title="お問い合わせ"
      description="不具合、データ表示、サービス内容についての連絡先です。"
    >
      <section>
        <h2>連絡先</h2>
        {contactEmail ? (
          <p>
            お問い合わせは
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
            までお願いします。
          </p>
        ) : (
          <p>
            公開時に連絡先メールアドレスを設定します。
            環境変数 <code>NEXT_PUBLIC_CONTACT_EMAIL</code> にメールアドレスを入れると、このページに表示されます。
          </p>
        )}
      </section>

      <section>
        <h2>送ってほしい情報</h2>
        <p>
          不具合の場合は、発生した画面、操作内容、表示されたメッセージ、利用ブラウザ、
          可能であればスクリーンショットを添えてください。
        </p>
      </section>

      <section>
        <h2>注意</h2>
        <p>
          Yosoku Cupは無料ポイント制のゲームです。現金、暗号資産、換金、投資助言に関する問い合わせには対応できません。
        </p>
      </section>
    </SitePage>
  );
}
