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
