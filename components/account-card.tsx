"use client";

import { LogOut, Pencil, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import {
  fetchWithAnonymousAuth,
  getAuthState,
  linkGoogle,
  signInWithGoogle,
  signOutToGuest,
  type AuthState,
} from "@/lib/anonymous-auth";

const DISPLAY_NAME_CACHE_KEY = "yosoku_display_name";

/** 右の列に出すアカウント欄。どのページの side-panel にも置けるよう、単体で動く。 */
export function AccountCard() {
  const [displayName, setDisplayName] = useState(() => {
    if (typeof window === "undefined") {
      return "ゲスト";
    }

    return window.localStorage.getItem(DISPLAY_NAME_CACHE_KEY) ?? "ゲスト";
  });
  const [draftName, setDraftName] = useState(displayName);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const [state, response] = await Promise.all([
          getAuthState(),
          fetchWithAnonymousAuth("/api/profile"),
        ]);
        const result = await response.json();

        if (ignore) return;

        setAuth(state);

        if (response.ok) {
          // Googleの名前は、まだ「ゲスト」のままの人にだけ入れる。
          const next =
            result.profile.displayName === "ゲスト" && state.name
              ? await rename(state.name)
              : result.profile.displayName;

          window.localStorage.setItem(DISPLAY_NAME_CACHE_KEY, next);
          setDisplayName(next);
          setDraftName(next);
        }
      } catch {
        // 取れなくても名前はキャッシュのままでいい。画面は止めない。
      }
    }

    load();

    return () => {
      ignore = true;
    };
  }, []);

  async function rename(nextName: string) {
    const response = await fetchWithAnonymousAuth("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: nextName.slice(0, 16) }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error ?? "表示名を更新できませんでした。");
    }

    return result.profile.displayName as string;
  }

  async function save() {
    const nextName = draftName.trim();

    if (!nextName || nextName.length > 16) return;

    setSaving(true);

    try {
      const saved = await rename(nextName);

      window.localStorage.setItem(DISPLAY_NAME_CACHE_KEY, saved);
      setDisplayName(saved);
      setDraftName(saved);
      setEditing(false);
    } catch {
      setDraftName(displayName);
    } finally {
      setSaving(false);
    }
  }

  async function connectGoogle() {
    setBusy(true);
    setNotice("");

    try {
      const redirectTo = window.location.href;
      const result = await linkGoogle(redirectTo);

      if (result.ok) return;

      if (result.reason === "already_used") {
        const switchAccount = window.confirm(
          "このGoogleアカウントは別のアカウントで使われています。そちらでログインしますか？\n" +
            "いまのゲストのポイントと予想は引き継がれません。",
        );

        if (switchAccount) {
          await signInWithGoogle(redirectTo);
          return;
        }

        setNotice("ログインを取りやめました。");
        return;
      }

      setNotice(result.message);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "ログインできませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (!window.confirm("ログアウトすると、新しいゲストとして遊び直します。")) return;

    setBusy(true);
    window.localStorage.removeItem(DISPLAY_NAME_CACHE_KEY);
    await signOutToGuest();
    window.location.reload();
  }

  return (
    <section className="account-card">
      <span className="account-avatar" aria-hidden="true">
        <UserRound size={18} />
      </span>

      {editing ? (
        <div className="account-edit">
          <input
            aria-label="表示名"
            autoFocus
            maxLength={16}
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
              if (event.key === "Escape") {
                setDraftName(displayName);
                setEditing(false);
              }
            }}
          />
          <button disabled={saving} type="button" onClick={save}>
            {saving ? "保存中" : "保存"}
          </button>
        </div>
      ) : (
        <>
          <div className="account-name">
            <strong suppressHydrationWarning>{displayName}</strong>
            {auth && !auth.anonymous ? <small>{auth.email}</small> : null}
            {notice ? <small className="account-notice">{notice}</small> : null}
          </div>

          {auth?.anonymous === false ? (
            <button
              aria-label="ログアウト"
              className="account-rename"
              disabled={busy}
              type="button"
              onClick={logout}
            >
              <LogOut size={14} aria-hidden="true" />
            </button>
          ) : null}

          <button
            aria-label="アカウント名を変更"
            className="account-rename"
            type="button"
            onClick={() => setEditing(true)}
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
        </>
      )}

      {auth?.anonymous ? (
        <button className="account-login" disabled={busy} type="button" onClick={connectGoogle}>
          {busy ? "接続中..." : "Googleでログイン"}
        </button>
      ) : null}
    </section>
  );
}
