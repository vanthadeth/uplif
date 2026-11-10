"use client";
import { useState, type FormEvent } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { Button } from "./Button";
import { Input, Select } from "./Field";
import { SidePanel } from "./Overlay";

export interface InviteValues { name: string; phone: string; roleId: string; branchId: string }

interface Props {
  open: boolean;
  onClose: () => void;
  roles: { id: string; label: string }[];
  branches: { id: string; label: string }[];
  /** Resolves to the single-use invite link. The server creates the token. */
  onCreate: (v: InviteValues) => Promise<string>;
  labels: {
    title: string; close: string; name: string; phone: string; role: string; branch: string;
    phoneHint: string; submit: string; creating: string; done: string; doneBody: string;
    copy: string; copied: string; another: string; required: string; seatNote: string;
  };
}

/** Invite by single-use link (valid 7 days). The person claims it with any sign-in method. */
export function InvitePanel({ open, onClose, roles, branches, onCreate, labels }: Props) {
  const [values, setValues] = useState<InviteValues>({ name: "", phone: "", roleId: roles[0]?.id ?? "", branchId: branches[0]?.id ?? "" });
  const [errors, setErrors] = useState<Partial<Record<"name" | "phone", string>>>({});
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!values.name.trim()) next.name = labels.required;
    if (!values.phone.trim()) next.phone = labels.required;
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try { setLink(await onCreate(values)); } finally { setBusy(false); }
  }
  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }
  function reset() { setLink(null); setValues((v) => ({ ...v, name: "", phone: "" })); }

  return (
    <SidePanel open={open} onClose={onClose} title={labels.title} closeLabel={labels.close}>
      {link ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 font-semibold text-success-ink"><Check className="size-5" aria-hidden="true" />{labels.done}</div>
          <p className="text-muted">{labels.doneBody}</p>
          <div className="flex items-center gap-2 rounded-control border border-line-strong bg-ground p-2">
            <Link2 className="size-4 shrink-0 text-muted" aria-hidden="true" />
            <input readOnly value={link} aria-label={labels.title} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 bg-transparent" dir="ltr" />
            <Button variant="primary" onClick={copy} className="min-h-9 shrink-0">
              {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              <span aria-live="polite">{copied ? labels.copied : labels.copy}</span>
            </Button>
          </div>
          <Button onClick={reset} className="self-start">{labels.another}</Button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Input label={labels.name} value={values.name} error={errors.name} autoComplete="off" onChange={(e) => setValues({ ...values, name: e.target.value })} />
          <Input label={labels.phone} value={values.phone} error={errors.phone} hint={labels.phoneHint} inputMode="tel" autoComplete="off" onChange={(e) => setValues({ ...values, phone: e.target.value })} />
          <Select label={labels.role} value={values.roleId} onChange={(e) => setValues({ ...values, roleId: e.target.value })}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
          <Select label={labels.branch} value={values.branchId} onChange={(e) => setValues({ ...values, branchId: e.target.value })}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </Select>
          <p className="text-xs text-muted">{labels.seatNote}</p>
          <Button type="submit" variant="primary" loading={busy}>{busy ? labels.creating : labels.submit}</Button>
        </form>
      )}
    </SidePanel>
  );
}
