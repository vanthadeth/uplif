import { loadSignInMethods } from "@uplif/auth/server";
import { loadPlatform } from "@/lib/platform";
import { AccountView } from "./view";

export default async function AccountPage() {
  const { supabase } = await loadPlatform();
  const { methods, failed } = await loadSignInMethods(supabase);
  return <AccountView methods={methods} failed={failed} />;
}
