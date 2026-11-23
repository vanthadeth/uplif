import { store } from "@/lib/store";

export interface CustomerRow {
  id: string; code: string | null; name: string; name_local: string | null; status: string;
  phone: string | null; province: string | null; updated_at: string;
}

/** The first page of the list is kept on the phone, so the list opens without signal. */
const key = (user: string) => `uplif.orders.customers.${user}`;
export const readCustomerCache = (user: string): CustomerRow[] => {
  try { return JSON.parse(store.get(key(user)) ?? "[]") as CustomerRow[]; } catch { return []; }
};
export const writeCustomerCache = (user: string, rows: CustomerRow[]) => store.set(key(user), JSON.stringify(rows.slice(0, 100)));
