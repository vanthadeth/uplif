import type { Database } from "@uplif/supabase/types";

type Fn = Database["public"]["Functions"];
export type Plan = Fn["platform_list_plans"]["Returns"][number];
export type Subscriber = Fn["platform_list_subscribers"]["Returns"][number];
export type Invoice = Fn["platform_list_invoices"]["Returns"][number];
export type SupportGrant = Fn["platform_list_support_grants"]["Returns"][number];
export type LogEntry = Fn["platform_list_log"]["Returns"][number];
