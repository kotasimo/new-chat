import { readFileSync } from "node:fs";

loadEnvFile();

const secret = process.env.SYNC_SECRET;
const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:3000";

const response = await fetch(`${baseUrl}/api/sync/polymarket`, {
  method: "POST",
  headers: secret ? { authorization: `Bearer ${secret}` } : {},
});

const body = await response.text();

if (!response.ok) {
  console.error(body);
  process.exit(1);
}

console.log(body);

function loadEnvFile() {
  try {
    const env = readFileSync(".env", "utf8");

    for (const line of env.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index);
      const value = trimmed.slice(index + 1).replace(/^"|"$/g, "");
      process.env[key] ??= value;
    }
  } catch {
    // The script can also run with environment variables supplied by the shell.
  }
}
