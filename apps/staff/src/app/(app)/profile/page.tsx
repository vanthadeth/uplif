import { loadSignInMethods } from "@uplif/auth/server";
import { createClient } from "@/lib/supabase/server";
import { ProfileView } from "@/components/profile-view";

export default async function ProfilePage() {
  const supabase = await createClient();
  const [{ methods, failed }, personal] = await Promise.all([loadSignInMethods(supabase), supabase.rpc("my_personal")]);
  return <ProfileView methods={methods} failed={failed} personal={personal.data ?? null} />;
}
