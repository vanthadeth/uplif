import { requireStep } from "@/lib/auth/session";
import { ProfileForm } from "./form";

export default async function ProfilePage() {
  await requireStep("/profile");
  return <ProfileForm />;
}
