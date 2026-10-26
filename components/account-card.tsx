"use client";

import { Pencil, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchWithAnonymousAuth } from "@/lib/anonymous-auth";

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

  useEffect(() => {
    let ignore = false;

    async function loadProfile() {
      try {
        const response = await fetchWithAnonymousAuth("/api/profile");
        const result = await response.json();

        if (!response.ok || ignore) return;

        window.localStorage.setItem(DISPLAY_NAME_CACHE_KEY, result.profile.displayName);
        setDisplayName(result.profile.displayName);
        setDraftName(result.profile.displayName);
      } catch {
        // 取れなくても名前はキャッシュのままでいい。画面は止めない。
      }
    }

    loadProfile();

    return () => {
      ignore = true;
    };
  }, []);

  async function save() {
    const nextName = draftName.trim();

    if (!nextName || nextName.length > 16) return;

    setSaving(true);

    try {
      const response = await fetchWithAnonymousAuth("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: nextName }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "表示名を更新できませんでした。");
      }

      window.localStorage.setItem(DISPLAY_NAME_CACHE_KEY, result.profile.displayName);
      setDisplayName(result.profile.displayName);
      setDraftName(result.profile.displayName);
      setEditing(false);
    } catch {
      setDraftName(displayName);
    } finally {
      setSaving(false);
    }
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
            <small>この端末に予想履歴を保存しています</small>
          </div>
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
    </section>
  );
}
