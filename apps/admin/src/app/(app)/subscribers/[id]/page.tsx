import { notFound } from "next/navigation";
import { loadPlatform } from "@/lib/platform";
import { SubscriberView } from "./view";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function SubscriberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const { supabase } = await loadPlatform();
  // Opening a subscriber is written to the platform log by the database function.
  const [sub, plans] = await Promise.all([supabase.rpc("platform_get_subscriber", { p_owner: id }), supabase.rpc("platform_list_plans")]);
  if (sub.error?.code === "P0002") notFound();
  return <SubscriberView data={sub.data as never} plans={plans.data ?? []} ownerId={id} failed={!!sub.error || !sub.data} />;
}
