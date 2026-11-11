"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorState, Modal, Tabs, useToast } from "@uplif/ui";
import { createClient } from "@uplif/supabase/client";
import { GRANT_STATUS, type GrantStatus } from "@/lib/money";
import { fmtTime } from "@/components/bits";
import type { SupportGrant } from "@/lib/types";

const live = (g: SupportGrant) => g.status === "requested" || g.status === "approved";

export function SupportView({ grants, failed }: { grants: SupportGrant[]; failed: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<"cur" | "past">("cur");
  const [target, setTarget] = useState<SupportGrant | null>(null);
  const [busy, setBusy] = useState(false);
  const current = grants.filter(live);
  const past = grants.filter((g) => !live(g));
  const shown = tab === "cur" ? current : past;

  async function act() {
    if (!target) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = target.status === "approved"
      ? await supabase.rpc("platform_end_support_access", { p_id: target.id })
      : await supabase.rpc("platform_cancel_support_request", { p_id: target.id });
    setBusy(false);
    if (error) return toast("error", "Could not update this request. Reload and try again.");
    toast("success", target.status === "approved" ? "Access ended." : "Request withdrawn.");
    setTarget(null);
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Support access</h1>
        <p className="text-muted">Every time someone at UPLIF asks to look inside a company. The owner must approve; access is read only and lasts 1 to 24 hours. Ask from a subscriber&apos;s page.</p>
      </div>
      {failed ? <ErrorState title="Support requests could not be loaded" body="Check that the database migrations are applied, then reload." /> : (
        <>
          <Tabs label="Requests" value={tab} onChange={(v) => setTab(v as "cur" | "past")}
            items={[{ id: "cur", label: `Current ${current.length}` }, { id: "past", label: `Past ${past.length}` }]} />
          {shown.length === 0 ? (
            <EmptyState title={tab === "cur" ? "No open requests" : "Nothing in the past yet"} body={tab === "cur" ? "You cannot see any company's business data right now." : "Finished requests appear here."} />
          ) : (
            <Card className="overflow-hidden">
              <ul>
                {shown.map((g) => {
                  const s = GRANT_STATUS[g.status as GrantStatus] ?? GRANT_STATUS.ended;
                  return (
                    <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
                      <span className="min-w-0 flex-1">
                        <b className="block font-semibold">{g.company_name}{g.company_name_local && <span className="font-normal text-muted"> · {g.company_name_local}</span>}</b>
                        <small className="block text-muted">{g.reason}</small>
                        <small className="block text-muted">
                          Asked {fmtTime(g.requested_at)} for {g.hours} {g.hours === 1 ? "hour" : "hours"}
                          {g.status === "approved" && g.expires_at ? ` · until ${fmtTime(g.expires_at)}` : ""}
                        </small>
                      </span>
                      <span className="flex items-center gap-3"><Badge tone={s.tone}>{s.label}</Badge>
                        {live(g) && <Button onClick={() => setTarget(g)}>{g.status === "approved" ? "End access" : "Withdraw"}</Button>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      )}
      <Modal open={!!target} onClose={() => setTarget(null)} closeLabel="Close" title={target?.status === "approved" ? "End this access?" : "Withdraw this request?"}
        footer={<><Button onClick={() => setTarget(null)}>Keep it</Button><Button variant="primary" loading={busy} onClick={act}>{target?.status === "approved" ? "End access" : "Withdraw"}</Button></>}>
        <p>{target?.company_name}. {target?.status === "approved" ? "You will stop being able to look inside this company straight away. The company is told." : "The owner will no longer be asked."}</p>
      </Modal>
    </div>
  );
}
