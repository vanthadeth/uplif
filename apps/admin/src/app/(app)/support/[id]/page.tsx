import { notFound } from "next/navigation";
import { loadPlatform } from "@/lib/platform";
import { ViewerView, type Snapshot } from "./view";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function SupportViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const { supabase } = await loadPlatform();
  // Each open is written to the platform log and to the company's own audit log by the database function.
  const { data, error } = await supabase.rpc("platform_support_view", { p_grant: id });
  if (error?.code === "P0002") notFound();
  return <ViewerView data={error ? null : (data as unknown as Snapshot)} />;
}
