import { redirect } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { InviteView, type Preview } from "./view";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const here = `/invite/${encodeURIComponent(token)}`;
  const { supabase, state } = await loadSession();
  // The link itself says who the invitation is for, so it can be previewed before signing in.
  const { data } = await supabase.rpc("preview_invitation", { p_token: token });
  const preview = (data?.[0] as Preview | undefined) ?? null;
  // Someone signed in without a profile gives their name first; the profile page returns here.
  if (preview?.state === "pending" && state.signedIn && !state.hasProfile) redirect(`/profile?next=${encodeURIComponent(here)}`);
  return <InviteView token={token} preview={preview} signedIn={state.signedIn} />;
}
