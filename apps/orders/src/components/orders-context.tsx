"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { OrdersState } from "@/lib/orders-state";

const Ctx = createContext<OrdersState | null>(null);
export const OrdersProvider = ({ state, children }: { state: OrdersState; children: ReactNode }) => <Ctx.Provider value={state}>{children}</Ctx.Provider>;
export function useOrders(): OrdersState {
  const s = useContext(Ctx);
  if (!s) throw new Error("useOrders outside OrdersProvider");
  return s;
}
