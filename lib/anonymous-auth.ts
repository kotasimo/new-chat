"use client";

import { createClient } from "@supabase/supabase-js";

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getBrowserSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabaseが設定されていません。");
  }

  supabaseClient = createClient(url, anonKey);
  return supabaseClient;
}

export async function getAnonymousAccessToken() {
  const supabase = getBrowserSupabaseClient();
  const { data: sessionData } = await supabase.auth.getSession();
  let session = sessionData.session;

  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();

    if (error || !data.session) {
      if (error?.code === "anonymous_provider_disabled") {
        throw new Error("Supabaseで匿名ログインが無効です。設定を確認してください。");
      }

      throw new Error(error?.message ?? "ゲスト利用を開始できませんでした。");
    }

    session = data.session;
  }

  return session.access_token;
}

export async function fetchWithAnonymousAuth(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const token = await getAnonymousAccessToken();
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);

  return fetch(input, {
    ...init,
    headers,
  });
}

export type AuthState = {
  /** まだゲスト。ポイントは貯まるが、端末を変えると引き継げない。 */
  anonymous: boolean;
  email: string | null;
  /** Googleから来た表示名。無ければ null。 */
  name: string | null;
};

export async function getAuthState(): Promise<AuthState> {
  const supabase = getBrowserSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    return { anonymous: true, email: null, name: null };
  }

  const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };

  return {
    anonymous: Boolean(user.is_anonymous),
    email: user.email ?? null,
    name: meta.full_name ?? meta.name ?? null,
  };
}

/**
 * ゲストのままGoogleを紐づける。user.idが変わらないので、ポイントも予想も
 * そのまま引き継がれる。すでに別のアカウントで使われているGoogleだった
 * ときは紐づけできないので、呼び出し側で乗り換えるか決める。
 */
export async function linkGoogle(redirectTo: string) {
  const supabase = getBrowserSupabaseClient();
  const { error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: { redirectTo },
  });

  if (!error) {
    return { ok: true as const };
  }

  if (error.code === "identity_already_exists" || error.status === 422) {
    return { ok: false as const, reason: "already_used" as const, message: error.message };
  }

  if (error.code === "manual_linking_disabled") {
    return {
      ok: false as const,
      reason: "disabled" as const,
      message: "SupabaseでManual Linkingが無効です。設定を確認してください。",
    };
  }

  return { ok: false as const, reason: "other" as const, message: error.message };
}

/** 既存のGoogleアカウントでそのまま入る。いまのゲストの記録は引き継がれない。 */
export async function signInWithGoogle(redirectTo: string) {
  const supabase = getBrowserSupabaseClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  if (error) {
    throw new Error(error.message);
  }
}

/** ログアウトしても遊べる状態は保ちたいので、新しいゲストを作り直す。 */
export async function signOutToGuest() {
  const supabase = getBrowserSupabaseClient();
  await supabase.auth.signOut();
  await supabase.auth.signInAnonymously();
}
