import { ensureInitialPointTransaction } from "@/lib/point-transactions";
import { createServerSupabaseClient } from "@/lib/supabase";
import type { UserProfile } from "@/lib/types";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export async function getProfileFromRequest(
  request: Request,
  supabase: SupabaseClient,
) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!token) {
    throw new Error("AUTH_REQUIRED");
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("AUTH_REQUIRED");
  }

  return getOrCreateProfileForUser(supabase, data.user.id);
}

export async function getOrCreateProfileForUser(
  supabase: SupabaseClient,
  userId: string,
  displayName = "ゲスト",
): Promise<UserProfile> {
  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("profiles")
    .select("id, display_name, points, periodic_bonus_claimed_at")
    .eq("id", userId)
    .maybeSingle();

  if (existingProfileError) {
    throw existingProfileError;
  }

  const { data: profile, error: profileError } = existingProfile
    ? { data: existingProfile, error: null }
    : await supabase
      .from("profiles")
      .insert({
        id: userId,
        display_name: displayName,
        points: 10000,
      })
      .select("id, display_name, points, periodic_bonus_claimed_at")
      .single();

  if (profileError || !profile) {
    throw profileError ?? new Error("Profile could not be created.");
  }

  await ensureInitialPointTransaction(supabase, profile.id, profile.points);

  return {
    id: profile.id,
    displayName: profile.display_name ?? displayName,
    points: profile.points,
    periodicBonusClaimedAt: profile.periodic_bonus_claimed_at ?? undefined,
  };
}
