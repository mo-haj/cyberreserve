"use client";

import Link from "next/link";
import { useState } from "react";
import CitySelect from "@/components/CitySelect";
import { DEFAULT_CITY, cityByKey } from "@/lib/cities";
import { dictionary, type Locale } from "@/lib/i18n";
import { isValidFullName, isValidNickname } from "@/lib/profile-rules";

type ErrorKey =
  "fullName" | "nickname" | "nicknameTaken" | "homeCity" | "terms" | "generic";

export default function ProfileForm({
  locale,
  initialFullName,
  initialNickname,
  initialCity,
  termsAcceptedOn,
  next,
}: {
  locale: Locale;
  initialFullName: string;
  initialNickname: string;
  initialCity: string;
  /** Date the terms were accepted, or null if not yet. */
  termsAcceptedOn: string | null;
  /** Where to go after saving (first sign-in), or null to stay here. */
  next: string | null;
}) {
  const t = dictionary(locale);
  const [fullName, setFullName] = useState(initialFullName);
  const [nickname, setNickname] = useState(initialNickname);
  // Damascus until the player picks another city.
  const [homeCity, setHomeCity] = useState(initialCity || DEFAULT_CITY);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    // Same rules as the server, checked first for instant feedback.
    if (!isValidFullName(fullName)) return setError("fullName");
    if (!isValidNickname(nickname)) return setError("nickname");
    if (!cityByKey(homeCity)) return setError("homeCity");
    if (!termsAcceptedOn && !accept) return setError("terms");
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName,
          nickname,
          homeCity,
          acceptTerms: termsAcceptedOn ? undefined : accept,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401)
        return window.location.assign("/login?next=/profile");
      if (!res.ok)
        return setError(
          (
            [
              "fullName",
              "nickname",
              "nicknameTaken",
              "homeCity",
              "terms",
            ] as const
          ).includes(body.error)
            ? body.error
            : "generic",
        );
      // Show "Saved ✓" on the button for a moment, then go back
      // (to where sign-in started, or the home page).
      setSaved(true);
      setTimeout(() => window.location.assign(next ?? "/"), 700);
    } catch {
      setError("generic");
    } finally {
      setBusy(false);
    }
  }

  // Centred text: names can be Arabic or English, so neither side is "right".
  const field =
    "mt-1 w-full bg-void/70 px-4 py-2 text-center text-ink placeholder:text-muted/60 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.35)] outline-none focus:shadow-[inset_0_0_0_1px_rgba(41,224,255,0.8)] aria-[invalid=true]:shadow-[inset_0_0_0_1px_rgba(255,45,85,0.9)]";

  return (
    <form onSubmit={submit} noValidate className="space-y-3.5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="block text-center font-semibold text-ink">
            {t.profile.fullName}
          </span>
          <input
            className={field}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            maxLength={60}
            required
            aria-invalid={error === "fullName"}
            aria-describedby="fullName-hint"
          />
          <span
            id="fullName-hint"
            className="mt-1 block text-center text-[0.6875rem] leading-snug text-muted"
          >
            {t.profile.fullNameHint}
          </span>
        </label>

        <label className="block">
          <span className="block text-center font-semibold text-ink">
            {t.profile.nickname}
          </span>
          <input
            className={`${field} font-hud`}
            value={nickname}
            onChange={(e) => setNickname(e.target.value.replace(/\s/g, ""))}
            autoComplete="nickname"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={20}
            required
            aria-invalid={error === "nickname" || error === "nicknameTaken"}
            aria-describedby="nickname-hint"
          />
          <span
            id="nickname-hint"
            className="mt-1 block text-center text-[0.6875rem] leading-snug text-muted"
          >
            {t.profile.nicknameHint}
          </span>
        </label>
      </div>

      <div>
        <span className="block text-center font-semibold text-ink">
          {t.profile.city}
        </span>
        <div className="mt-1">
          <CitySelect
            locale={locale}
            value={homeCity}
            onChange={(k) => setHomeCity(k)}
            label={t.profile.city}
            invalid={error === "homeCity"}
            describedBy="city-hint"
          />
        </div>
        <span
          id="city-hint"
          className="mt-1 block text-center text-[0.6875rem] leading-snug text-muted"
        >
          {t.profile.cityHint}
        </span>
      </div>

      {termsAcceptedOn ? (
        <p className="text-center text-xs text-muted">
          {t.profile.agreedOn(termsAcceptedOn)}
        </p>
      ) : (
        <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={accept}
            onChange={(e) => setAccept(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#9D5CFF]"
            aria-invalid={error === "terms"}
          />
          <span>
            {t.profile.agree}{" "}
            <Link
              href="/terms"
              target="_blank"
              className="text-cyan underline underline-offset-4"
            >
              {t.profile.termsLink}
            </Link>{" "}
            {t.profile.and}{" "}
            <Link
              href="/privacy"
              target="_blank"
              className="text-cyan underline underline-offset-4"
            >
              {t.profile.privacyLink}
            </Link>
          </span>
        </label>
      )}

      {error && (
        <p role="alert" className="text-sm text-busy">
          {t.profile.errors[error]}
        </p>
      )}
      <button
        type="submit"
        className="btn-neon w-full"
        disabled={busy || saved}
        aria-live="polite"
      >
        {saved
          ? `✓ ${t.profile.saved}`
          : busy
            ? t.profile.saving
            : next
              ? t.profile.saveContinue
              : t.profile.save}
      </button>
    </form>
  );
}
