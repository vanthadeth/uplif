"use client";
import { useState, type ReactNode } from "react";
import { AuditList, AuditRow, Button, CodeInput, InvitePanel, LanguageToggle, PermissionMatrix, useToast, type DataScope, type PermissionRow } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="border-t border-line py-8"><h2 className="mb-4 text-base font-semibold">{title}</h2>{children}</section>;
}

export default function Features() {
  const { t, locale, setLocale } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<PermissionRow[]>([
    { id: "users", label: "", actions: { view: true, create: true, edit: true, delete: false }, scope: "branch" },
    { id: "branches", label: "", actions: { view: true, create: false, edit: false, delete: false }, scope: "company" },
    { id: "roles", label: "", actions: { view: true, create: false, edit: false, delete: false }, scope: "company" },
    { id: "invoices", label: "", actions: { view: true, create: true, edit: true, delete: null, approve: true }, scope: "branch" },
    { id: "audit", label: "", actions: { view: true, create: null, edit: null, delete: null }, scope: "own" },
  ]);
  const [panel, setPanel] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");

  const actions = ["view", "create", "edit", "delete", "approve"].map((a) => ({ id: a, label: t(`act.${a}` as "act.view") }));
  const labelled = rows.map((r) => ({ ...r, label: t(`res.${r.id}` as "res.users") }));
  const scopeLabels: Record<DataScope, string> = { own: t("scope.own"), branch: t("scope.branch"), company: t("scope.company") };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-bold leading-tight tracking-tight">{t("feat.title")}</h1>
          <p className="mt-2 max-w-xl text-muted">{t("feat.intro")}</p>
        </div>
        <LanguageToggle label={t("lang.toggle")} value={locale} onChange={(l) => setLocale(l as "en" | "km")} options={[{ id: "en", label: "English" }, { id: "km", label: "ខ្មែរ" }]} />
      </header>

      <Section title={`${t("feat.matrix")} · ${t("feat.matrix.role")}`}>
        <PermissionMatrix
          rows={labelled}
          actions={actions}
          scopeLabels={scopeLabels}
          labels={{ resource: t("pm.resource"), scope: t("pm.scope"), allowed: t("pm.allowed"), notAllowed: t("pm.notAllowed"), notApplicable: t("pm.na"), scopeGroup: t("pm.scopeGroup") }}
          onToggle={(id, a, v) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, actions: { ...r.actions, [a]: v } } : r)))}
          onScope={(id, s) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, scope: s } : r)))}
        />
      </Section>

      <Section title={t("feat.invite")}>
        <Button variant="primary" onClick={() => setPanel(true)}>{t("inv.open")}</Button>
        <InvitePanel
          open={panel}
          onClose={() => setPanel(false)}
          roles={[{ id: "manager", label: t("role.manager") }, { id: "sales", label: t("role.sales") }]}
          branches={[{ id: "main", label: t("field.branch.main") }, { id: "market", label: t("field.branch.market") }]}
          onCreate={async () => { await new Promise((r) => setTimeout(r, 600)); return "https://app.uplif.example/invite/q7Hk2x9Pm4"; }}
          labels={{
            title: t("inv.title"), close: t("overlay.close"), name: t("inv.name"), phone: t("inv.phone"), role: t("inv.role"), branch: t("inv.branch"),
            phoneHint: t("inv.phoneHint"), submit: t("inv.submit"), creating: t("inv.creating"), done: t("inv.done"), doneBody: t("inv.doneBody"),
            copy: t("inv.copy"), copied: t("inv.copied"), another: t("inv.another"), required: t("inv.required"), seatNote: t("inv.seat"),
          }}
        />
      </Section>

      <Section title={t("feat.audit")}>
        <AuditList label={t("feat.audit")}>
          <AuditRow
            labels={{ before: t("audit.before"), after: t("audit.after"), field: t("audit.field"), empty: t("audit.empty"), toggle: t("audit.toggle") }}
            entry={{ id: "1", when: "10 Nov 2026, 09:42", actor: "Sokha Chan", action: t("audit.act.update"), actionTone: "info", target: "Dara Kim · " + t("role.manager"),
              changes: [{ field: "Data scope (Invoices)", before: t("scope.branch"), after: t("scope.company") }, { field: "Delete (Users)", before: null, after: t("pm.allowed") }],
              meta: [{ label: "Device", value: "Android, Chrome" }, { label: "IP", value: "203.0.113.24" }] }}
          />
          <AuditRow
            labels={{ before: t("audit.before"), after: t("audit.after"), field: t("audit.field"), empty: t("audit.empty"), toggle: t("audit.toggle") }}
            entry={{ id: "2", when: "10 Nov 2026, 08:15", actor: "Dara Kim", action: t("audit.act.suspend"), actionTone: "danger", target: "Vireak Sok",
              changes: [{ field: t("table.status"), before: t("status.active"), after: t("status.suspended") }] }}
          />
        </AuditList>
      </Section>

      <Section title={t("feat.code")}>
        <p className="mb-3 max-w-md text-muted">{t("code.hint")}</p>
        <CodeInput
          label={t("code.label")}
          value={code}
          onChange={(v) => { setCode(v); setCodeError(""); }}
          error={codeError}
          onComplete={(v) => (v === "123456" ? toast("success", t("code.ok")) : setCodeError(t("code.error")))}
        />
      </Section>
    </main>
  );
}
