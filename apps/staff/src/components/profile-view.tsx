"use client";
import { useEffect, useRef, useState } from "react";
import { SignInMethods, type SignInMethodsData } from "@uplif/auth";
import { Briefcase, Building2, CalendarDays, Info, MapPin, UserRound, type LucideIcon } from "lucide-react";
import { Card, PhotoHero, Reveal, Tabs } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { usePicture } from "@/components/picture-context";
import { localName, useDisplay, useMe, useProfile } from "@/components/me-context";

/** "1 year 3 months", in the chosen language; null for less than a month. */
function tenureText(since: Date, locale: string): string | null {
  const now = new Date();
  const months = (now.getFullYear() - since.getFullYear()) * 12 + now.getMonth() - since.getMonth() - (now.getDate() < since.getDate() ? 1 : 0);
  if (months < 1) return null;
  const unit = (n: number, u: "year" | "month") => new Intl.NumberFormat(locale, { style: "unit", unit: u, unitDisplay: "long" }).format(n);
  const y = Math.floor(months / 12), m = months % 12;
  return [y > 0 ? unit(y, "year") : "", m > 0 ? unit(m, "month") : ""].filter(Boolean).join(" ");
}

const telegramEnabled = process.env.NEXT_PUBLIC_TELEGRAM_LOGIN === "true";

/** Profile: who you are at work, and the sign-in methods linked to this account (shared panel from packages/auth). */
export function ProfileView({ methods, failed }: { methods: SignInMethodsData | null; failed: boolean }) {
  const { t, locale } = useI18n();
  const state = useMe();
  const profile = useProfile();
  const { name, branch } = useDisplay(state, locale);
  const picture = usePicture();
  const [tab, setTab] = useState("work");
  // The photo header shrinks to 4:3 once the page is scrolled. Two thresholds stop it flickering, and the scroll position is
  // adjusted by the height that changed so the content under it does not jump.
  const [compact, setCompact] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const was = useRef(false);
  useEffect(() => {
    const on = () => {
      const y = window.scrollY;
      const next = was.current ? y > 40 : y > 200;
      if (next !== was.current) {
        const before = heroRef.current?.getBoundingClientRect().height ?? 0;
        was.current = next;
        setCompact(next);
        requestAnimationFrame(() => {
          const after = heroRef.current?.getBoundingClientRect().height ?? before;
          if (after !== before) window.scrollBy(0, after - before);
        });
      }
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const none = t("st.profile.none");
  const since = profile?.employment_date ? new Date(`${profile.employment_date}T00:00:00`) : null;
  const date = since ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(since) : null;
  const tenure = since ? tenureText(since, locale) : null;
  const position = localName(profile?.position, locale);
  const rows: [LucideIcon, string, string | null][] = [
    [Briefcase, t("st.profile.position"), position],
    [MapPin, t("st.profile.branch"), branch],
    [Building2, t("st.profile.department"), localName(profile?.department, locale)],
    [UserRound, t("st.profile.reportsTo"), localName(profile?.reports_to, locale)],
    [CalendarDays, t("st.profile.since"), date],
  ];
  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <Reveal className="sticky top-2 z-20">
        <div ref={heroRef}>
        <PhotoHero compact={compact} name={name || "?"} src={picture.src} busy={picture.busy} title={name}
          subtitle={[position ?? t("st.bar.role"), branch].filter(Boolean).join(" · ")}
          changeLabel={t("st.photo.change")} removeLabel={t("st.photo.remove")}
          onPick={(f) => void picture.change(f)} onRemove={() => void picture.remove()}>
          {tenure && <p className="m-0 mt-1 text-sm text-white/80">{t("st.profile.since")} {date} · {tenure}</p>}
        </PhotoHero>
        </div>
      </Reveal>
      <Tabs label={t("st.profile.tabs")} value={tab} onChange={setTab}
        items={[{ id: "work", label: t("st.profile.work") }, { id: "accounts", label: t("st.profile.accounts") }]} />
      {tab === "work" ? (
        <Reveal><div role="tabpanel" id="panel-work" aria-labelledby="tab-work" className="flex flex-col gap-3">
          {!profile && <p role="alert" className="text-danger-ink">{t("st.profile.error")}</p>}
          <Card className="divide-y divide-line">
            {rows.map(([Icon, label, value]) => (
              <div key={label} className="flex min-h-16 items-center gap-3 px-4 py-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-control bg-primary-soft text-primary-ink"><Icon className="size-5" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <span className="block text-sm text-muted">{label}</span>
                  <b className={`block truncate ${value ? "" : "font-normal text-muted"}`}>{value ?? none}</b>
                </div>
              </div>
            ))}
          </Card>
          <p className="flex items-start gap-2 text-sm text-muted"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{t("st.profile.note")}</p>
        </div></Reveal>
      ) : (
        <div role="tabpanel" id="panel-accounts" aria-labelledby="tab-accounts">
          <SignInMethods methods={methods} failed={failed} telegramEnabled={telegramEnabled} labels={{
            title: t("st.account.title"), intro: t("st.account.intro"),
            google: t("st.account.google"), telegram: t("st.account.telegram"), phone: t("st.account.phone"),
            connected: t("st.account.connected"), notConnected: t("st.account.notConnected"),
            link: t("st.account.link"), unlink: t("st.account.unlink"), cancel: t("st.step.cancel"), close: t("st.account.close"),
            phonePaused: t("st.account.phonePaused"), lastMethod: t("st.account.lastMethod"), lastMethodHint: t("st.account.lastMethodHint"),
            unlinkTitle: { google: t("st.account.unlinkTitle.google"), telegram: t("st.account.unlinkTitle.telegram") },
            unlinkBody: t("st.account.unlinkBody"), linkedTelegram: t("st.account.linked.telegram"),
            unlinked: { google: t("st.account.unlinked.google"), telegram: t("st.account.unlinked.telegram") },
            errorGeneric: t("st.account.error.generic"), errorTelegramTaken: t("st.account.error.telegramTaken"),
            loadFailed: t("st.account.loadFailed"), loadFailedBody: t("st.account.loadFailedBody"),
          }} />
        </div>
      )}
    </div>
  );
}
