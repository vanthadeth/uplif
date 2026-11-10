import { redirect } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { InviteView } from "./view";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const here = `/invite/${encodeURIComponent(token)}`;
  const { supabase, state } = await loadSession();
  if (!state.signedIn) redirect(`/login?next=${encodeURIComponent(here)}`);
  if (!state.hasProfile) redirect(`/profile?next=${encodeURIComponent(here)}`);
  const { data } = await supabase.rpc("preview_invitation", { p_token: token });
  return <InviteView token={token} preview={data?.[0] ?? null} />;
}
