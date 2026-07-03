# Yosoku Cup

無料ポイントで遊ぶワールドカップ予測ゲームです。UIは Next.js / React / TypeScript、DBは本番でも使う Supabase Postgres に統一しています。

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
```

`SUPABASE_SERVICE_ROLE_KEY` はサーバー側の同期API専用です。ブラウザに出さないでください。

## Polymarket 同期

開発サーバーを起動した状態で、別ターミナルから実行します。

```bash
npm run sync:polymarket
```

内部では `POST /api/sync/polymarket` が呼ばれ、Polymarketのワールドカップ関連市場をSupabaseへ保存します。

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
