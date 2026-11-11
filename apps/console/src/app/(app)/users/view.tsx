"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, EmptyState, Input, Modal, Select, Table, TBody, TD, TH, THead, TR, useToast, type BadgeTone } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { fmtDate, pick } from "@/lib/format";

interface Member { id: string; display_name: string | null; status: "active" | "suspended" | "removed" }
interface Invitation { id: string; label: string | null; role_id: string; branch_id: string | null; status: "pending" | "accepted" | "revoked"; expires_at: string }
interface Props {
  myMembershipId: string;
  members: Member[];
  memberRoles: { id: string; membership_id: string; role_id: string; branch_id: string | null }[];
  roles: { id: string; name: string; name_local: string | null }[];
  branches: { id: string; name: string; name_local: string | null }[];
  invitations: Invitation[];
  /** Open the invite dialog on arrival (the title bar action links here with ?invite=1). */
  openInvite?: boolean;
}

export function UsersView({ myMembershipId, members, memberRoles, roles, branches, invitations, openInvite: autoInvite }: Props) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const roleName = (id: string) => { const r = roles.find((x) => x.id === id); return r ? pick(locale, r.name, r.name_local) : ""; };
  const invitable = roles.filter((r) => r.name !== "Owner");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [roleId, setRoleId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string>();
  const [rolesFor, setRolesFor] = useState<Member | null>(null);
  const [addRoleId, setAddRoleId] = useState("");
  const [addBranchId, setAddBranchId] = useState("");

  function openInvite() {
    setLabel(""); setBranchId(""); setRoleId(invitable[0]?.id ?? ""); setLink(undefined); setInviteOpen(true);
  }

  useEffect(() => {
    if (!autoInvite) return;
    if (invitable.length > 0) openInvite();
    router.replace("/users");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoInvite]);

  async function createInvite() {
    setBusy(true);
    const { data, error } = await createClient().rpc("create_invitation", {
      p_role_id: roleId, p_branch_id: branchId || null, p_label: label,
    });
    setBusy(false);
    if (error) return toast("error", error.code === "42501" ? t("common.forbidden") : t("common.saveError"));
    const token = (data as { token: string }).token;
    setLink(`${location.origin}/invite/${token}`);
    router.refresh();
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link!); toast("success", t("invite.copied")); } catch { toast("error", t("common.saveError")); }
  }

  async function revoke(id: string) {
    const { error } = await createClient().rpc("revoke_invitation", { p_id: id });
    if (error) return toast("error", t("common.saveError"));
    toast("success", t("invite.revoked"));
    router.refresh();
  }

  async function setStatus(m: Member, status: Member["status"]) {
    const { data, error } = await createClient().from("memberships").update({ status }).eq("id", m.id).select("id");
    if (error) return toast("error", error.message || t("common.saveError"));
    if (!data?.length) return toast("error", t("common.forbidden"));
    toast("success", t("users.updated"));
    router.refresh();
  }

  async function addRole() {
    if (!rolesFor || !addRoleId) return;
    const { data: co } = await createClient().from("companies").select("id").maybeSingle();
    const { error } = await createClient().from("membership_roles").insert({
      company_id: co!.id, membership_id: rolesFor.id, role_id: addRoleId, branch_id: addBranchId || null,
    });
    if (error) return toast("error", error.code === "42501" ? t("common.forbidden") : error.code === "23505" ? t("common.saveError") : error.message);
    toast("success", t("users.roleAdded"));
    router.refresh();
  }

  async function removeRole(id: string) {
    const { error } = await createClient().from("membership_roles").delete().eq("id", id);
    if (error) return toast("error", error.code === "42501" ? t("common.forbidden") : error.message);
    toast("success", t("users.roleRemoved"));
    router.refresh();
  }

  const memberTone: Record<Member["status"], BadgeTone> = { active: "success", suspended: "warning", removed: "neutral" };
  const memberLabel: Record<Member["status"], MessageKey> = { active: "status.active", suspended: "users.suspended", removed: "users.removed" };

  function inviteStatus(i: Invitation): "pending" | "accepted" | "revoked" | "expired" {
    return i.status === "pending" && new Date(i.expires_at) < new Date() ? "expired" : i.status;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("users.title")}</h1>
          <p className="text-muted">{t("users.subtitle")}</p>
        </div>
        <Button variant="primary" onClick={openInvite} disabled={invitable.length === 0}>{t("users.invite")}</Button>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t("users.team")}</h2>
        <Table>
          <THead><TR><TH>{t("users.name")}</TH><TH>{t("users.roles")}</TH><TH>{t("common.status")}</TH><TH>{t("common.actions")}</TH></TR></THead>
          <TBody>
            {members.map((m) => (
              <TR key={m.id}>
                <TD>{m.display_name ?? "—"}{m.id === myMembershipId && <span className="ms-2 text-muted">({t("users.you")})</span>}</TD>
                <TD>{memberRoles.filter((r) => r.membership_id === m.id).map((r) => roleName(r.role_id)).join(", ")}</TD>
                <TD><Badge tone={memberTone[m.status]}>{t(memberLabel[m.status])}</Badge></TD>
                <TD>
                  <Button variant="quiet" onClick={() => { setRolesFor(m); setAddRoleId(roles[0]?.id ?? ""); setAddBranchId(""); }}>{t("users.manageRoles")}</Button>
                  {m.id !== myMembershipId && (m.status === "active"
                    ? <Button variant="quiet" onClick={() => setStatus(m, "suspended")}>{t("users.suspend")}</Button>
                    : m.status === "suspended" ? <Button variant="quiet" onClick={() => setStatus(m, "active")}>{t("users.reactivate")}</Button> : null)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t("users.invitations")}</h2>
        {invitations.length === 0 ? (
          <EmptyState title={t("users.noInvites")} />
        ) : (
          <Table>
            <THead><TR><TH>{t("users.name")}</TH><TH>{t("invite.role")}</TH><TH>{t("common.status")}</TH><TH>{t("invite.expires")}</TH><TH>{t("common.actions")}</TH></TR></THead>
            <TBody>
              {invitations.map((i) => {
                const st = inviteStatus(i);
                return (
                  <TR key={i.id}>
                    <TD>{i.label ?? "—"}</TD>
                    <TD>{roleName(i.role_id)}</TD>
                    <TD><Badge tone={st === "accepted" ? "success" : st === "pending" ? "info" : "neutral"}>{t(`invite.status.${st}` as MessageKey)}</Badge></TD>
                    <TD>{fmtDate(locale, i.expires_at)}</TD>
                    <TD>{st === "pending" && <Button variant="quiet" onClick={() => revoke(i.id)}>{t("invite.revoke")}</Button>}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </section>

      <Modal
        open={inviteOpen} onClose={() => setInviteOpen(false)} closeLabel={t("common.close")}
        title={link ? t("invite.linkTitle") : t("users.invite")}
        footer={link
          ? <><Button onClick={() => setInviteOpen(false)}>{t("common.close")}</Button><Button variant="primary" onClick={copy}>{t("invite.copy")}</Button></>
          : <><Button onClick={() => setInviteOpen(false)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} onClick={createInvite}>{t("invite.create")}</Button></>}
      >
        {link ? (
          <div className="flex flex-col gap-3">
            <p className="text-muted">{t("invite.linkBody")}</p>
            <input readOnly value={link} aria-label={t("invite.linkTitle")} onFocus={(e) => e.currentTarget.select()}
              className="h-(--control-h) w-full rounded-control border border-line-strong bg-ground px-3" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Input label={t("invite.label")} hint={t("invite.labelHint")} value={label} onChange={(e) => setLabel(e.target.value)} />
            <Select label={t("invite.role")} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {invitable.map((r) => <option key={r.id} value={r.id}>{pick(locale, r.name, r.name_local)}</option>)}
            </Select>
            <Select label={t("invite.branch")} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">{t("invite.allBranches")}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{pick(locale, b.name, b.name_local)}</option>)}
            </Select>
          </div>
        )}
      </Modal>
      <Modal
        open={rolesFor !== null} onClose={() => setRolesFor(null)} closeLabel={t("common.close")}
        title={`${t("users.rolesFor")} ${rolesFor?.display_name ?? ""}`}
        footer={<Button onClick={() => setRolesFor(null)}>{t("common.close")}</Button>}
      >
        <div className="flex flex-col gap-4">
          {rolesFor && memberRoles.filter((r) => r.membership_id === rolesFor.id).length === 0 && <p className="text-muted">{t("users.noRoles")}</p>}
          <ul className="flex flex-col gap-2">
            {rolesFor && memberRoles.filter((r) => r.membership_id === rolesFor.id).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span><strong>{roleName(r.role_id)}</strong> <span className="text-muted">· {(() => { const b = branches.find((x) => x.id === r.branch_id); return b ? pick(locale, b.name, b.name_local) : null; })() ?? t("users.roleBranchAll")}</span></span>
                <Button variant="quiet" onClick={() => removeRole(r.id)}>{t("users.removeRole")}</Button>
              </li>
            ))}
          </ul>
          <Select label={t("invite.role")} value={addRoleId} onChange={(e) => setAddRoleId(e.target.value)}>
            {roles.map((r) => <option key={r.id} value={r.id}>{pick(locale, r.name, r.name_local)}</option>)}
          </Select>
          <Select label={t("invite.branch")} value={addBranchId} onChange={(e) => setAddBranchId(e.target.value)}>
            <option value="">{t("invite.allBranches")}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{pick(locale, b.name, b.name_local)}</option>)}
          </Select>
          <div><Button variant="primary" onClick={addRole}>{t("users.addRole")}</Button></div>
        </div>
      </Modal>
    </div>
  );
}

