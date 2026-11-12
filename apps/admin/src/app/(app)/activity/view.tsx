"use client";
import Link from "next/link";
import { Card, EmptyState, ErrorState } from "@uplif/ui";
import { fmtTime } from "@/components/bits";
import { money } from "@/lib/money";
import type { LogEntry } from "@/lib/types";

const LABELS: Record<string, string> = {
  "subscriber.view": "Opened a subscriber",
  "plan.assign": "Changed a plan",
  "package.assign": "Assigned a custom package",
  "package.create": "Created a package",
  "package.update": "Edited a package",
  "package.archive": "Archived a package",
  "plan.update": "Edited a plan",
  "invoice.issue": "Issued an invoice",
  "invoice.auto_failed": "Could not issue an invoice automatically",
  "subscription.past_due": "Marked an account past due",
  "billing.run": "Ran billing",
  "invoice.paid": "Marked an invoice as paid",
  "invoice.void": "Voided an invoice",
  "support_access.request": "Asked for support access",
  "support_access.cancel": "Withdrew a support request",
  "support_access.end": "Ended support access",
  "support_access.approved_by_owner": "Owner approved support access",
  "support_access.declined_by_owner": "Owner declined support access",
  "support_access.ended_by_owner": "Owner ended support access",
};
const label = (a: string) => LABELS[a] ?? a;

function detail(e: LogEntry): string {
  const d = (e.details ?? {}) as Record<string, unknown>;
  const bits: string[] = [];
  if (typeof d.number === "string") bits.push(d.number);
  if (typeof d.amount_cents === "number") bits.push(money(d.amount_cents));
  if (typeof d.company === "string") bits.push(d.company);
  if (typeof d.hours === "number") bits.push(`${d.hours} h`);
  if (typeof d.name === "string") bits.push(d.name);
  if (typeof d.reason === "string") bits.push(`“${d.reason}”`);
  return bits.join(" · ");
}

export function ActivityView({ rows, hasMore, next, failed }: { rows: LogEntry[]; hasMore: boolean; next: number; failed: boolean }) {
  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Admin activity</h1>
        <p className="text-muted">Everything done in this app, and every support decision made by a company owner. Entries cannot be edited or deleted.</p>
      </div>
      {failed ? <ErrorState title="Activity could not be loaded" body="Check that the database migrations are applied, then reload." /> : rows.length === 0 ? (
        <EmptyState title="Nothing recorded yet" body="Actions taken in this app will be listed here." />
      ) : (
        <Card className="overflow-hidden">
          <ul>
            {rows.map((e) => (
              <li key={e.id} className="grid gap-x-4 gap-y-1 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,12rem)]">
                <span className="tabular-nums text-muted">{fmtTime(e.created_at)}</span>
                <span className="min-w-0"><b className="font-semibold">{label(e.action)}</b>{detail(e) && <small className="block break-words text-muted">{detail(e)}</small>}</span>
                <span className="min-w-0 truncate text-muted">
                  {e.admin_name || "Unknown"}
                  {e.subject_user_id && <> · <Link className="text-link" href={`/subscribers/${e.subject_user_id}`}>{e.subject_name || "subscriber"}</Link></>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {hasMore && <div><Link className="inline-flex min-h-(--control-h) items-center rounded-control border border-line-strong bg-surface px-4 font-semibold hover:bg-ground" href={`/activity?n=${next}`}>Show more</Link></div>}
    </div>
  );
}
