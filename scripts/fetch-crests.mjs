// クラブのエンブレムをWikipediaから1回だけ取ってきて public/crests に保存し、
// lib/crests.ts を書き出す。実行時はこの生成物だけを使うので、外部へは取りに行かない。
//
//   node scripts/fetch-crests.mjs
//
// 取れなかったクラブは画面側で従来の色付きバッジに戻る。

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outDir = path.join(root, "public", "crests");
const mapFile = path.join(root, "lib", "crests.ts");
const userAgent = "YosokuCup/1.0 (crest fetcher; contact via repository)";

// Wikipediaの項目名が英語クラブ名から素直に決まらないものだけ、ここで指定する。
const titleOverrides = {
  Brighton: "Brighton & Hove Albion F.C.",
  Tottenham: "Tottenham Hotspur F.C.",
  Wolverhampton: "Wolverhampton Wanderers F.C.",
  "Wolverhampton Wanderers": "Wolverhampton Wanderers F.C.",
  Barcelona: "FC Barcelona",
  "Real Madrid": "Real Madrid CF",
  "Atletico Madrid": "Atlético Madrid",
  "Athletic Bilbao": "Athletic Bilbao",
  Betis: "Real Betis",
  Sevilla: "Sevilla FC",
  Valencia: "Valencia CF",
  Villarreal: "Villarreal CF",
  Celta: "RC Celta de Vigo",
  "Celta Vigo": "RC Celta de Vigo",
  Getafe: "Getafe CF",
  Osasuna: "CA Osasuna",
  Mallorca: "RCD Mallorca",
  Rayo: "Rayo Vallecano",
  "Rayo Vallecano": "Rayo Vallecano",
  Bayern: "FC Bayern Munich",
  "Bayern Munich": "FC Bayern Munich",
  Dortmund: "Borussia Dortmund",
  "Borussia Dortmund": "Borussia Dortmund",
  Leverkusen: "Bayer 04 Leverkusen",
  "RB Leipzig": "RB Leipzig",
  Stuttgart: "VfB Stuttgart",
  Frankfurt: "Eintracht Frankfurt",
  "Eintracht Frankfurt": "Eintracht Frankfurt",
  Bremen: "SV Werder Bremen",
  "Werder Bremen": "SV Werder Bremen",
  Freiburg: "SC Freiburg",
  Hoffenheim: "TSG 1899 Hoffenheim",
  Wolfsburg: "VfL Wolfsburg",
  "Borussia Monchengladbach": "Borussia Mönchengladbach",
  Mainz: "1. FSV Mainz 05",
  Augsburg: "FC Augsburg",
  Union: "1. FC Union Berlin",
  "Union Berlin": "1. FC Union Berlin",
  Inter: "Inter Milan",
  Milan: "AC Milan",
  Juventus: "Juventus FC",
  Napoli: "SSC Napoli",
  Roma: "AS Roma",
  Lazio: "SS Lazio",
  Atalanta: "Atalanta BC",
  Fiorentina: "ACF Fiorentina",
  Bologna: "Bologna FC 1909",
  Torino: "Torino FC",
  Udinese: "Udinese Calcio",
  Genoa: "Genoa CFC",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wikipediaは連続で叩くと429を返すので、間隔を空けて数回だけ待ち直す。 */
async function get(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, { headers: { "user-agent": userAgent } });

    if (response.status === 429 || response.status >= 500) {
      await sleep(1500 * (attempt + 1));
      continue;
    }

    return response;
  }

  return null;
}

async function summary(title) {
  const url =
    "https://en.wikipedia.org/api/rest_v1/page/summary/" +
    encodeURIComponent(title.replace(/ /g, "_"));
  const response = await get(url);

  if (!response?.ok) return null;

  await sleep(200);

  return response.json();
}

/** 同名の別物を拾わないよう、サッカークラブだと分かる項目だけ通す。 */
function looksLikeClub(page) {
  const text = `${page.description ?? ""} ${page.extract ?? ""}`.toLowerCase();

  return /football|soccer/.test(text);
}

function imageUrl(page) {
  const source = page.thumbnail?.source ?? page.originalimage?.source ?? "";
  if (!source) return "";

  // 幅を書き換えると400が返る画像があるので、返ってきたURLをそのまま使う。
  return source.split("?")[0];
}

async function resolveCrest(english) {
  const candidates = titleOverrides[english]
    ? [titleOverrides[english]]
    : [`${english} F.C.`, `${english} FC`, english];

  for (const title of candidates) {
    const page = await summary(title);
    if (!page || page.type !== "standard" || !looksLikeClub(page)) continue;

    const url = imageUrl(page);
    if (url) return { title, url };
  }

  return null;
}

function slugify(english) {
  return english
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const source = await readFile(path.join(root, "lib", "clubs.ts"), "utf8");
  const clubs = [...source.matchAll(/\{ english: "(.+?)", japanese: "(.+?)" \}/g)].map(
    ([, english, japanese]) => ({ english, japanese }),
  );

  await mkdir(outDir, { recursive: true });

  const found = new Map();
  const missing = [];

  for (const club of clubs) {
    if (found.has(club.japanese)) continue;

    const crest = await resolveCrest(club.english);

    if (!crest) {
      missing.push(club.english);
      continue;
    }

    const file = `${slugify(club.english)}.png`;
    const image = await get(crest.url);

    if (!image?.ok) {
      missing.push(club.english);
      continue;
    }

    // 画面では30px以下でしか出さないので、縦横96pxに収めて軽くする。
    const resized = await sharp(Buffer.from(await image.arrayBuffer()))
      .resize(96, 96, { fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();

    await writeFile(path.join(outDir, file), resized);
    found.set(club.japanese, file);
    console.log(`${club.japanese.padEnd(16)} ${crest.title}`);
  }

  const entries = [...found.entries()]
    .map(([japanese, file]) => `  ${JSON.stringify(japanese)}: "/crests/${file}",`)
    .join("\n");

  await writeFile(
    mapFile,
    `// scripts/fetch-crests.mjs の生成物。手で書き換えないで、スクリプトを実行し直す。\n` +
      `export const clubCrests: Record<string, string> = {\n${entries}\n};\n`,
    "utf8",
  );

  console.log(`\n${found.size} crests saved, ${missing.length} missing`);
  if (missing.length) console.log(`missing: ${missing.join(", ")}`);
}

main();
