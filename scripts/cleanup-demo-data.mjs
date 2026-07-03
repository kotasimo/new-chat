import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DEMO_EMAIL = "demo@yosoku-cup.local";
const STALE_DEMO_EMAIL_PATTERN = /^demo-[^@]+@yosoku-cup\.local$/;

loadEnvFile();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});

if (usersError) {
  throw usersError;
}

const users = usersData.users;
const keeper = users.find((user) => user.email === DEMO_EMAIL);
const staleUsers = users.filter((user) =>
  STALE_DEMO_EMAIL_PATTERN.test(user.email ?? ""),
);
const staleIds = staleUsers.map((user) => user.id);

if (staleIds.length) {
  await throwOnError(
    supabase.from("predictions").delete().in("profile_id", staleIds),
    "delete stale predictions",
  );
  await throwOnError(
    supabase.from("profiles").delete().in("id", staleIds),
    "delete stale profiles",
  );

  for (const user of staleUsers) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      throw error;
    }
  }
}

if (keeper) {
  await throwOnError(
    supabase.from("predictions").delete().eq("profile_id", keeper.id),
    "delete keeper test predictions",
  );
  await throwOnError(
    supabase
      .from("profiles")
      .update({ points: 10000, updated_at: new Date().toISOString() })
      .eq("id", keeper.id),
    "reset keeper points",
  );
}

console.log(
  JSON.stringify(
    {
      keptDemoUser: keeper ? { id: keeper.id, email: keeper.email } : null,
      deletedStaleDemoUsers: staleUsers.length,
      resetDemoPoints: Boolean(keeper),
    },
    null,
    2,
  ),
);

async function throwOnError(query, label) {
  const { error } = await query;

  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
}

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
