# Yosoku Cup

無料ポイントで遊ぶプレミアリーグ予測ゲームです。UIは Next.js / React / TypeScript、DBは本番でも使う Supabase Postgres に統一しています。

## 開発起動

```bash
npm install
npm run dev
```

http://127.0.0.1:3000 を開きます。

## Supabase の準備

1. Supabaseで無料プロジェクトを作る
2. SQL Editorで `supabase/schema.sql` の中身を実行する
3. Project Settings > API から以下を `.env` に入れる

```bash
NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."
SYNC_SECRET="好きな長い文字列"
CRON_SECRET="SYNC_SECRETとは別の長い文字列"
APP_URL="http://127.0.0.1:3000"
NEXT_PUBLIC_SITE_URL="http://127.0.0.1:3000"
NEXT_PUBLIC_CONTACT_EMAIL=""
```

`SUPABASE_SERVICE_ROLE_KEY` はサーバー側の同期API専用です。ブラウザに出さないでください。

## Polymarket 同期

開発サーバーを起動した状態で、別ターミナルから実行します。

```bash
APP_URL="http://127.0.0.1:3000" npm run sync:polymarket
```

内部では `POST /api/sync/polymarket` が呼ばれ、Polymarketの各リーグの市場をSupabaseへ保存します。
対象はプレミアリーグ、ラ・リーガ、ブンデスリーガ、セリエA、J1リーグで、`lib/leagues.ts` に定義しています。

`APP_URL` を省くと `.env` の値、つまり本番が同期先になります。
5リーグ分の取り込みは1分前後かかり、Vercelの実行時間の上限に当たることがあるので、
手で流すときはローカルの開発サーバー経由が確実です。Supabaseは同じものを見ているため、
ローカルから流しても本番のデータが更新されます。

リーグを1つだけ流すこともできます。

```bash
curl -X POST -H "authorization: Bearer $SYNC_SECRET" "http://127.0.0.1:3000/api/sync/polymarket?league=j1"
```

## GitHub Actions で定期同期

`.github/workflows/sync-polymarket.yml` で、2時間おきに本番の同期APIを呼びます。

5リーグ分で2分ほどかかります。privateリポジトリはActionsの無料枠が月2000分なので、
これ以上間隔を詰めると枠を使い切ります。`vercel.json` のcronも1日1回同じAPIを呼びます。

GitHub リポジトリの Settings > Secrets and variables > Actions > Repository secrets に以下を入れます。

```bash
APP_URL="https://your-vercel-domain.vercel.app"
SYNC_SECRET="Vercel環境変数のSYNC_SECRETと同じ値"
```

Actions画面から `Sync Polymarket` を手動実行することもできます。

## 人名の日本語表記を直す

Polymarketから来た選手名が英語のまま表示されていたら、`lib/player-names.ts` に追加します。

```ts
export const playerNameMap: Record<string, string> = {
  "Harry Kane": "ハリー・ケイン",
};
```

追加後に `npm run sync:polymarket` を実行すると、DB上の表示名も更新されます。

## 主なファイル

- `app/page.tsx`: トップページ
- `components/market-board.tsx`: マーケット一覧と画面全体の状態
- `components/market-card.tsx`: 予測カード
- `components/prediction-panel.tsx`: 予想チケット
- `lib/data.ts`: Supabaseから画面用データを取得
- `lib/polymarket.ts`: Polymarket API取得とアプリ用データ変換
- `lib/player-names.ts`: 選手名の手動日本語辞書
- `app/api/sync/polymarket/route.ts`: Polymarket同期API
- `supabase/schema.sql`: 本番DBスキーマ
