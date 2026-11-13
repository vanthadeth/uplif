"use client";
import { useState } from "react";
import { SignInMethods, type SignInMethodsData } from "@uplif/auth";
import { Check, Info, MessageCircle, Phone } from "lucide-react";
import { Button, Card, DetailGroup, DetailRow, PhotoHero, QuickAction, Reveal, Tabs } from "@uplif/ui";
import { telegramLoginUrl } from "@uplif/auth";
import { createClient } from "@/lib/supabase/client";
import { PersonalInfo, type Personal } from "@/components/personal-info";
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
export function ProfileView({ methods, failed, personal: initial }: { methods: SignInMethodsData | null; failed: boolean; personal: Personal | null }) {
  const { t, locale } = useI18n();
  const state = useMe();
  const profile = useProfile();
  const { name, branch } = useDisplay(state, locale);
  const picture = usePicture();
  const [tab, setTab] = useState("info");
  const [personal, setPersonal] = useState<Personal | null>(initial);
  const [linking, setLinking] = useState(false);
  const none = t("st.profile.none");
  const since = profile?.employment_date ? new Date(`${profile.employment_date}T00:00:00`) : null;
  const date = since ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(since) : null;
  const tenure = since ? tenureText(since, locale) : null;
  const position = localName(profile?.position, locale);
  const role = localName(profile?.role, locale);
  const mgr = profile?.manager;
  async function linkTelegram() {
    setLinking(true);
    const { data, error } = await createClient().rpc("start_telegram_link");
    if (error || !data) { setLinking(false); return; }
    location.href = telegramLoginUrl({ ticket: data, next: "/profile" });
  }
  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <Reveal>
        <PhotoHero name={name || "?"} src={picture.src} busy={picture.busy} title={name}
          subtitle={[position ?? t("st.bar.role"), branch].filter(Boolean).join(" · ")}
          changeLabel={t("st.photo.change")} removeLabel={t("st.photo.remove")}
          onPick={(f) => void picture.change(f)} onRemove={() => void picture.remove()}>
          {date && <p className="m-0 mt-1 text-sm text-white/80">{t("st.profile.since")} {date}{tenure ? ` · ${tenure}` : ""}</p>}
        </PhotoHero>
      </Reveal>
      {/* The photo scrolls away with the page; once it has, the tabs stay at the top. */}
      <div className="sticky top-0 z-20 -mx-4 bg-ground px-4">
      <Tabs label={t("st.profile.tabs")} value={tab} onChange={setTab}
        items={[{ id: "info", label: t("st.profile.tabInfo") }, { id: "work", label: t("st.profile.work") }, { id: "accounts", label: t("st.profile.tabAccounts") }]} />
      </div>
      {tab === "info" ? (
        <Reveal><div role="tabpanel" id="panel-info" aria-labelledby="tab-info" className="flex flex-col gap-3">
          <PersonalInfo personal={personal} fullName={name} onSaved={setPersonal} />
          <p className="flex items-start gap-2 text-sm text-muted"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{t("st.profile.infoNote")}</p>
        </div></Reveal>
      ) : tab === "work" ? (
        <Reveal><div role="tabpanel" id="panel-work" aria-labelledby="tab-work" className="flex flex-col gap-3">
          {!profile && <p role="alert" className="text-danger-ink">{t("st.profile.error")}</p>}
          <DetailGroup title={t("st.profile.g.job")}>
            <DetailRow label={t("st.profile.department")} value={localName(profile?.department, locale)} empty={none} />
            <DetailRow label={t("st.profile.position")} value={position} empty={none} />
            <DetailRow label={t("st.profile.role")} value={role} empty={none} />
            <DetailRow label={t("st.profile.since")} value={date} sub={tenure} empty={none} />
          </DetailGroup>
          <DetailGroup title={t("st.profile.reportsTo")}>
            <DetailRow label={t("st.profile.mgrName")} value={localName(mgr, locale)} empty={none} />
            <DetailRow label={t("st.profile.mgrPosition")} value={localName(mgr?.position, locale)} empty={none} />
            <DetailRow label={t("st.profile.mgrPhone")} value={mgr?.phone} empty={none}
              action={mgr?.phone ? <QuickAction href={`tel:${mgr.phone.replace(/[^+\d]/g, "")}`} label={`${t("st.profile.call")} ${mgr.phone}`}><Phone className="size-5" aria-hidden /></QuickAction> : undefined} />
            <DetailRow label={t("st.profile.mgrTelegram")} value={mgr?.telegram ? `@${mgr.telegram}` : null} empty={none}
              action={mgr?.telegram ? <QuickAction external href={`https://t.me/${mgr.telegram}`} label={t("st.profile.message")}><MessageCircle className="size-5" aria-hidden /></QuickAction> : undefined} />
          </DetailGroup>
          <p className="flex items-start gap-2 text-sm text-muted"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{t("st.profile.workNote")}</p>
        </div></Reveal>
      ) : (
        <div role="tabpanel" id="panel-accounts" aria-labelledby="tab-accounts" className="flex flex-col gap-4">
          {methods && !methods.telegram && telegramEnabled && (
            <Card className="flex flex-col gap-3 border-transparent bg-primary-soft p-4">
              <div><b>{t("st.profile.tg.title")}</b><p className="m-0 mt-1 text-sm text-muted">{t("st.profile.tg.lead")}</p></div>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {(["b1", "b2", "b3"] as const).map((k) => (
                  <li key={k} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden />{t(`st.profile.tg.${k}` as "st.profile.tg.b1")}</li>
                ))}
              </ul>
              <Button variant="primary" className="w-full" loading={linking} onClick={linkTelegram}>{t("st.profile.tg.cta")}</Button>
            </Card>
          )}
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
