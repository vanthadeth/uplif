import LogForm from "@/components/log-form";

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LogForm type="call" customerId={id} />;
}
