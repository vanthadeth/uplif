"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Package, Pencil, Plus } from "lucide-react";
import { Badge, Button, Card, CardBody, EmptyState, ErrorState, Input, Modal, useToast } from "@uplif/ui";
import { createClient } from "@uplif/supabase/client";
import { MODULES, fromCents, money, moduleLabel, toCents } from "@/lib/money";
import type { Plan } from "@/lib/types";

interface Form { id: string | null; kind: "standard" | "custom"; name: string; month: string; year: string; companies: string; branches: string; users: string; modules: string[] }
const blank: Form = { id: null, kind: "custom", name: "", month: "", year: "", companies: "1", branches: "", users: "", modules: [] };
const whole = (s: string) => (/^\d+$/.test(s.trim()) && Number(s) >= 1 ? Number(s) : null);

function limits(p: Plan) {
  return [
    `${p.max_companies} ${p.max_companies === 1 ? "company" : "companies"}`,
    p.max_branches == null ? "No branch limit" : `${p.max_branches} branches`,
    `${p.max_users} users`,
  ];
}

function PlanCard({ p, onEdit, onArchive }: { p: Plan; onEdit: () => void; onArchive?: () => void }) {
  return (
    <Card>
      <CardBody className="flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{p.name}</h3>
            <p className="text-muted">
              {p.kind === "standard" && p.price_month_cents != null ? `${money(p.price_month_cents)} per month or ${money(p.price_year_cents)} per year` : `${money(p.price_year_cents)} per year`}
            </p>
          </div>
          {p.archived ? <Badge>Archived</Badge> : <Badge tone="info">{p.subscribers} {p.subscribers === 1 ? "subscriber" : "subscribers"}</Badge>}
        </div>
        <ul className="flex flex-col gap-1.5">
          {limits(p).map((l) => <li key={l} className="flex items-center gap-2"><Check className="size-4 text-success-ink" aria-hidden="true" />{l}</li>)}
          <li className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success-ink" aria-hidden="true" />{p.modules.length ? p.modules.map(moduleLabel).join(", ") : "No modules"}</li>
        </ul>
        {!p.archived && (
          <div className="mt-auto flex flex-wrap gap-2">
            <Button onClick={onEdit}><Pencil className="size-4" aria-hidden="true" />Edit</Button>
            {onArchive && <Button variant="quiet" disabled={p.subscribers > 0} title={p.subscribers > 0 ? "Move its subscribers to another plan first" : undefined} onClick={onArchive}>Archive</Button>}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function PlansView({ plans, failed }: { plans: Plan[]; failed: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [archiving, setArchiving] = useState<Plan | null>(null);
  const standard = plans.filter((p) => p.kind === "standard");
  const custom = plans.filter((p) => p.kind === "custom");

  const open = (p?: Plan) => {
    setErrors({});
    setForm(p ? { id: p.id, kind: p.kind as Form["kind"], name: p.name, month: fromCents(p.price_month_cents), year: fromCents(p.price_year_cents), companies: String(p.max_companies), branches: p.max_branches == null ? "" : String(p.max_branches), users: String(p.max_users), modules: p.modules } : blank);
  };
  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));

  async function save() {
    if (!form) return;
    const e: Record<string, string> = {};
    const year = toCents(form.year), month = form.kind === "standard" ? toCents(form.month) : null;
    if (form.kind === "custom" && !form.name.trim()) e.name = "Enter a name.";
    if (year == null) e.year = "Enter the yearly price, for example 49 or 49.50.";
    if (form.kind === "standard" && month == null) e.month = "Enter the monthly price.";
    if (whole(form.companies) == null) e.companies = "Enter a whole number, at least 1.";
    if (form.branches.trim() !== "" && whole(form.branches) == null) e.branches = "Leave empty for no limit, or enter a whole number.";
    if (whole(form.users) == null) e.users = "Enter a whole number, at least 1.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const { error } = await createClient().rpc("platform_save_plan", {
      p_id: form.id, p_name: form.name, p_price_month_cents: month, p_price_year_cents: year!, p_max_companies: whole(form.companies)!,
      p_max_branches: form.branches.trim() === "" ? null : whole(form.branches), p_max_users: whole(form.users)!, p_modules: form.modules,
    });
    setBusy(false);
    if (error) return toast("error", error.code === "42501" ? "You do not have access to change plans." : "Could not save. Check the values and try again.");
    toast("success", form.id ? "Saved. Changes apply from each subscriber's next invoice." : "Package created.");
    setForm(null);
    router.refresh();
  }

  async function archive() {
    if (!archiving) return;
    setBusy(true);
    const { error } = await createClient().rpc("platform_archive_plan", { p_id: archiving.id });
    setBusy(false);
    if (error) return toast("error", "Could not archive. The package may still have subscribers.");
    toast("success", `${archiving.name} archived.`);
    setArchiving(null);
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Plans</h1>
        <p className="text-muted">What each plan costs and includes. Changes apply to subscribers from their next invoice. Free trials run on Premium for 14 days and are not charged.</p>
      </div>
      {failed ? <ErrorState title="Plans could not be loaded" body="Check that the database migrations are applied, then reload." /> : (
        <>
          <div className="grid gap-4 md:grid-cols-2">{standard.map((p) => <PlanCard key={p.id} p={p} onEdit={() => open(p)} />)}</div>
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Custom packages</h2>
                <p className="text-muted">Made for one customer, priced per year. Assign one from the subscriber page.</p>
              </div>
              <Button variant="primary" onClick={() => open()}><Plus className="size-4" aria-hidden="true" />New custom package</Button>
            </div>
            {custom.length === 0 ? <EmptyState title="No custom packages yet" body="Set the price, limits and modules for one customer." /> : (
              <div className="grid gap-4 md:grid-cols-2">{custom.map((p) => <PlanCard key={p.id} p={p} onEdit={() => open(p)} onArchive={() => setArchiving(p)} />)}</div>
            )}
          </section>
        </>
      )}

      <Modal open={form !== null} onClose={() => setForm(null)} closeLabel="Close" title={form?.id ? "Edit plan" : "New custom package"}
        footer={<><Button onClick={() => setForm(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
        {form && (
          <form className="flex flex-col gap-4" onSubmit={(ev) => { ev.preventDefault(); void save(); }} noValidate>
            <Input label="Name" value={form.name} disabled={form.kind === "standard"} error={errors.name} onChange={(e) => set({ name: e.target.value })} />
            <div className="grid gap-4 sm:grid-cols-2">
              {form.kind === "standard" && <Input label="Price per month ($)" inputMode="decimal" value={form.month} error={errors.month} onChange={(e) => set({ month: e.target.value })} />}
              <Input label="Price per year ($)" inputMode="decimal" value={form.year} error={errors.year} onChange={(e) => set({ year: e.target.value })} />
              <Input label="Companies" inputMode="numeric" value={form.companies} error={errors.companies} onChange={(e) => set({ companies: e.target.value })} />
              <Input label="Branches per company" inputMode="numeric" hint="Leave empty for no limit." value={form.branches} error={errors.branches} onChange={(e) => set({ branches: e.target.value })} />
              <Input label="Users" inputMode="numeric" value={form.users} error={errors.users} onChange={(e) => set({ users: e.target.value })} />
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[14px] font-semibold text-ink-2">Modules</legend>
              {MODULES.map((m) => (
                <label key={m.id} className="flex min-h-11 items-center gap-3">
                  <input type="checkbox" className="size-5" checked={form.modules.includes(m.id)}
                    onChange={(e) => set({ modules: e.target.checked ? [...form.modules, m.id] : form.modules.filter((x) => x !== m.id) })} />
                  {m.label}
                </label>
              ))}
            </fieldset>
          </form>
        )}
      </Modal>

      <Modal open={archiving !== null} onClose={() => setArchiving(null)} closeLabel="Close" title="Archive this package?"
        footer={<><Button onClick={() => setArchiving(null)}>Cancel</Button><Button variant="danger" loading={busy} onClick={archive}>Archive</Button></>}>
        <p>{archiving?.name} will no longer be offered. Nothing is deleted, and nobody is on it.</p>
      </Modal>
    </div>
  );
}
