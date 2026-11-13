import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface SalesState {
  linked: boolean;
  module?: boolean;
  employee_id?: string;
  employee_name?: string;
  employee_name_local?: string | null;
  active?: boolean;
  company_id?: string;
  company_name?: string;
  can_read?: boolean;
  can_create?: boolean;
  can_update?: boolean;
  can_manage?: boolean;
}

/** The signed-in person's employee record, plan check and customer permissions. Cached for one request. */
export const getSalesState = cache(async (): Promise<SalesState | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sales_my_state");
  if (error || !data) return null;
  return data as unknown as SalesState;
});
