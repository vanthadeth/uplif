"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Modal, Select, useToast } from "@uplif/ui";
import { createClient } from "@uplif/supabase/client";
import { PAY_METHODS, money } from "@/lib/money";
import type { Invoice } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);
const message = (m: string) =>
  m.includes("only an open invoice") ? "This invoice is no longer open. Reload to see its latest state."
  : m.includes("future") ? "The payment date cannot be in the future."
  : "Could not save. Try again.";

/** Records a payment by hand. Used from the Billing panel and the subscriber page. */
export function PayModal({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [method, setMethod] = useState("bank_transfer");
  const [ref, setRef] = useState("");
  const [day, setDay] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function save() {
    if (!invoice) return;
    setBusy(true); setError(undefined);
    const { error: err } = await createClient().rpc("platform_mark_invoice_paid", { p_id: invoice.id, p_method: method, p_ref: ref, p_paid_on: day });
    setBusy(false);
    if (err) return setError(message(err.message));
    toast("success", `${invoice.number} marked as paid.`);
    onClose(); setRef("");
    router.refresh();
  }
  return (
    <Modal open={!!invoice} onClose={onClose} closeLabel="Close" title="Mark invoice as paid"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!day} onClick={save}>Mark as paid</Button></>}>
      {invoice && (
        <div className="flex flex-col gap-4">
          <p className="text-muted">{invoice.number} · {money(invoice.amount_cents)} from {invoice.owner_name || invoice.owner_email}. This cannot be undone; a paid invoice is a record.</p>
          <Select label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAY_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </Select>
          <Input label="Paid on" type="date" max={today()} value={day} onChange={(e) => setDay(e.target.value)} />
          <Input label="Reference (optional)" value={ref} maxLength={120} onChange={(e) => setRef(e.target.value)} hint="A bank reference or receipt number." />
          {error && <p role="alert" className="text-danger-ink">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

/** Voids an open invoice after a confirmation. */
export function VoidModal({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function save() {
    if (!invoice) return;
    setBusy(true); setError(undefined);
    const { error: err } = await createClient().rpc("platform_void_invoice", { p_id: invoice.id });
    setBusy(false);
    if (err) return setError(message(err.message));
    toast("success", `${invoice.number} voided.`);
    onClose();
    router.refresh();
  }
  return (
    <Modal open={!!invoice} onClose={onClose} closeLabel="Close" title="Void this invoice?"
      footer={<><Button onClick={onClose}>Keep it</Button><Button variant="danger" loading={busy} onClick={save}>Void invoice</Button></>}>
      {invoice && (
        <div className="flex flex-col gap-3">
          <p>{invoice.number} · {money(invoice.amount_cents)} will no longer be collected. You can issue a new invoice afterwards.</p>
          {error && <p role="alert" className="text-danger-ink">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
