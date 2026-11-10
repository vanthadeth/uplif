import { redirect } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { nextStep } from "@/lib/auth/next-step";

export default async function Home() {
  const { state } = await loadSession();
  redirect(nextStep(state));
}
