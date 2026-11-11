import type { Database } from "@uplif/supabase/types";

type Fn = Database["public"]["Functions"];
export type Plan = Fn["platform_list_plans"]["Returns"][number];
export type Subscriber = Fn["platform_list_subscribers"]["Returns"][number];
