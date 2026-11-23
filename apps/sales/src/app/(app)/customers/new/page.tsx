import { redirect } from "next/navigation";
import { getSalesState } from "@/lib/my-state";
import { CustomerForm } from "@/components/customer-form";

export default async function NewCustomerPage() {
  const state = await getSalesState();
  if (!state?.can_create) redirect("/customers");
  return <CustomerForm />;
}
