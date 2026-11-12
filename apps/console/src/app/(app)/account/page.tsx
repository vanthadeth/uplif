import { loadSession } from "@/lib/auth/session";
import { AccountView, type Methods } from "./view";

export default async function AccountPage() {
  const { supabase } = await loadSession();
  const { data, error } = await supabase.rpc("my_sign_in_methods");
  return <AccountView methods={(data as unknown as Methods | null) ?? null} failed={!!error} />;
}
