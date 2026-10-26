// 「合計N点以上」「前半にN点以上」のマーケットを一覧から外す。
// 同期は upsert しかしないので、取り込みをやめても既存の行は残り続ける。
//
//   node scripts/hide-total-goal-markets.mjs          確認だけ
//   node scripts/hide-total-goal-markets.mjs --apply  実際に隠す
//
// predictions は market を on delete cascade で参照している。消すと利用者の
// 予想まで道連れになるので、active を false にするだけにしてある。戻すときは
// --restore を付ける。

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const pattern = /-\d{4}-\d{2}-\d{2}-(first-half-)?total-\d+pt\d+$/;

async function loadEnv() {
  const text = await readFile(new URL("../.env", import.meta.url), "utf8");

  // 改行はCRLFのこともあり、値はクォート有無どちらもありうる。
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;

    const value = match[2].trim().replace(/^["'](.*)["']$/, "$1");
    if (value && !process.env[match[1]]) {
      process.env[match[1]] = value;
    }
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const restore = process.argv.includes("--restore");

  await loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(".env に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が要ります。");
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // selectは既定で1000件までしか返らないので、最後まで読む。
  const rows = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("markets")
      .select("id, slug, title, active")
      .eq("active", !restore)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  const targets = rows.filter((market) => pattern.test(market.slug));

  console.log(`対象 ${targets.length} 件 / 走査 ${rows.length} 件`);
  targets.slice(0, 5).forEach((market) => console.log(`  ${market.title}`));
  if (targets.length > 5) console.log(`  ... 他 ${targets.length - 5} 件`);

  if (!targets.length) return;

  if (!apply && !restore) {
    console.log("\n確認のみ。実行するには --apply を付ける。");
    return;
  }

  // インデックスの効くidで、まとめて更新する。
  for (let i = 0; i < targets.length; i += 100) {
    const ids = targets.slice(i, i + 100).map((market) => market.id);
    const { error: updateError } = await supabase
      .from("markets")
      .update({ active: restore, updated_at: new Date().toISOString() })
      .in("id", ids);

    if (updateError) throw updateError;
  }

  console.log(`\n${targets.length} 件を active=${restore} にした。`);
}

main();
