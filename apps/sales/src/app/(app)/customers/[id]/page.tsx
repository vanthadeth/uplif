import { CustomerView } from "@/components/customer-view";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerView id={id} />;
}
