import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@uplif/supabase/types";

export type MyState = Database["public"]["Functions"]["attendance_my_state"]["Returns"];

/** The signed-in person's employee record and clock state. Cached for one request so the layout and the page share it. */
export const getMyState = cache(async (): Promise<MyState | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("attendance_my_state");
  if (error || !data) return null;
  return data;
});
