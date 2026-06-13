"use client";

import { ChevronRight, LogOut } from "lucide-react";
import { useEffect } from "react";

import { roleLabel } from "@/components/workout/shared";
import { useKeepScreenOnPreference } from "@/lib/use-wake-lock";
import type { UserProfile } from "@/lib/types";

export type ProfileSheetSection = "account" | "appearance" | "reminders" | "units";

const SECTION_ROWS: Array<{ section: ProfileSheetSection; label: string }> = [
  { section: "account", label: "Tili ja tiedot" },
  { section: "appearance", label: "Teema ja ulkoasu" },
  { section: "reminders", label: "Muistutukset" },
  { section: "units", label: "Yksiköt ja kieli" },
];

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]![0] ?? "" : "";
  return (first + last).toUpperCase();
}

export function ProfileSheet({
  user,
  coachFirstName,
  profileImageSrc,
  onOpenSection,
  onSignOut,
  onClose,
}: {
  user: UserProfile;
  coachFirstName?: string;
  profileImageSrc?: string | null;
  onOpenSection: (section: ProfileSheetSection) => void;
  onSignOut: () => void;
  onClose: () => void;
}) {
  const [keepScreenOn, setKeepScreenOn] = useKeepScreenOnPreference();

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const subtitle =
    user.role === "coach" || user.role === "admin"
      ? roleLabel(user.role)
      : `${roleLabel(user.role)}${coachFirstName ? ` · valmentaja ${coachFirstName}` : ""}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:color-mix(in_srgb,var(--background)_48%,transparent)] p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Profiili ja asetukset"
        className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-3xl bg-[var(--surface)] p-5 shadow-[0_24px_60px_-24px_var(--shadow)] sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-[var(--border-strong)] sm:hidden" aria-hidden="true" />

        <div className="flex items-center gap-3">
          <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface))] font-[family-name:var(--font-display)] text-lg font-bold text-[var(--accent)]">
            {profileImageSrc ? (
              <img src={profileImageSrc} alt="" className="size-full object-cover" />
            ) : (
              initialsFromName(user.fullName)
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate font-[family-name:var(--font-display)] text-xl font-bold text-[var(--text)]">{user.fullName}</p>
            <p className="truncate text-sm text-[var(--text-muted)]">{subtitle}</p>
          </div>
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
          <label className="flex items-start justify-between gap-3 rounded-2xl bg-[var(--surface-2)] px-4 py-3.5">
            <span className="min-w-0">
              <span id="profile-keep-screen-on" className="block text-base font-semibold text-[var(--text)]">
                Pidä näyttö päällä
              </span>
              <span className="mt-0.5 block text-sm text-[var(--text-subtle)]">Treenin kirjauksessa ja reseptiä lukiessa</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={keepScreenOn}
              aria-labelledby="profile-keep-screen-on"
              className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
                keepScreenOn ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border)] bg-[var(--surface-3)]"
              }`}
              onClick={() => setKeepScreenOn(!keepScreenOn)}
            >
              <span
                className={`pointer-events-none inline-block size-5 rounded-full bg-[var(--surface)] shadow-[0_1px_4px_-2px_var(--shadow)] transition-transform ${
                  keepScreenOn ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>

          <div className="mt-2 divide-y divide-[var(--border)]">
            {SECTION_ROWS.map((row) => (
              <button
                key={row.section}
                type="button"
                className="flex w-full items-center justify-between gap-3 py-4 text-left"
                onClick={() => onOpenSection(row.section)}
              >
                <span className="text-base font-medium text-[var(--text)]">{row.label}</span>
                <ChevronRight className="size-5 shrink-0 text-[var(--text-subtle)]" aria-hidden="true" />
              </button>
            ))}
          </div>

          <button
            type="button"
            className="mt-2 flex w-full items-center gap-2 py-4 text-left text-base font-semibold text-[var(--danger)]"
            onClick={onSignOut}
          >
            <LogOut className="size-5 shrink-0" aria-hidden="true" />
            Kirjaudu ulos
          </button>
        </div>
      </div>
    </div>
  );
}
