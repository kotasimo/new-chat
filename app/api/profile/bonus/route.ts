import { NextResponse } from "next/server";
import { getProfileFromRequest } from "@/lib/auth-profile";
import { grantPeriodicBonusIfAvailable } from "@/lib/periodic-bonus";
import { createServerSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";

export async function POST(request: Request) {
  if (!hasSupabaseConfig() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Supabaseが設定されていません。" },
      { status: 503 },
    );
  }

  const supabase = createServerSupabaseClient({ admin: true });

  try {
    const profile = await getProfileFromRequest(request, supabase);
    const bonus = await grantPeriodicBonusIfAvailable(supabase, profile);

    return NextResponse.json({
      profile: bonus.profile,
      periodicBonus: {
        amount: bonus.amount,
        available: bonus.available,
        granted: bonus.granted,
        nextAvailableAt: bonus.nextAvailableAt,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : "ポイントを受け取れませんでした。",
      },
      { status: 500 },
    );
  }
}
