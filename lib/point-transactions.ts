import { createServerSupabaseClient } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

type PointTransactionType =
  | "initial_grant"
  | "prediction_stake"
  | "prediction_payout"
  | "prediction_refund"
  | "periodic_bonus";

type RecordPointTransactionInput = {
  profileId: string;
  predictionId?: string | null;
  transactionKey: string;
  type: PointTransactionType;
  amount: number;
  balanceAfter: number;
  description: string;
};

export async function recordPointTransaction(
  supabase: SupabaseClient,
  input: RecordPointTransactionInput,
) {
  const { error } = await supabase
    .from("point_transactions")
    .upsert(
      {
        profile_id: input.profileId,
        prediction_id: input.predictionId ?? null,
        transaction_key: input.transactionKey,
        type: input.type,
        amount: input.amount,
        balance_after: input.balanceAfter,
        description: input.description,
      },
      { onConflict: "transaction_key", ignoreDuplicates: true },
    );

  if (error) {
    throw new Error(`record point transaction: ${error.message}`);
  }
}

export async function ensureInitialPointTransaction(
  supabase: SupabaseClient,
  profileId: string,
  points: number,
) {
  try {
    await recordPointTransaction(supabase, {
      profileId,
      transactionKey: `initial:${profileId}`,
      type: "initial_grant",
      amount: points,
      balanceAfter: points,
      description: "台帳開始時の保有ポイント",
    });
  } catch {
    // Migrations may not have been applied yet in local development.
  }
}
