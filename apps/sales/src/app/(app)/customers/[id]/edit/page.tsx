import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSalesState } from "@/lib/my-state";
import { CustomerForm } from "@/components/customer-form";
import type { CustomerDetail } from "@/lib/customers";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await getSalesState();
  if (!uuid.test(id)) notFound();
  if (!state?.can_update) redirect(`/customers/${id}/details`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("sales_customer_detail", { p_id: id });
  if (!data) notFound();
  return <CustomerForm initial={data as unknown as CustomerDetail} />;
}
