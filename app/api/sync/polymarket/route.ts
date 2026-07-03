import { NextResponse } from "next/server";
import {
  buildAppMarketRecordsFromEvents,
  fetchPolymarketWorldCupEvents,
} from "@/lib/polymarket";
import { createServerSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const syncSecret = process.env.SYNC_SECRET;
  const authorization = request.headers.get("authorization");

  if (syncSecret && authorization !== `Bearer ${syncSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasSupabaseConfig() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error:
          "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 503 },
    );
  }

  const supabase = createServerSupabaseClient({ admin: true });
  const gammaEvents = await fetchPolymarketWorldCupEvents(80);
  const syncedAt = new Date().toISOString();
  const apiRecords = buildAppMarketRecordsFromEvents(gammaEvents);

  const records = apiRecords.map((record) => ({
    market: { ...record.market, synced_at: syncedAt },
    outcomes: record.outcomes,
  }));

  const { error: deleteError } = await supabase
    .from("markets")
    .delete()
    .in("source", ["polymarket", "manual"]);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error: marketError } = await supabase
    .from("markets")
    .upsert(
      records.map((record) => record.market),
      { onConflict: "id" },
    );

  if (marketError) {
    return NextResponse.json({ error: marketError.message }, { status: 500 });
  }

  const { error: outcomeError } = await supabase
    .from("outcomes")
    .upsert(records.flatMap((record) => record.outcomes), { onConflict: "id" });

  if (outcomeError) {
    return NextResponse.json({ error: outcomeError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    imported: records.length,
    apiMarkets: apiRecords.length,
    manualMarkets: 0,
    syncedAt,
  });
}
