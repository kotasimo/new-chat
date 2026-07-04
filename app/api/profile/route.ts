import { NextResponse } from "next/server";
import { getProfileFromRequest } from "@/lib/auth-profile";
import { getDemoPredictionHistory } from "@/lib/data";
import { getPeriodicBonusState } from "@/lib/periodic-bonus";
import { createServerSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";

export async function GET(request: Request) {
  if (!hasSupabaseConfig() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Supabaseが設定されていません。" },
      { status: 503 },
    );
  }

  const supabase = createServerSupabaseClient({ admin: true });

  try {
    const profile = await getProfileFromRequest(request, supabase);
    const periodicBonus = getPeriodicBonusState(profile);
    const predictionHistory = await getDemoPredictionHistory(profile.id, 100);

    return NextResponse.json({
      profile,
      periodicBonus,
      predictionHistory,
    });
  } catch {
    return NextResponse.json(
      { error: "ゲスト情報を取得できませんでした。" },
      { status: 401 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!hasSupabaseConfig() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Supabaseが設定されていません。" },
      { status: 503 },
    );
  }

  const supabase = createServerSupabaseClient({ admin: true });
  const body = (await request.json()) as { displayName?: string };
  const displayName = normalizeDisplayName(body.displayName);

  if (!displayName) {
    return NextResponse.json(
      { error: "表示名は1〜16文字で入力してください。" },
      { status: 400 },
    );
  }

  try {
    const profile = await getProfileFromRequest(request, supabase);
    const { data, error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id)
      .select("id, display_name, points")
      .single();

    if (error || !data) {
      throw error ?? new Error("Profile could not be updated.");
    }

    return NextResponse.json({
      profile: {
        id: data.id,
        displayName: data.display_name,
        points: data.points,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "表示名を更新できませんでした。" },
      { status: 500 },
    );
  }
}

function normalizeDisplayName(value?: string) {
  const trimmed = value?.trim();

  if (!trimmed || trimmed.length > 16) {
    return null;
  }

  return trimmed;
}
