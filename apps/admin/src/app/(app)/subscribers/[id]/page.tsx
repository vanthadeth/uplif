import { notFound } from "next/navigation";
import { loadPlatform } from "@/lib/platform";
import { SubscriberView } from "./view";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function SubscriberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const { supabase } = await loadPlatform();
  // Opening a subscriber is written to the platform log by the database function.
  const [sub, plans, invoices, grants] = await Promise.all([supabase.rpc("platform_get_subscriber", { p_owner: id }), supabase.rpc("platform_list_plans"), supabase.rpc("platform_list_invoices"), supabase.rpc("platform_list_support_grants")]);
  if (sub.error?.code === "P0002") notFound();
  return <SubscriberView data={sub.data as never} plans={plans.data ?? []} invoices={(invoices.data ?? []).filter((i) => i.owner_user_id === id)} grants={grants.data ?? []} ownerId={id} failed={!!sub.error || !sub.data} />;
}
