/** Rows from sales_plan_day and sales_task_list. */
export interface PlanStop {
  id: string; customer_id: string; name: string; name_local: string | null; address: string | null;
  planned_time: string | null; kind: "planned" | "appointment" | "assigned" | "delivery" | "collection"; note: string | null;
  visited: boolean; last_visit_at: string | null;
}
export interface TaskRow { id: string; title: string; due_date: string; done_at: string | null; customer_id: string | null; name: string | null; name_local: string | null }

/** Today as YYYY-MM-DD on this phone, not in UTC. */
export const ymd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
/** Whole days from today to a YYYY-MM-DD day: negative when it has passed. */
export const daysFrom = (day: string) => Math.round((new Date(`${day}T00:00:00`).getTime() - new Date(`${ymd()}T00:00:00`).getTime()) / 86400000);
