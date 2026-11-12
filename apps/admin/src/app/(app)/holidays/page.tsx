import { loadPlatform } from "@/lib/platform";
import { HolidaysView, type Overview } from "./view";

export default async function HolidaysPage() {
  const { supabase } = await loadPlatform();
  const { data, error } = await supabase.rpc("platform_holiday_overview");
  return <HolidaysView data={error ? null : (data as unknown as Overview)} />;
}
