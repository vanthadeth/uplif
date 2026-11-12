"use client";
import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { Badge, Card, EmptyState } from "@uplif/ui";
import { fmtDay, fmtTime } from "@/components/bits";

export interface Snapshot {
  company: { id: string; name: string; name_local: string | null; country_code: string; created_at: string };
  expires_at: string;
  settings: { cross_branch_stock_visibility: boolean; attendance_selfie_retention_days: number } | null;
  currencies: { code: string; is_home: boolean }[];
  branches: { id: string; name: string; name_local: string | null; is_active: boolean }[];
  roles: { id: string; name: string; name_local: string | null; is_system: boolean }[];
  team: { id: string; display_name: string | null; status: string; roles: string[] }[];
}

const both = (n: string, l: string | null) => <>{n}{l && <span className="font-normal text-muted"> · {l}</span>}</>;

export function ViewerView({ data }: { data: Snapshot | null }) {
  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-4">
      <Link href="/support" className="inline-flex w-fit items-center gap-1 text-muted hover:text-ink"><ArrowLeft className="size-4" aria-hidden /> Support access</Link>
      {!data ? (
        <EmptyState title="This access is not active" body="It was not approved, has ended, or has run out of time. Ask the owner again from the subscriber's page." />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{both(data.company.name, data.company.name_local)}</h1>
              <p className="text-muted">Country {data.company.country_code} · created {fmtDay(data.company.created_at.slice(0, 10))}</p>
            </div>
            <Badge tone="info"><span className="inline-flex items-center gap-1"><Eye className="size-3.5" aria-hidden /> Read only · ends {fmtTime(data.expires_at)}</span></Badge>
          </div>
          <p className="rounded-md border border-line bg-neutral-soft px-3 py-2 text-muted">
            You are looking inside this company with the Owner&apos;s approval. Each time this page opens, it is written to your activity log and to the company&apos;s audit log. Sign-in emails, phone numbers and personal profiles are never shown.
          </p>

          <Section title={`Branches ${data.branches.length}`}>
            {data.branches.map((b) => (
              <Row key={b.id} main={both(b.name, b.name_local)} side={<Badge tone={b.is_active ? "success" : "neutral"}>{b.is_active ? "Active" : "Inactive"}</Badge>} />
            ))}
          </Section>

          <Section title={`Team ${data.team.length}`}>
            {data.team.map((m) => (
              <Row key={m.id} main={m.display_name ?? "No name"} sub={m.roles.join(", ") || "No role"} side={<Badge tone={m.status === "active" ? "success" : "neutral"}>{m.status}</Badge>} />
            ))}
          </Section>

          <Section title={`Roles ${data.roles.length}`}>
            {data.roles.map((r) => (
              <Row key={r.id} main={both(r.name, r.name_local)} side={r.is_system ? <Badge>System</Badge> : undefined} />
            ))}
          </Section>

          <Section title="Settings">
            <Row main="Currencies" side={<span>{data.currencies.map((c) => (c.is_home ? `${c.code} (home)` : c.code)).join(", ") || "None"}</span>} />
            <Row main="Branches can see each other's stock" side={<span>{data.settings?.cross_branch_stock_visibility ? "Yes" : "No"}</span>} />
            <Row main="Attendance selfies kept" side={<span>{data.settings?.attendance_selfie_retention_days ?? 60} days</span>} />
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <Card className="overflow-hidden"><ul>{children}</ul></Card>
    </section>
  );
}

function Row({ main, sub, side }: { main: React.ReactNode; sub?: string; side?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <span className="min-w-0 flex-1"><b className="block font-semibold">{main}</b>{sub && <small className="block text-muted">{sub}</small>}</span>
      {side}
    </li>
  );
}
