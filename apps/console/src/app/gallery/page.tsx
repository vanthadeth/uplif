"use client";
import { useState, type ReactNode } from "react";
import {
  Avatar, Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Input, Modal, ScopePill, Select,
  SidePanel, Skeleton, Spinner, TabPanel, Table, TBody, TD, TH, THead, Tabs, Toggle, TR, useToast,
} from "@uplif/ui";
import { useI18n } from "@/lib/i18n";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-8">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function Gallery() {
  const { t, locale, setLocale } = useI18n();
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [panel, setPanel] = useState(false);
  const [tab, setTab] = useState("general");
  const [approval, setApproval] = useState(true);
  const [saving, setSaving] = useState(false);

  const tabs = [
    { id: "general", label: t("tabs.general") },
    { id: "security", label: t("tabs.security") },
    { id: "billing", label: t("tabs.billing") },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <header className="mb-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-bold leading-tight tracking-tight">{t("gallery.title")}</h1>
          <p className="mt-2 max-w-xl text-muted">{t("gallery.intro")}</p>
        </div>
        <div role="group" aria-label={t("lang.toggle")} className="inline-flex rounded-control border border-line-strong bg-surface p-0.5">
          {(["en", "km"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={locale === l}
              onClick={() => setLocale(l)}
              className={`min-h-9 rounded-md px-3 font-semibold ${locale === l ? "bg-primary text-white" : "text-ink-2 hover:bg-ground"}`}
            >
              {l === "en" ? "English" : "ខ្មែរ"}
            </button>
          ))}
        </div>
      </header>

      <Section title={t("section.buttons")}>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary">{t("btn.primary")}</Button>
          <Button>{t("btn.secondary")}</Button>
          <Button variant="quiet">{t("btn.quiet")}</Button>
          <Button variant="danger">{t("btn.danger")}</Button>
          <Button variant="primary" disabled>{t("btn.primary")}</Button>
          <Button
            variant="primary"
            loading={saving}
            onClick={() => { setSaving(true); setTimeout(() => setSaving(false), 1500); }}
          >
            {saving ? t("btn.loading") : t("btn.primary")}
          </Button>
        </div>
      </Section>

      <Section title={t("section.fields")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={t("field.name")} defaultValue="Sokha Mart" />
          <Input label={t("field.nameLocal")} defaultValue="សុខា ម៉ាត" hint={t("field.nameHint")} />
          <Input label={t("field.phone")} defaultValue="012 34" error={t("field.phoneError")} inputMode="tel" />
          <Select label={t("field.branch")} defaultValue="main">
            <option value="main">{t("field.branch.main")}</option>
            <option value="market">{t("field.branch.market")}</option>
          </Select>
        </div>
      </Section>

      <Section title={t("section.badges")}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success">{t("status.active")}</Badge>
          <Badge tone="warning">{t("status.invited")}</Badge>
          <Badge tone="danger">{t("status.suspended")}</Badge>
          <Badge>{t("status.draft")}</Badge>
          <span className="mx-2 h-5 w-px bg-line" aria-hidden="true" />
          <ScopePill scope="own" label={t("scope.own")} />
          <ScopePill scope="branch" label={t("scope.branch")} />
          <ScopePill scope="company" label={t("scope.company")} />
        </div>
      </Section>

      <Section title={t("section.avatar")}>
        <div className="flex items-center gap-3">
          <Avatar name="Sokha Chan" size="sm" />
          <Avatar name="Sokha Chan" />
          <Avatar name="Dara Kim" size="lg" />
          <Avatar name="សុខា ចាន់" size="lg" />
        </div>
      </Section>

      <Section title={t("section.card")}>
        <Card className="max-w-md">
          <CardHeader title={t("card.title")} action={<Button variant="quiet">{t("btn.quiet")}</Button>} />
          <CardBody>{t("card.body")}</CardBody>
        </Card>
      </Section>

      <Section title={t("section.table")}>
        <Table>
          <THead>
            <TR>
              <TH>{t("table.user")}</TH><TH>{t("table.role")}</TH><TH>{t("table.scope")}</TH><TH>{t("table.status")}</TH>
            </TR>
          </THead>
          <TBody>
            {[
              ["Sokha Chan", "role.owner", "company", "success", "status.active"],
              ["Dara Kim", "role.manager", "branch", "success", "status.active"],
              ["Vireak Sok", "role.sales", "own", "warning", "status.invited"],
            ].map(([n, r, s, tone, st]) => (
              <TR key={n}>
                <TD><span className="flex items-center gap-3"><Avatar name={n} size="sm" />{n}</span></TD>
                <TD>{t(r as "role.owner")}</TD>
                <TD><ScopePill scope={s as "own"} label={t(`scope.${s}` as "scope.own")} /></TD>
                <TD><Badge tone={tone as "success"}>{t(st as "status.active")}</Badge></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>

      <Section title={t("section.overlay")}>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setModal(true)}>{t("overlay.openModal")}</Button>
          <Button onClick={() => setPanel(true)}>{t("overlay.openPanel")}</Button>
        </div>
        <Modal
          open={modal}
          onClose={() => setModal(false)}
          title={t("overlay.confirmTitle")}
          closeLabel={t("overlay.close")}
          footer={<><Button onClick={() => setModal(false)}>{t("btn.secondary")}</Button><Button variant="danger" onClick={() => setModal(false)}>{t("overlay.suspend")}</Button></>}
        >
          <p>{t("overlay.confirmBody")}</p>
        </Modal>
        <SidePanel open={panel} onClose={() => setPanel(false)} title={t("overlay.panelTitle")} closeLabel={t("overlay.close")}>
          <p className="text-muted">{t("overlay.panelBody")}</p>
        </SidePanel>
      </Section>

      <Section title={t("section.toast")}>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => toast("success", t("toast.successText"))}>{t("toast.success")}</Button>
          <Button onClick={() => toast("error", t("toast.errorText"))}>{t("toast.error")}</Button>
        </div>
      </Section>

      <Section title={t("section.tabs")}>
        <Tabs items={tabs} value={tab} onChange={setTab} label={t("tabs.label")} />
        {tabs.map((x) => (
          <TabPanel key={x.id} id={x.id} active={tab === x.id}>
            <Toggle checked={approval} onChange={setApproval} label={t("toggle.label")} />
          </TabPanel>
        ))}
      </Section>

      <Section title={t("section.states")}>
        <div className="grid gap-4 md:grid-cols-3">
          <EmptyState title={t("empty.title")} body={t("empty.body")} action={<Button variant="primary">{t("empty.action")}</Button>} />
          <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6">
            <Spinner label={t("loading.text")} />
            <Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-1/2" />
          </div>
          <ErrorState title={t("error.title")} body={t("error.body")} action={<Button>{t("error.action")}</Button>} />
        </div>
      </Section>
    </main>
  );
}
