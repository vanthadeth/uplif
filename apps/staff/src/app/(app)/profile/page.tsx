import { loadSignInMethods } from "@uplif/auth/server";
import { createClient } from "@/lib/supabase/server";
import { ProfileView } from "@/components/profile-view";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { methods, failed } = await loadSignInMethods(supabase);
  return <ProfileView methods={methods} failed={failed} />;
}
