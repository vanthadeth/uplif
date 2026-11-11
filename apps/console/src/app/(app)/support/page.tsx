import { loadSession } from "@/lib/auth/session";
import { SupportView } from "./view";

export default async function SupportPage() {
  const { supabase, isOwner } = await loadSession();
  if (!isOwner) return <SupportView isOwner={false} grants={[]} failed={false} />;
  const { data, error } = await supabase.rpc("my_support_grants");
  return <SupportView isOwner grants={data ?? []} failed={!!error} />;
}
