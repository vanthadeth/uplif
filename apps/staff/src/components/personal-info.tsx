"use client";
import { useState, type FormEvent } from "react";
import { Phone } from "lucide-react";
import { Button, DetailGroup, DetailRow, Input, QuickAction, useToast } from "@uplif/ui";
import type { Database } from "@uplif/supabase/types";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";

export type Personal = Database["public"]["Functions"]["my_personal"]["Returns"];

const tel = (n: string) => `tel:${n.replace(/[^+\d]/g, "")}`;
const blank = { name: null, relation: null, phone: null };

/** The Info tab: the person's own details, in three groups, with one Edit button for the whole tab. */
export function PersonalInfo({ personal, fullName, onSaved }: { personal: Personal | null; fullName: string; onSaved: (p: Personal) => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const none = t("st.profile.none");
  const p = personal ?? { nickname: null, date_of_birth: null, address: null, phones: [], emergency: [blank, blank] };
  const em = [p.emergency[0] ?? blank, p.emergency[1] ?? blank];
  const born = p.date_of_birth ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${p.date_of_birth}T00:00:00`)) : null;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (k: string) => String(f.get(k) ?? "").trim();
    setBusy(true);
    const body = { nickname: g("nickname"), date_of_birth: g("date_of_birth"), address: g("address"), phone1: g("phone1"), phone2: g("phone2"),
      e1_name: g("e1_name"), e1_relation: g("e1_relation"), e1_phone: g("e1_phone"), e2_name: g("e2_name"), e2_relation: g("e2_relation"), e2_phone: g("e2_phone") };
    const supabase = createClient();
    const { error } = await supabase.rpc("my_save_personal", { p: body });
    if (error) { setBusy(false); toast("error", t("st.profile.saveError")); return; }
    const { data } = await supabase.rpc("my_personal");
    setBusy(false);
    if (data) onSaved(data);
    setEditing(false);
    toast("success", t("st.profile.saved"));
  }

  if (editing) {
    return (
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <Input label={t("st.profile.nickname")} name="nickname" defaultValue={p.nickname ?? ""} maxLength={40} />
          <Input label={t("st.profile.birth")} name="date_of_birth" type="date" defaultValue={p.date_of_birth ?? ""} max={new Date().toISOString().slice(0, 10)} />
          <Input label={t("st.profile.phone1")} name="phone1" type="tel" inputMode="tel" defaultValue={p.phones[0] ?? ""} maxLength={20} />
          <Input label={t("st.profile.phone2")} name="phone2" type="tel" inputMode="tel" defaultValue={p.phones[1] ?? ""} maxLength={20} />
          <Input label={t("st.profile.address")} name="address" defaultValue={p.address ?? ""} maxLength={200} />
        </div>
        {[1, 2].map((n) => (
          <div key={n} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
            <h2 className="m-0 text-sm font-semibold text-muted">{t(`st.profile.contact${n}` as "st.profile.contact1")}</h2>
            <Input label={t("st.profile.mgrPhone")} name={`e${n}_phone`} type="tel" inputMode="tel" defaultValue={em[n - 1].phone ?? ""} maxLength={20} />
            <Input label={t("st.profile.mgrName")} name={`e${n}_name`} defaultValue={em[n - 1].name ?? ""} maxLength={120} />
            <Input label={t("st.profile.relation")} name={`e${n}_relation`} defaultValue={em[n - 1].relation ?? ""} maxLength={40} />
          </div>
        ))}
        <div className="flex gap-3">
          <Button type="button" className="flex-1" disabled={busy} onClick={() => setEditing(false)}>{t("st.step.cancel")}</Button>
          <Button type="submit" variant="primary" className="flex-1" loading={busy}>{t("st.profile.save")}</Button>
        </div>
      </form>
    );
  }

  const call = (n: string | null) => (n ? <QuickAction href={tel(n)} label={`${t("st.profile.call")} ${n}`}><Phone className="size-5" aria-hidden /></QuickAction> : undefined);
  const edit = <Button variant="quiet" className="h-7 min-h-0 px-2 text-sm" onClick={() => setEditing(true)}>{t("st.profile.edit")}</Button>;
  return (
    <div className="flex flex-col gap-4">
      <DetailGroup title={t("st.profile.g.personal")} action={edit}>
        <DetailRow label={t("st.profile.fullName")} value={fullName} empty={none} />
        <DetailRow label={t("st.profile.nickname")} value={p.nickname} empty={none} />
        <DetailRow label={t("st.profile.birth")} value={born} empty={none} />
      </DetailGroup>
      <DetailGroup title={t("st.profile.g.contact")}>
        <DetailRow label={t("st.profile.phone1")} value={p.phones[0]} empty={none} action={call(p.phones[0] ?? null)} />
        <DetailRow label={t("st.profile.phone2")} value={p.phones[1]} empty={none} action={call(p.phones[1] ?? null)} />
        <DetailRow label={t("st.profile.address")} value={p.address} empty={none} />
      </DetailGroup>
      <DetailGroup title={t("st.profile.g.emergency")}>
        {em.map((c, i) => (
          <DetailRow key={i} label={t(`st.profile.contact${i + 1}` as "st.profile.contact1")} value={c.phone}
            sub={[c.name, c.relation].filter(Boolean).join(" · ") || undefined} empty={none} action={call(c.phone)} />
        ))}
      </DetailGroup>
    </div>
  );
}
