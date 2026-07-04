import { createServerSupabaseClient } from "@/lib/supabase";
import type { UserProfile } from "@/lib/types";

export const PERIODIC_BONUS_POINTS = 1000;
const PERIODIC_BONUS_COOLDOWN_SECONDS = 60 * 60;

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

type PeriodicBonusResult = {
  granted: boolean;
  points: number;
  next_available_at: string;
};

export function getPeriodicBonusState(profile: UserProfile) {
  const now = new Date();
  const currentSlotStart = new Date(now);
  currentSlotStart.setMinutes(0, 0, 0);
  const nextAvailableAt = new Date(currentSlotStart);
  nextAvailableAt.setHours(nextAvailableAt.getHours() + 1);
  const claimedAt = profile.periodicBonusClaimedAt
    ? new Date(profile.periodicBonusClaimedAt)
    : null;
  const available = !claimedAt || claimedAt.getTime() < currentSlotStart.getTime();

  return {
    amount: PERIODIC_BONUS_POINTS,
    available,
    granted: false,
    nextAvailableAt: nextAvailableAt.toISOString(),
  };
}

export async function grantPeriodicBonusIfAvailable(
  supabase: SupabaseClient,
  profile: UserProfile,
) {
  const { data, error } = await supabase.rpc("grant_periodic_points", {
    target_profile_id: profile.id,
    bonus_amount: PERIODIC_BONUS_POINTS,
    cooldown_seconds: PERIODIC_BONUS_COOLDOWN_SECONDS,
  });

  if (error) {
    throw new Error(error.message);
  }

  const result = Array.isArray(data)
    ? data[0] as PeriodicBonusResult | undefined
    : data as PeriodicBonusResult | undefined;

  if (!result) {
    return { profile, ...getPeriodicBonusState(profile) };
  }

  return {
    profile: {
      ...profile,
      points: result.points,
    },
    amount: PERIODIC_BONUS_POINTS,
    available: false,
    granted: result.granted,
    nextAvailableAt: result.next_available_at,
  };
}
