import { loadSignInMethods } from "@uplif/auth/server";
import { loadSession } from "@/lib/auth/session";
import { AccountView } from "./view";

export default async function AccountPage() {
  const { supabase } = await loadSession();
  const { methods, failed } = await loadSignInMethods(supabase);
  return <AccountView methods={methods} failed={failed} />;
}
