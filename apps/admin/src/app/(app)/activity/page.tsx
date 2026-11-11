import { loadPlatform } from "@/lib/platform";
import { ActivityView } from "./view";

const PAGE = 50;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const { n } = await searchParams;
  const count = Math.min(Math.max(Number(n) || PAGE, PAGE), 200);
  const { supabase } = await loadPlatform();
  const { data, error } = await supabase.rpc("platform_list_log", { p_limit: count + 1 });
  const rows = data ?? [];
  return <ActivityView rows={rows.slice(0, count)} hasMore={rows.length > count && count < 200} next={count + PAGE} failed={!!error} />;
}
