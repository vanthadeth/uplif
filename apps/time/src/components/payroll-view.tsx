"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { BottomSheet, Button, EmptyState, ErrorState, Input, Select, Skeleton, Tabs, Toggle, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useTime } from "@/components/time-context";
import { languageOf } from "@/lib/languages";
import { money, pick } from "@/lib/format";
import { fill, type MessageKey } from "@/lib/messages";

type T = (k: MessageKey) => string;
interface Person {
  employee_id: string; name: string; name_local: string | null; position_name: string | null; position_name_local: string | null;
  pay_currency: string | null; payment_method: string | null; fixed_amount: number | null; achievement_amount: number | null; commission_rate: number | null;
}
interface Item { id: string; code: string; name: string; name_local: string | null; category: string; reference_only: boolean }
interface Term {
  id: string; pay_item_id: string; code: string; name: string; name_local: string | null; category: string; amount: number | null; rate_pct: number | null;
  currency_code: string; effective_from: string; effective_to: string | null; note: string | null;
}
interface Profile { pay_currency: string; payment_method: string; account_name: string | null; account_no: string | null; bank_name: string | null; note: string | null }
interface Settings { rate_divisor: string; overtime_multiplier: number; require_second_approver: boolean; close_blocks_on_review: boolean }

/** Payroll, slice T3: who is paid what for reference, how they are paid, and the company's payroll settings. Salary is shown only at company scope. */
export function PayrollView() {
  const { t, locale } = useI18n();
  const { canViewPay, canPaySettings } = useTime();
  const [tab, setTab] = useState<"people" | "settings">("people");
  if (!canViewPay && !canPaySettings) {
    return (
      <main className="flex flex-col gap-4 p-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("tm.payroll.title")}</h1>
        <EmptyState title={t("tm.pr.noAccess.title")} body={t("tm.pr.noAccess.body")} />
      </main>
    );
  }
  const tabs = [...(canViewPay ? [{ id: "people", label: t("tm.pr.people") }] : []), ...(canPaySettings ? [{ id: "settings", label: t("tm.pr.settings") }] : [])];
  const active = canViewPay ? tab : "settings";
  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold tracking-tight">{t("tm.payroll.title")}</h1>
      {tabs.length > 1 && <Tabs label={t("tm.payroll.title")} value={active} onChange={(v) => setTab(v as "people" | "settings")} items={tabs} />}
      {active === "people" ? <People t={t} locale={locale} /> : <SettingsForm t={t} />}
    </main>
  );
}

function People({ t, locale }: { t: T; locale: string }) {
  const [rows, setRows] = useState<Person[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Person | null>(null);

  const load = useCallback(async () => {
    setRows(null); setFailed(false);
    const { data, error } = await createClient().rpc("payroll_people");
    if (error) { setFailed(true); return; }
    setRows((data ?? []) as Person[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows ?? []).filter((p) => !n || p.name.toLowerCase().includes(n) || (p.name_local ?? "").toLowerCase().includes(n));
  }, [rows, q]);

  return (
    <>
      <p className="text-sm text-muted">{t("tm.pr.reference")}</p>
      <Input label={t("tm.pr.search")} value={q} onChange={(e) => setQ(e.target.value)} />
      {failed ? (
        <ErrorState title={t("tm.pr.error")} action={<Button onClick={load}><RefreshCw className="size-4" aria-hidden />{t("tm.retry")}</Button>} />
      ) : rows === null ? (
        <div className="flex flex-col gap-2" aria-busy="true">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 w-full rounded-card" />)}</div>
      ) : shown.length === 0 ? (
        <EmptyState title={t("tm.pr.empty")} />
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
          {shown.map((p) => {
            const cur = p.pay_currency ?? "USD";
            return (
              <li key={p.employee_id} className="border-b border-line last:border-b-0">
                <button type="button" className="flex min-h-14 w-full flex-col gap-1 px-4 py-3 text-start" onClick={() => setOpen(p)}>
                  <b>{pick(locale, p.name, p.name_local)}</b>
                  <span className="text-sm text-muted">
                    {t("tm.pr.fixed")} {p.fixed_amount == null ? t("tm.pr.notSet") : money(locale, p.fixed_amount, cur)}
                    {" · "}{t("tm.pr.achievement")} {p.achievement_amount == null ? t("tm.pr.notSet") : money(locale, p.achievement_amount, cur)}
                    {" · "}{t("tm.pr.commission")} {p.commission_rate == null ? t("tm.pr.notSet") : `${p.commission_rate}%`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <PersonSheet t={t} locale={locale} person={open} onClose={() => setOpen(null)} onSaved={load} />
    </>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

function PersonSheet({ t, locale, person, onClose, onSaved }: { t: T; locale: string; person: Person | null; onClose: () => void; onSaved: () => void }) {
  const { canManagePay } = useTime();
  const toast = useToast();
  const tag = languageOf(locale).dateTag;
  const [items, setItems] = useState<Item[]>([]);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(false);
  const [itemId, setItemId] = useState("");
  const [value, setValue] = useState("");
  const [cur, setCur] = useState("");
  const [from, setFrom] = useState(today());
  const [note, setNote] = useState("");
  const [method, setMethod] = useState("cash");
  const [pcur, setPcur] = useState("");
  const [accName, setAccName] = useState("");
  const [accNo, setAccNo] = useState("");
  const [bank, setBank] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    const supabase = createClient();
    const [it, cc, pp] = await Promise.all([
      supabase.rpc("payroll_pay_items"), supabase.from("company_currencies").select("code, is_home").order("code"), supabase.rpc("payroll_person", { p_employee_id: id }),
    ]);
    const list = ((it.data ?? []) as Item[]).filter((i) => i.reference_only);
    const codes = (cc.data ?? []).map((c) => c.code);
    const home = (cc.data ?? []).find((c) => c.is_home)?.code ?? codes[0] ?? "";
    const detail = (pp.data ?? { profile: null, terms: [] }) as unknown as { profile: Profile | null; terms: Term[] };
    setItems(list); setCurrencies(codes); setTerms(detail.terms);
    setItemId((v) => v || list[0]?.id || ""); setCur((v) => v || home); setPcur(detail.profile?.pay_currency ?? home);
    setMethod(detail.profile?.payment_method ?? "cash"); setAccName(detail.profile?.account_name ?? ""); setAccNo(detail.profile?.account_no ?? ""); setBank(detail.profile?.bank_name ?? "");
    setLoading(false);
  }, []);
  useEffect(() => { if (person) { setValue(""); setNote(""); setFrom(today()); load(person.employee_id); } }, [person, load]);

  const item = items.find((i) => i.id === itemId);
  const isRate = item?.category === "commission";
  const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(tag, { day: "numeric", month: "short", year: "numeric" });

  async function saveTerms() {
    if (!person || !item) return;
    const n = Number(value);
    if (!value.trim() || !Number.isFinite(n) || n < 0) { toast("error", t("tm.pr.err.terms")); return; }
    setSaving(true);
    const { error } = await createClient().rpc("payroll_save_terms", {
      p_employee_id: person.employee_id, p_pay_item_id: item.id, p_amount: isRate ? null : n, p_rate_pct: isRate ? n : null, p_currency: cur, p_effective_from: from, p_note: note.trim() || null,
    });
    setSaving(false);
    if (error) { toast("error", t(error.code === "P0001" ? "tm.pr.err.terms" : "tm.pr.err.generic")); return; }
    toast("success", t("tm.pr.saved")); setValue(""); setNote("");
    await load(person.employee_id); onSaved();
  }

  async function saveProfile() {
    if (!person) return;
    setSaving(true);
    const { error } = await createClient().rpc("payroll_save_profile", {
      p_employee_id: person.employee_id, p_currency: pcur, p_method: method, p_account_name: accName || null, p_account_no: accNo || null, p_bank_name: bank || null, p_note: null,
    });
    setSaving(false);
    if (error) { toast("error", t("tm.pr.err.generic")); return; }
    toast("success", t("tm.pr.saved"));
    await load(person.employee_id); onSaved();
  }

  const methods = ["cash", "bank", "wing", "aba", "other"] as const;
  return (
    <BottomSheet open={!!person} onClose={onClose} title={person ? pick(locale, person.name, person.name_local) : ""} closeLabel={t("tm.day.close")}>
      {loading && terms.length === 0 ? (
        <div className="flex flex-col gap-2" aria-busy="true"><Skeleton className="h-16 w-full rounded-card" /><Skeleton className="h-16 w-full rounded-card" /></div>
      ) : (
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <b>{t("tm.pr.history")}</b>
            {terms.length === 0 ? <p className="text-sm text-muted">{t("tm.pr.notSet")}</p> : (
              <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
                {terms.map((x) => (
                  <li key={x.id} className="flex flex-col gap-0.5 border-b border-line px-3 py-2 text-sm last:border-b-0">
                    <span><b>{pick(locale, x.name, x.name_local)}</b> · {x.rate_pct != null ? `${x.rate_pct}%` : money(locale, x.amount ?? 0, x.currency_code)}</span>
                    <span className="text-muted">{fmtDate(x.effective_from)}{x.effective_to ? ` ${fill(t("tm.pr.until"), { date: fmtDate(x.effective_to) })}` : ` · ${t("tm.pr.now")}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {canManagePay && (
            <>
              <section className="flex flex-col gap-3">
                <b>{t("tm.pr.setPay")}</b>
                <Select label={t("tm.pr.item")} value={itemId} onChange={(e) => setItemId(e.target.value)}>
                  {items.map((i) => <option key={i.id} value={i.id}>{pick(locale, i.name, i.name_local)}</option>)}
                </Select>
                <Input label={isRate ? t("tm.pr.rate") : t("tm.pr.amount")} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
                <Select label={t("tm.pr.currency")} value={cur} onChange={(e) => setCur(e.target.value)}>
                  {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
                <Input label={t("tm.pr.from")} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                <Input label={t("tm.pr.note")} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
                <Button disabled={saving} onClick={saveTerms}>{t("tm.pr.save")}</Button>
              </section>
              <section className="flex flex-col gap-3">
                <b>{t("tm.pr.payment")}</b>
                <Select label={t("tm.pr.method")} value={method} onChange={(e) => setMethod(e.target.value)}>
                  {methods.map((m) => <option key={m} value={m}>{t(`tm.pr.m.${m}` as MessageKey)}</option>)}
                </Select>
                <Select label={t("tm.pr.currency")} value={pcur} onChange={(e) => setPcur(e.target.value)}>
                  {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
                {method !== "cash" && (
                  <>
                    <Input label={t("tm.pr.accountName")} value={accName} maxLength={120} onChange={(e) => setAccName(e.target.value)} />
                    <Input label={t("tm.pr.accountNo")} value={accNo} maxLength={60} onChange={(e) => setAccNo(e.target.value)} />
                    <Input label={t("tm.pr.bankName")} value={bank} maxLength={80} onChange={(e) => setBank(e.target.value)} />
                  </>
                )}
                <Button variant="secondary" disabled={saving} onClick={saveProfile}>{t("tm.pr.save")}</Button>
              </section>
            </>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

function SettingsForm({ t }: { t: T }) {
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setS(null); setFailed(false);
    const { data, error } = await createClient().rpc("payroll_get_settings");
    if (error) { setFailed(true); return; }
    setS(data as unknown as Settings);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(next: Settings) {
    setSaving(true);
    const { error } = await createClient().rpc("payroll_save_settings", {
      p_rate_divisor: next.rate_divisor, p_overtime_multiplier: next.overtime_multiplier, p_require_second_approver: next.require_second_approver, p_close_blocks_on_review: next.close_blocks_on_review,
    });
    setSaving(false);
    if (error) { toast("error", t("tm.pr.err.generic")); return; }
    setS(next); toast("success", t("tm.pr.saved"));
  }

  if (failed) return <ErrorState title={t("tm.pr.error")} action={<Button onClick={load}><RefreshCw className="size-4" aria-hidden />{t("tm.retry")}</Button>} />;
  if (!s) return <div className="flex flex-col gap-2" aria-busy="true"><Skeleton className="h-16 w-full rounded-card" /><Skeleton className="h-16 w-full rounded-card" /></div>;
  return (
    <div className="flex flex-col gap-4">
      <Select label={t("tm.pr.set.divisor")} value={s.rate_divisor} disabled={saving} onChange={(e) => save({ ...s, rate_divisor: e.target.value })}>
        <option value="26">{t("tm.pr.set.d26")}</option>
        <option value="30">{t("tm.pr.set.d30")}</option>
        <option value="scheduled">{t("tm.pr.set.dSched")}</option>
      </Select>
      <OvertimeField t={t} value={s.overtime_multiplier} disabled={saving} onCommit={(v) => save({ ...s, overtime_multiplier: v })} />
      <Toggle label={t("tm.pr.set.second")} checked={s.require_second_approver} onChange={() => save({ ...s, require_second_approver: !s.require_second_approver })} />
      <Toggle label={t("tm.pr.set.closeBlocks")} checked={s.close_blocks_on_review} onChange={() => save({ ...s, close_blocks_on_review: !s.close_blocks_on_review })} />
    </div>
  );
}

function OvertimeField({ t, value, disabled, onCommit }: { t: T; value: number; disabled: boolean; onCommit: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  return (
    <Input label={t("tm.pr.set.ot")} inputMode="decimal" value={v} disabled={disabled} onChange={(e) => setV(e.target.value)}
      onBlur={() => { const n = Number(v); if (Number.isFinite(n) && n >= 1 && n <= 5 && n !== value) onCommit(n); else setV(String(value)); }} />
  );
}
